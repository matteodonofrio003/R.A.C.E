/* Pure simulation helpers, shared by the browser and deterministic tests. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function decodeTelemetry(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 1024) return null;
    const p = JSON.parse(raw);
    if (!p || !Number.isFinite(p.speed) || p.speed < 0 || p.speed > 360 ||
        !Number.isFinite(p.steer) || Math.abs(p.steer) > 100 ||
        !Number.isInteger(p.gear) || p.gear !== 1 ||
        typeof p.cockpit !== 'boolean' || !Number.isFinite(p.rpm) ||
        p.rpm < 1000 || p.rpm > 8000 ||
        !Number.isInteger(p.session) || p.session < 0 || p.session > 65535 ||
        typeof p.feedback !== 'boolean' || typeof p.alarm !== 'boolean') return null;
    return p;
  } catch { return null; }
}
export function nearestTrack(points, x, z) {
  let best = Infinity, result;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length2, 0, 1);
    const px = a.x + t * dx, pz = a.z + t * dz;
    const distance2 = (x - px) ** 2 + (z - pz) ** 2;
    if (distance2 < best) {
      best = distance2;
      result = { x: px, z: pz, distance: Math.sqrt(best),
        progress: ((i + t) / n) % 1, heading: Math.atan2(dx, -dz) };
    }
  }
  return result;
}
export function driveStep(car, speed, steer, dt) {
  const velocity = speed / 3.6;
  // Joystick position represents steering-wheel angle, not a lateral position.
  car.wheelAngle = steer * .22 / (1 + velocity * .035);
  const yawRate = velocity * Math.tan(car.wheelAngle) / 2.7;
  const gripLimit = 10 / Math.max(velocity, 1);
  car.heading += clamp(yawRate, -gripLimit, gripLimit) * dt;
  car.heading = Math.atan2(Math.sin(car.heading), Math.cos(car.heading));
  car.x += Math.sin(car.heading) * velocity * dt;
  car.z -= Math.cos(car.heading) * velocity * dt;
}
export function shapeSteering(raw, { center = 0, left = -100, right = 100, deadzone = 0, sensitivity = 1, invert = false } = {}) {
  const orientation = right > center ? 1 : -1;
  const delta = (raw - center) * orientation;
  const magnitude = Math.max(0, Math.abs(delta) - deadzone);
  if (magnitude === 0) return 0;
  const span = Math.abs((delta >= 0 ? right : left) - center) - deadzone;
  const x = clamp(magnitude / Math.max(span, 1), 0, 1);
  // Linear near the centre: do not erase 1%, 2%, 3% stick movements.
  return clamp(Math.sign(delta) * x * sensitivity * (invert ? -1 : 1), -1, 1);
}
export function calibrateSteering(center, left, right) {
  if (![center,left,right].every(Number.isFinite) || Math.abs(center)>30 ||
      Math.abs(left)>100 || Math.abs(right)>100 ||
      Math.abs(left-center)<20 || Math.abs(right-center)<20 ||
      (left-center)*(right-center)>=0) return null;
  return {center,left,right,invert:false};
}
export function approachSteering(current, target, dt) {
  const change=(target-current)*(1-Math.exp(-14*dt));
  return current+clamp(change,-1.6*dt,1.6*dt);
}
export class SessionReset {
  constructor() { this.pending = false; this.token = null; }
  request(currentSession = null) {
    this.pending = true;
    this.token = currentSession === null ? null : (currentSession + 1) & 65535;
  }
  observe(packet) {
    if (!this.pending) { this.token = packet.session; return; }
    if (this.token === null) { this.token = (packet.session + 1) & 65535; return; }
    // An old packet with zero speed is NOT an acknowledgement.
    // ECU2 publishes this token only after applying the reset atomically.
    // A delayed acknowledgement can already contain a new acceleration.
    if (packet.session === this.token) this.pending = false;
  }
  cancel() { this.pending = false; this.token = null; }
}
export class LapTimer {
  constructor() { this.reset(); }
  reset() {
    this.laps = 0; this.best = null; this.last = null;
    this.resetSession();
  }
  resetSession() {
    this.elapsed = 0; this.sessionTime = 0; this.distance = 0;
    this.started = false; this.valid = true; this.nextGate = 1;
    this.previousProgress = null;
  }
  restore(records) {
    if (!records || !Number.isInteger(records.laps) || records.laps < 0 ||
        records.laps > 100000) return false;
    const validTime = value => value === null ||
      (Number.isFinite(value) && value > 0 && value < 86400);
    const validLast=records.last===null||(typeof records.last==='object' &&
      Number.isFinite(records.last.time)&&records.last.time>0&&records.last.time<86400&&
      typeof records.last.valid==='boolean');
    if (!validTime(records.best) || !validLast) return false;
    this.laps = records.laps;
    this.best = records.best;
    this.last = records.last;
    return true;
  }
  snapshot() {
    return {laps:this.laps,best:this.best,last:this.last};
  }
  invalidate() { if (this.started) this.valid = false; }
  step(dt, metres, progress, offtrack, forward) {
    if (metres > .001 && !this.started) {
      this.started = true;
      this.previousProgress = progress;
    }
    if (!this.started) return null;
    this.elapsed += dt; this.sessionTime += dt; this.distance += metres;
    if (offtrack) this.valid = false;
    if (this.previousProgress === null) {
      this.previousProgress = progress;
      return null;
    }
    const advance = (progress - this.previousProgress + 1) % 1;
    let completed = null;
    // More than half a circuit in one sample is a projection jump or reverse motion.
    if (forward && advance > 0 && advance < .5) {
      for (let guard=0;guard<16;guard++) {
        const gateProgress=this.nextGate===0?0:this.nextGate/16;
        const gateDistance=(gateProgress-this.previousProgress+1)%1;
        if (gateDistance > advance + 1e-6 || gateDistance < 1e-6) break;
        if (this.nextGate === 0) {
          this.laps++;
          this.last={time:this.elapsed,valid:this.valid};
          const newBest=this.valid&&(this.best===null||this.elapsed<this.best);
          if(newBest)this.best=this.elapsed;
          completed={...this.last,lap:this.laps,newBest};
          this.elapsed=0;this.valid=!offtrack;this.nextGate=1;
        } else this.nextGate=(this.nextGate+1)%16;
      }
    }
    this.previousProgress=progress;
    return completed;
  }
  get average() { return this.sessionTime ? this.distance / this.sessionTime * 3.6 : 0; }
}
export function formatTime(seconds) {
  if (seconds === null) return '--:--.---';
  const ms = Math.floor(seconds * 1000);
  return String(Math.floor(ms / 60000)).padStart(2, '0') + ':' +
    String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}
