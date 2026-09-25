import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTelemetry, driveStep, nearestTrack, LapTimer, formatTime, shapeSteering, calibrateSteering, approachSteering, SessionReset } from '../game/js/core/racing-core.mjs';

test('v3 telemetry validates boundaries and rejects legacy or malformed frames', () => {
  const frame = { speed: 360, steer: -100, rpm: 8000, gear: 1, cockpit: true, session: 65535, feedback: true, alarm: false };
  assert.deepEqual(decodeTelemetry(JSON.stringify(frame)), frame);
  for (const changes of [{speed:361},{steer:101},{gear:0},{gear:6},{rpm:Infinity},{cockpit:1},{speed:'80'},
    {session:65536},{session:-1},{session:1.5},{feedback:1},{alarm:null}]) {
    assert.equal(decodeTelemetry(JSON.stringify({...frame,...changes})),null);
  }
  assert.equal(decodeTelemetry('{"speed":200,"rpm":8000}'),null);
  assert.equal(decodeTelemetry('{'),null);
});

test('analog steering retains every one-percent input, including micro corrections', () => {
  assert.equal(shapeSteering(0),0);
  assert.equal(shapeSteering(100),1);
  assert.equal(shapeSteering(-100),-1);
  assert.equal(shapeSteering(1),.01);
  assert.equal(shapeSteering(-2),-.02);
  assert.equal(shapeSteering(40),-shapeSteering(-40));
  assert.equal(shapeSteering(40),.4);
  assert.equal(shapeSteering(14,{center:12,deadzone:3}),0);
  assert.equal(shapeSteering(-100,{center:12,sensitivity:1}),-1);
  assert.equal(shapeSteering(100,{center:12,sensitivity:1,invert:true}),-1);
  let previous=-1;
  for(let raw=-99;raw<=100;raw++){const value=shapeSteering(raw);assert.ok(value>previous);previous=value;}
});

test('three-point calibration learns reversed and asymmetric physical joystick travel', () => {
  const calibration=calibrateSteering(4,88,-76);
  assert.ok(calibration);
  assert.equal(shapeSteering(88,calibration),-1);
  assert.equal(shapeSteering(-76,calibration),1);
  assert.equal(shapeSteering(4,calibration),0);
  assert.equal(shapeSteering(-36,calibration),.5);
  assert.equal(shapeSteering(46,calibration),-.5);
  assert.equal(calibrateSteering(0,0,0),null);
  assert.equal(calibrateSteering(0,60,80),null);
  assert.equal(calibrateSteering(0,-2,2),null);
});

test('steering slew limits sudden throws without discarding small targets', () => {
  assert.ok(approachSteering(0,1,.01)<=.0161);
  assert.ok(approachSteering(0,.01,.01)>0);
  let value=0;
  for(let i=0;i<120;i++)value=approachSteering(value,.01,1/120);
  assert.ok(Math.abs(value-.01)<.000001);
});

test('new sessions require the new ECU acknowledgement, never a cached zero-speed packet', () => {
  const reset=new SessionReset();
  reset.request(42);assert.equal(reset.token,43);
  reset.observe({session:42,speed:0});assert.equal(reset.pending,true);
  reset.observe({session:42,speed:200});assert.equal(reset.pending,true);
  reset.observe({session:43,speed:0});assert.equal(reset.pending,false);
  reset.request(65535);assert.equal(reset.token,0);
  // A delayed ACK still proves the reset happened, even after new acceleration.
  reset.observe({session:0,speed:3});assert.equal(reset.pending,false);
});

test('session requested before the link opens learns the token and survives old frames', () => {
  const reset=new SessionReset();
  reset.request();assert.equal(reset.token,null);
  reset.observe({session:5,speed:180});assert.equal(reset.token,6);assert.equal(reset.pending,true);
  reset.observe({session:5,speed:180});assert.equal(reset.pending,true);
  reset.observe({session:6,speed:0});assert.equal(reset.pending,false);
  reset.cancel();assert.equal(reset.token,null);
});

test('joystick is a wheel: no stationary strafe; release retains heading', () => {
  const car = {x:0,z:0,heading:0};
  driveStep(car,0,1,1);assert.equal(car.x,0);assert.equal(car.heading,0);
  for(let i=0;i<120;i++)driveStep(car,60,1,1/120);
  assert.ok(car.x>0);assert.ok(car.heading>0);
  const heading=car.heading;
  driveStep(car,60,0,.1);assert.equal(car.heading,heading);
});

test('track projection includes closure and returns distance outside track', () => {
  const points=[{x:0,z:0},{x:0,z:-100},{x:100,z:-100},{x:100,z:0}];
  assert.equal(nearestTrack(points,50,4).distance,4);
  assert.equal(nearestTrack(points,50,4).progress,.875);
});

test('lap requires all sixteen forward checkpoints; average includes stopped time', () => {
  const timer=new LapTimer();
  timer.step(1,20,.01,false,true);
  timer.step(2,0,.01,false,true);
  assert.equal(timer.average,24);
  // Crossing finish or driving backwards cannot invent a completed lap.
  timer.step(1,20,.99,false,false);
  timer.step(1,20,0,false,true);
  assert.equal(timer.laps,0);
  for(let i=1;i<=16;i++)timer.step(1,20,(i%16)/16,false,true);
  assert.equal(timer.laps,1);assert.ok(timer.best>0);
});

test('lap detection accepts skipped projection sectors but rejects reverse jumps', () => {
  const timer=new LapTimer();
  timer.step(.1,4,.01,false,true);
  timer.step(.1,4,.26,false,true);
  assert.equal(timer.nextGate,5);
  timer.step(.1,4,.20,false,false);
  assert.equal(timer.nextGate,5);
  timer.step(.1,4,.51,false,true);
  assert.equal(timer.nextGate,9);
  timer.step(.1,4,.76,false,true);
  assert.equal(timer.nextGate,13);
  const completed=timer.step(.1,4,.01,false,true);
  assert.equal(completed.lap,1);
  assert.equal(completed.valid,true);
  assert.equal(completed.newBest,true);
});

test('lap records survive a session reset and validate persisted data', () => {
  const timer=new LapTimer();
  timer.step(1,10,.01,false,true);
  for(let i=1;i<=16;i++)timer.step(1,10,(i%16)/16,false,true);
  const saved=timer.snapshot();
  timer.resetSession();
  assert.equal(timer.laps,1);assert.equal(timer.best,saved.best);assert.deepEqual(timer.last,saved.last);
  assert.equal(timer.elapsed,0);assert.equal(timer.average,0);
  const restored=new LapTimer();
  assert.equal(restored.restore(saved),true);assert.deepEqual(restored.snapshot(),saved);
  assert.equal(restored.restore({laps:-1,best:1,last:null}),false);
  assert.equal(restored.restore({laps:1,best:1,last:{time:null,valid:true}}),false);
});

test('off-track lap still counts but cannot set best time', () => {
  const timer=new LapTimer();
  timer.step(1,10,.01,true,true);
  for(let i=1;i<=16;i++)timer.step(1,10,(i%16)/16,false,true);
  assert.equal(timer.laps,1);assert.equal(timer.best,null);assert.equal(timer.last.valid,false);
  assert.equal(formatTime(61.234),'01:01.234');
  timer.reset();assert.equal(timer.average,0);assert.equal(timer.laps,0);
});
