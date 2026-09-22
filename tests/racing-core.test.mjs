import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTelemetry, driveStep, nearestTrack, LapTimer, formatTime, shapeSteering, SessionReset } from '../racing-core.mjs';

test('v3 telemetry validates boundaries and rejects legacy or malformed frames', () => {
  const frame = { speed: 360, steer: -100, rpm: 8000, gear: 6, cockpit: true, session: 65535, feedback: true, alarm: false };
  assert.deepEqual(decodeTelemetry(JSON.stringify(frame)), frame);
  for (const changes of [{speed:361},{steer:101},{gear:0},{rpm:Infinity},{cockpit:1},{speed:'80'},
    {session:65536},{session:-1},{session:1.5},{feedback:1},{alarm:null}]) {
    assert.equal(decodeTelemetry(JSON.stringify({...frame,...changes})),null);
  }
  assert.equal(decodeTelemetry('{"speed":200,"rpm":8000}'),null);
  assert.equal(decodeTelemetry('{'),null);
});

test('steering calibration has a deadzone, progressive response and independent endpoints', () => {
  for(let raw=-3;raw<=3;raw++)assert.equal(Math.abs(shapeSteering(raw)),0);
  assert.equal(shapeSteering(100),.8);
  assert.equal(shapeSteering(-100),-.8);
  assert.equal(shapeSteering(40),-shapeSteering(-40));
  assert.ok(shapeSteering(40)<.4*.8);
  assert.equal(shapeSteering(14,{center:12,deadzone:3}),0);
  assert.equal(shapeSteering(-100,{center:12,sensitivity:1}),-1);
  assert.equal(shapeSteering(100,{center:12,sensitivity:1,invert:true}),-1);
  let previous=-1;
  for(let raw=-100;raw<=100;raw++){const value=shapeSteering(raw);assert.ok(value>=previous);previous=value;}
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

test('off-track lap still counts but cannot set best time', () => {
  const timer=new LapTimer();
  timer.step(1,10,.01,true,true);
  for(let i=1;i<=16;i++)timer.step(1,10,(i%16)/16,false,true);
  assert.equal(timer.laps,1);assert.equal(timer.best,null);assert.equal(timer.last.valid,false);
  assert.equal(formatTime(61.234),'01:01.234');
  timer.reset();assert.equal(timer.average,0);assert.equal(timer.laps,0);
});
