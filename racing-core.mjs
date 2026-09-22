/* Pure simulation helpers, shared by the browser and deterministic tests. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const GEAR_LIMITS = [75, 125, 180, 240, 300, 360];
export const GEAR_ACCEL = [38, 29, 22, 18, 14, 11];
export function decodeTelemetry(raw) {
  try {
    if (typeof raw !== 'string' || raw.length > 1024) return null;
    const p = JSON.parse(raw);
    if (!p || !Number.isFinite(p.speed) || p.speed < 0 || p.speed > 360 ||
        !Number.isFinite(p.steer) || Math.abs(p.steer) > 100 ||
        !Number.isInteger(p.gear) || p.gear < 1 || p.gear > 6 ||
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
  car.wheelAngle = steer * .55 / (1 + velocity * .035);
  const yawRate = velocity * Math.tan(car.wheelAngle) / 2.7;
  const gripLimit = 18 / Math.max(velocity, 1);
  car.heading += clamp(yawRate, -gripLimit, gripLimit) * dt;
  car.heading = Math.atan2(Math.sin(car.heading), Math.cos(car.heading));
  car.x += Math.sin(car.heading) * velocity * dt;
  car.z -= Math.cos(car.heading) * velocity * dt;
}
export function shapeSteering(raw, { center = 0, deadzone = 3, sensitivity = .8, invert = false } = {}) {
  const delta = raw - center;
  const magnitude = Math.max(0, Math.abs(delta) - deadzone);
  const span = (delta >= 0 ? 100 - center : 100 + center) - deadzone;
  const x = clamp(magnitude / Math.max(span, 1), 0, 1);
  const curve = (.35 * x + .65 * x * x * x) * sensitivity;
  return clamp(Math.sign(delta) * curve * (invert ? -1 : 1), -1, 1);
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
    this.laps = 0; this.elapsed = 0; this.sessionTime = 0; this.distance = 0;
    this.best = null; this.last = null; this.started = false;
    this.valid = true; this.nextGate = 1; this.sector = 0;
  }
  invalidate() { if (this.started) this.valid = false; }
  step(dt, metres, progress, offtrack, forward) {
    if (metres > .001) this.started = true;
    if (!this.started) return;
    this.elapsed += dt; this.sessionTime += dt; this.distance += metres;
    if (offtrack) this.valid = false;
    const sector = Math.floor(progress * 16) % 16;
    if (sector !== this.sector && forward && !offtrack && sector === this.nextGate) {
      this.nextGate = (this.nextGate + 1) % 16;
      if (sector === 0) {
        this.laps++;
        this.last = { time: this.elapsed, valid: this.valid };
        if (this.valid && (this.best === null || this.elapsed < this.best)) this.best = this.elapsed;
        this.elapsed = 0; this.valid = true;
      }
    }
    this.sector = sector;
  }
  get average() { return this.sessionTime ? this.distance / this.sessionTime * 3.6 : 0; }
}
export function formatTime(seconds) {
  if (seconds === null) return '--:--.---';
  const ms = Math.floor(seconds * 1000);
  return String(Math.floor(ms / 60000)).padStart(2, '0') + ':' +
    String(Math.floor(ms / 1000) % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}
