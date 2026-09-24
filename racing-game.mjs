import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { clamp, decodeTelemetry, driveStep, nearestTrack, LapTimer, formatTime, shapeSteering, calibrateSteering, approachSteering, SessionReset } from './racing-core.mjs';
import { RacingAudio } from './racing-audio.mjs';
import { addScenery } from './racing-scenery.mjs';
import { scannedMaterial } from './racing-materials.mjs';

const $ = id => document.getElementById(id);
const keys = new Set();
const timing = new LapTimer();
const LAP_RECORDS_KEY='race-lap-records-v1';
try { timing.restore(JSON.parse(localStorage.getItem(LAP_RECORDS_KEY))); } catch {}
const saveLapRecords=()=>{try{localStorage.setItem(LAP_RECORDS_KEY,JSON.stringify(timing.snapshot()));}catch{}};
const input = { speed: 0, steer: 0, rpm: 1000, cockpit: false, session: 0, feedback: false, alarm: false };
const resetGate = new SessionReset(), audio = new RacingAudio(), steeringSamples = [];
const settings = { center: 0, left: -100, right: 100, deadzone: 0, sensitivity: 1, invert: false };
let calibrationStep=0, calibrationCenter=0, calibrationLeft=0;
let testAlarmUntil = 0;
try {
  const saved = JSON.parse(localStorage.getItem('race-controls-v5'));
  if (saved && calibrateSteering(saved.center,saved.left,saved.right) &&
      Number.isFinite(saved.deadzone) && saved.deadzone >= 0 && saved.deadzone <= 12 &&
      Number.isFinite(saved.sensitivity) && saved.sensitivity >= .4 && saved.sensitivity <= 1.4 &&
      typeof saved.invert === 'boolean') Object.assign(settings, saved);
} catch { /* Storage may be unavailable on a restricted browser. */ }
let demo = false, demoSpeed = 0, lastPacket = -Infinity;
let connected = false, socket, reconnectTimer, connectTimer, retry = 1000, stopped = false;
let offtrack = false, speed = 0, steer = 0, paused = false;
const carState = { x: 0, z: 0, heading: 0, wheelAngle: 0 };
const HALF_WIDTH = 10;
const fresh = () => connected && input.cockpit && performance.now() - lastPacket < 700;

function connect() {
  if (stopped) return;
  try {
    socket = new WebSocket('ws://192.168.4.1/ws');
    connectTimer = setTimeout(() => { if (socket.readyState === 0) socket.close(); }, 6000);
    socket.onopen = () => { connected = true; retry = 1000; clearTimeout(connectTimer); };
    socket.onmessage = e => {
      const packet = decodeTelemetry(e.data);
      if (packet) {
        Object.assign(input, packet); lastPacket = performance.now();
        if (!demo) resetGate.observe(packet);
        steeringSamples.push({ time: lastPacket, value: packet.steer });
        while (steeringSamples.length && steeringSamples[0].time < lastPacket - 1500) steeringSamples.shift();
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      connected = false; lastPacket = -Infinity;
      clearTimeout(connectTimer);
      if (!stopped) reconnectTimer = setTimeout(connect, retry);
      retry = Math.min(8000, retry * 1.5);
    };
  } catch {
    if (!stopped) reconnectTimer = setTimeout(connect, 2000);
  }
}
function feedback(value) {
  const session = demo ? input.session : resetGate.token;
  if (socket?.readyState === 1 && session !== null && performance.now() - lastPacket < 700) {
    socket.send(JSON.stringify({ offtrack: value, session }));
  }
}
// The hardware alarm is leased: demo, hidden tabs and stale input always send false.
const heartbeat = setInterval(() => feedback(!demo && fresh() && !resetGate.pending &&
  (offtrack || performance.now() < testAlarmUntil) && !document.hidden), 100);
connect();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .98;
$('scene').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b5c9d4');
scene.fog = new THREE.Fog('#b5c9d4', 350, 1900);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .04, 4000);
scene.add(camera);
scene.add(new THREE.HemisphereLight('#d5eaff', '#666347', .65));
const sun = new THREE.DirectionalLight('#fff2dc', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 50, bottom: -50, near: 1, far: 180 });
sun.shadow.normalBias = .025;
scene.add(sun, sun.target);
const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec3 p;void main(){float h=normalize(p).y;gl_FragColor=vec4(mix(vec3(.82,.63,.42),vec3(.12,.34,.52),smoothstep(0.,.8,h)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
}));
scene.add(sky);
const environmentScene = new THREE.Scene();
environmentScene.add(sky.clone());
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(environmentScene, .06, .1, 1800);
scene.environment = environment.texture;
pmrem.dispose();
new HDRLoader().load('./assets/environment/kloppenheim_06_puresky_1k.hdr',texture=>{
  texture.mapping=THREE.EquirectangularReflectionMapping;
  scene.background=texture;scene.environment=texture;
  scene.environmentIntensity=.7;scene.backgroundIntensity=.85;
  sky.visible=false;environment.dispose();
  document.body.dataset.environment='hdr';
},undefined,error=>console.warn('Local HDR sky unavailable; using fallback.',error));

const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .8, ...extra });
const cube = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, size, pos, shadows = true) {
  const mesh = new THREE.Mesh(cube, mat);
  mesh.scale.set(...size); mesh.position.set(...pos);
  mesh.castShadow = shadows; mesh.receiveShadow = true; parent.add(mesh);
  return mesh;
}
const roadCurve = new THREE.CatmullRomCurve3([
  [0,0], [0,-250], [130,-380], [400,-330], [490,-100],
  [330,80], [420,290], [160,400], [-60,320], [0,180]
].map(([x,z]) => new THREE.Vector3(x,0,z)), true, 'centripetal');
const length = roadCurve.getLength();
const points = roadCurve.getSpacedPoints(768).slice(0, -1);
const scenery=addScenery(scene, points);
const normals = points.map((p,i) => {
  const tangent = points[(i + 1) % points.length].clone().sub(points[(i - 1 + points.length) % points.length]).normalize();
  return new THREE.Vector3(-tangent.z, 0, tangent.x);
});
function ribbon(left, right, height, mat, kerb = false) {
  const positions = [], uvs = [], colors = [], indices = [];
  const red = new THREE.Color('#de4f32'), white = new THREE.Color('#f7efda');
  for (let i = 0; i <= points.length; i++) {
    const p = points[i % points.length], n = normals[i % points.length];
    const color = Math.floor(i / 2) % 2 ? red : white;
    for (const [edge, u] of [[left,0],[right,1]]) {
      positions.push(p.x + n.x * edge, height, p.z + n.z * edge);
      uvs.push(u * 4, i / points.length * length / 6);
      colors.push(color.r, color.g, color.b);
    }
    if (i < points.length) { const a = i * 2; indices.push(a,a+1,a+2,a+1,a+3,a+2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2));
  if (kerb) geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry,mat); mesh.receiveShadow = true; scene.add(mesh);
}
ribbon(-15,15,.01,scannedMaterial('aerial_grass_rock',{color:'#c5bda2'}));
ribbon(-10,10,.035,scannedMaterial('aerial_asphalt_01',{
  color:'#9a9f9d',normalScale:new THREE.Vector2(.18,.18),envMapIntensity:.35
}));
ribbon(-11,-10,.05,material('#ffffff',{vertexColors:true}),true);
ribbon(10,11,.05,material('#ffffff',{vertexColors:true}),true);
const white = material('#fff3d8');
ribbon(-9.5,-9.35,.045,white); ribbon(9.35,9.5,.045,white);

const concrete = material('#bcc2b6'), metal = material('#28383b',{metalness:.5,roughness:.4});
for (let i = 0; i < 8; i++) {
  box(scene,concrete,[12,5,11],[-29,2.5,-80 + i*12]);
  box(scene,metal,[.08,3.5,8],[-22.95,1.8,-80 + i*12]);
  box(scene,white,[13,.25,12],[-29,5.1,-80 + i*12]);
}
function signTexture(text) {
  const canvas = document.createElement('canvas'); canvas.width=1024;canvas.height=128;
  const c=canvas.getContext('2d');c.fillStyle='#142a31';c.fillRect(0,0,1024,128);
  c.fillStyle='#dcff74';c.font='bold italic 70px sans-serif';c.textAlign='center';c.fillText(text,512,88);
  const texture = new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const gantry = new THREE.Group(); scene.add(gantry);
const startHeading = nearestTrack(points,0,0).heading;
gantry.rotation.y = -startHeading;
box(gantry,metal,[.5,8,.5],[-12,4,0]);box(gantry,metal,[.5,8,.5],[12,4,0]);
box(gantry,material('#ffffff',{map:signTexture('R.A.C.E.  /  APEX CIRCUIT')}),[24,1.8,.3],[0,7.4,0]);
for (let i=0;i<20;i++) for(let j=0;j<2;j++) {
  box(gantry,(i+j)%2?metal:white,[1,.015,1],[-9.5+i,.055,j-.5],false);
}

const car = new THREE.Group(), body = new THREE.Group(), fallback = new THREE.Group();
car.add(body);body.add(fallback);scene.add(car);
const paint = new THREE.MeshPhysicalMaterial({color:'#c3271b',metalness:.7,roughness:.27,clearcoat:1});
box(fallback,paint,[1.95,.45,4.4],[0,.65,0]);
box(fallback,material('#112a35',{metalness:.5,roughness:.1}),[1.65,.6,1.9],[0,1.1,.2]);
box(fallback,paint,[1.6,.08,1.2],[0,1.41,.3]);
box(fallback,material('#ff3222',{emissive:'#ff1505',emissiveIntensity:2}),[1.6,.08,.05],[0,.75,2.22]);
let wheelParts = [];
for (const x of [-1,1]) for (const z of [-1.4,1.3]) {
  const pivot = new THREE.Group();pivot.position.set(x,.38,z);fallback.add(pivot);
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.25,16),material('#15191a'));
  wheel.rotation.z=Math.PI/2;pivot.add(wheel);wheelParts.push({pivot,wheel,front:z<0,baseX:0});
}

/* Driver-eye cockpit. It is attached to the camera so the near geometry stays
 * stable while the camera follows the simulated car.
 */
const cockpit=new THREE.Group();cockpit.visible=false;camera.add(cockpit);
const leather=new THREE.MeshPhysicalMaterial({color:'#090b0c',roughness:.58,clearcoat:.18});
const carbon=new THREE.MeshPhysicalMaterial({color:'#171b1d',roughness:.3,metalness:.45,clearcoat:.5});
const brushed=new THREE.MeshStandardMaterial({color:'#8e969a',roughness:.24,metalness:.85});
const cockpitRed=new THREE.MeshPhysicalMaterial({color:'#b71914',roughness:.3,metalness:.55,clearcoat:1});
const stitch=new THREE.MeshStandardMaterial({color:'#d8322a',roughness:.65});
function cockpitBox(mat,size,pos,rotation=[0,0,0]) {
  const mesh=new THREE.Mesh(cube,mat);mesh.scale.set(...size);mesh.position.set(...pos);
  mesh.rotation.set(...rotation);cockpit.add(mesh);return mesh;
}
cockpitBox(leather,[2.45,.42,.48],[0,-.53,-1.18]);
cockpitBox(carbon,[2.35,.07,.58],[0,-.28,-1.2],[-.08,0,0]);
cockpitBox(leather,[.58,.76,.52],[.7,-.68,-1.02],[-.18,0,0]);
cockpitBox(cockpitRed,[2.15,.08,2.0],[0,-.82,-2.05],[.04,0,0]);
cockpitBox(stitch,[2.15,.012,.012],[0,-.32,-.89]);
cockpitBox(leather,[.13,1.45,.16],[-.91,.12,-.88],[0,0,-.28]);
cockpitBox(leather,[.13,1.45,.16],[.91,.12,-.88],[0,0,.28]);
cockpitBox(leather,[2.0,.12,.18],[0,.78,-.78]);
const steeringWheel=new THREE.Group();steeringWheel.position.set(0,-.34,-.72);cockpit.add(steeringWheel);
const rim=new THREE.Mesh(new THREE.TorusGeometry(.31,.038,16,64),leather);steeringWheel.add(rim);
for(const [x,y,a] of [[0,-.10,0],[-.13,.02,-.65],[.13,.02,.65]]) {
  const spoke=new THREE.Mesh(cube,carbon);spoke.scale.set(.06,.20,.035);
  spoke.position.set(x,y,-.01);spoke.rotation.z=a;steeringWheel.add(spoke);
}
const hub=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.045,32),carbon);
hub.rotation.x=Math.PI/2;hub.position.z=-.015;steeringWheel.add(hub);
function badgeTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d');c.fillStyle='#f3cb26';c.beginPath();c.arc(128,128,116,0,Math.PI*2);c.fill();
  c.strokeStyle='#111';c.lineWidth=10;c.stroke();c.fillStyle='#111';
  c.font='italic 900 104px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText('SF',128,132);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const badge=new THREE.Mesh(new THREE.CircleGeometry(.082,32),
  new THREE.MeshBasicMaterial({map:badgeTexture()}));
badge.position.z=.03;steeringWheel.add(badge);
const startButton=new THREE.Mesh(new THREE.CylinderGeometry(.033,.033,.022,24),
  new THREE.MeshStandardMaterial({color:'#d11b12',emissive:'#430000',emissiveIntensity:.4,roughness:.35}));
startButton.rotation.x=Math.PI/2;startButton.position.set(.19,-.04,.035);steeringWheel.add(startButton);
for(const x of [-.55,.55]) {
  const vent=new THREE.Mesh(new THREE.CylinderGeometry(.105,.105,.035,32),brushed);
  vent.rotation.x=Math.PI/2;vent.position.set(x,-.29,-.92);cockpit.add(vent);
  const centre=new THREE.Mesh(new THREE.CylinderGeometry(.078,.078,.04,24),leather);
  centre.rotation.x=Math.PI/2;centre.position.set(x,-.29,-.895);cockpit.add(centre);
}
const instrumentCanvas=document.createElement('canvas');instrumentCanvas.width=640;instrumentCanvas.height=260;
const instrumentContext=instrumentCanvas.getContext('2d');
const instrumentTexture=new THREE.CanvasTexture(instrumentCanvas);instrumentTexture.colorSpace=THREE.SRGBColorSpace;
const instruments=new THREE.Mesh(new THREE.PlaneGeometry(.62,.252),
  new THREE.MeshBasicMaterial({map:instrumentTexture,toneMapped:false}));
instruments.position.set(0,-.16,-.96);cockpit.add(instruments);
const passengerLabelCanvas=document.createElement('canvas');passengerLabelCanvas.width=512;passengerLabelCanvas.height=96;
const plc=passengerLabelCanvas.getContext('2d');plc.fillStyle='#080909';plc.fillRect(0,0,512,96);
plc.fillStyle='#d5b83b';plc.font='italic 700 48px Georgia';plc.textAlign='center';plc.fillText('FERRARI 458 ITALIA',256,65);
const passengerLabelTexture=new THREE.CanvasTexture(passengerLabelCanvas);passengerLabelTexture.colorSpace=THREE.SRGBColorSpace;
const passengerLabel=new THREE.Mesh(new THREE.PlaneGeometry(.62,.116),
  new THREE.MeshBasicMaterial({map:passengerLabelTexture,toneMapped:false}));
passengerLabel.position.set(.66,-.43,-.91);cockpit.add(passengerLabel);
function updateCockpitDisplay(rpm) {
  const c=instrumentContext;c.fillStyle='#050708';c.fillRect(0,0,640,260);
  c.strokeStyle='#383e40';c.lineWidth=8;c.strokeRect(5,5,630,250);
  c.fillStyle='#f5d22d';c.beginPath();c.arc(320,130,102,0,Math.PI*2);c.fill();
  c.fillStyle='#111';c.beginPath();c.arc(320,130,86,0,Math.PI*2);c.fill();
  c.strokeStyle=rpm>7000?'#ef281b':'#f5d22d';c.lineWidth=10;
  c.beginPath();c.arc(320,130,92,-Math.PI*.8,-Math.PI*.8+Math.PI*1.6*clamp(rpm/8000,0,1));c.stroke();
  c.fillStyle='#fff';c.font='700 60px "Segoe UI"';c.textAlign='center';c.fillText(Math.round(speed),320,140);
  c.font='20px "Segoe UI"';c.fillStyle='#bfc6c7';c.fillText('KM/H',320,174);
  c.textAlign='left';c.fillStyle='#ef3127';c.font='italic 700 24px Georgia';c.fillText('FERRARI',28,42);
  c.fillStyle='#fff';c.font='700 28px "Segoe UI"';c.fillText(Math.round(rpm)+' RPM',28,222);
  c.textAlign='right';c.fillStyle='#fff';c.fillText('LAP '+timing.laps,610,42);
  c.fillStyle='#c9d1d1';c.font='24px ui-monospace';c.fillText(formatTime(timing.elapsed),610,222);
  instrumentTexture.needsUpdate=true;
}
let cameraMode='chase';
function setCameraMode(mode) {
  cameraMode=mode==='cockpit'?'cockpit':'chase';
  const inside=cameraMode==='cockpit';
  cockpit.visible=inside;body.visible=!inside;
  document.body.classList.toggle('cockpit-view',inside);
  $('camera-toggle').setAttribute('aria-pressed',String(inside));
  $('camera-toggle').textContent=inside?'Chase view [C]':'Cockpit view [C]';
  try{localStorage.setItem('race-camera-v1',cameraMode);}catch{}
}
try{cameraMode=localStorage.getItem('race-camera-v1')==='cockpit'?'cockpit':'chase';}catch{}
setCameraMode(cameraMode);
// Source and authorship follow the official Three.js car example.
// The example model remains externally hosted; no asset licence is inferred.
const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);
loader.load('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/ferrari.glb', gltf => {
  const model = gltf.scene.children[0];
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 4.5 / size.z;
  const wrapper = new THREE.Group(); wrapper.scale.setScalar(scale);
  model.position.x -= center.x; model.position.z -= center.z; model.position.y -= bounds.min.y;
  wrapper.add(model);
  model.traverse(mesh => { if(mesh.isMesh) {mesh.castShadow=true;mesh.receiveShadow=true;} });
  const shell = model.getObjectByName('body');if(shell)shell.material=paint;
  const windowMesh = model.getObjectByName('glass');
  if(windowMesh)windowMesh.material=new THREE.MeshPhysicalMaterial({color:'#224052',metalness:.35,roughness:.12,clearcoat:1});
  wheelParts = [];
  for (const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr']) {
    const wheel=model.getObjectByName(name);if(!wheel)continue;
    const pivot=new THREE.Group();pivot.position.copy(wheel.position);wheel.parent.add(pivot);
    pivot.add(wheel);wheel.position.set(0,0,0);
    wheelParts.push({pivot,wheel,front:name.startsWith('wheel_f'),baseX:wheel.rotation.x});
  }
  body.remove(fallback);body.add(wrapper);
  $('model-credit').textContent='Ferrari 458 Italia - vicent091036 / Three.js';
  document.body.dataset.carModel='ferrari';
  draco.dispose();
},undefined, error => {
  console.warn('Car model unavailable; using procedural coupe.',error);
  $('model-credit').textContent='Procedural coupe - Ferrari model unavailable';
  document.body.dataset.carModel='fallback';
  draco.dispose();
});

const map = $('map'), mapContext=map.getContext('2d');
function drawMap() {
  const c=mapContext;c.clearRect(0,0,map.width,map.height);
  const project = (x,z) => [30+(x+90)*.57,20+(z+400)*.37];
  c.strokeStyle='#b8c6be';c.lineWidth=5;c.lineJoin='round';c.beginPath();
  points.forEach((p,i)=>{const [x,y]=project(p.x,p.z);if(i===0)c.moveTo(x,y);else c.lineTo(x,y);});
  c.closePath();c.stroke();
  let [x,y]=project(0,0);c.fillStyle='#dcff74';c.fillRect(x-4,y-4,8,8);
  [x,y]=project(carState.x,carState.z);c.fillStyle=offtrack?'#ff6b43':'#dcff74';c.beginPath();c.arc(x,y,6,0,Math.PI*2);c.fill();
}
const cameraPosition=new THREE.Vector3(), cameraLook=new THREE.Vector3(), lookTarget=new THREE.Vector3();
function recover(reset=false) {
  const nearest = reset ? nearestTrack(points,0,0) : nearestTrack(points,carState.x,carState.z);
  carState.x=nearest.x;carState.z=nearest.z;carState.heading=nearest.heading;
  speed=0;steer=0;demoSpeed=0;offtrack=false;testAlarmUntil=0;
  if(reset) {
    timing.resetSession(); keys.clear();
    if (demo) resetGate.cancel();
    else resetGate.request(performance.now() - lastPacket < 700 ? input.session : null);
  } else timing.invalidate();
  feedback(false);
  camera.position.set(carState.x-Math.sin(carState.heading)*10,4.5,carState.z+Math.cos(carState.heading)*10);
  cameraLook.set(carState.x,1,carState.z);
}
recover(true);
$('demo').onclick=()=>{
  demo=!demo;keys.clear();recover(true);
  $('demo').setAttribute('aria-pressed',String(demo));
  $('demo').textContent=demo?'Hardware control':'Keyboard demo';
};
$('recover').onclick=()=>recover();
$('restart').onclick=()=>recover(true);
$('camera-toggle').onclick=()=>setCameraMode(cameraMode==='chase'?'cockpit':'chase');
$('setup-toggle').onclick=()=>{
  $('setup').hidden=!$('setup').hidden;
  $('setup-toggle').setAttribute('aria-expanded',String(!$('setup').hidden));
};
$('setup-close').onclick=()=>{ $('setup').hidden=true; $('setup-toggle').setAttribute('aria-expanded','false'); };
const saveSettings=()=>{try{localStorage.setItem('race-controls-v5',JSON.stringify(settings));}catch{}};
for (const id of ['sensitivity','deadzone']) {
  $(id).value=settings[id];
  const show=()=>{ $(id+'-value').textContent=id==='deadzone'?settings[id]+'%':settings[id].toFixed(2); };
  show(); $(id).oninput=()=>{settings[id]=Number($(id).value);show();saveSettings();};
}
$('invert').checked=settings.invert;
$('invert').onchange=()=>{settings.invert=$('invert').checked;saveSettings();};
function stationaryStick() {
  const samples=steeringSamples.filter(s=>performance.now()-s.time<1000);
  const values=samples.map(s=>s.value);
  if(!fresh()||demo||input.speed>.1||samples.length<8||
      samples.at(-1).time-samples[0].time<600||
      Math.max(...values)-Math.min(...values)>6) return null;
  return values.reduce((a,b)=>a+b,0)/values.length;
}
$('calibrate-range').onclick=()=>{
  if(calibrationStep===0) {
    calibrationStep=1;
    $('calibration-status').textContent='1/3: release the stick at CENTER, hold still for 1 s, then capture.';
    $('calibrate-range').textContent='Capture CENTER';
    return;
  }
  const value=stationaryStick();
  if(value===null) {
    $('calibration-status').textContent='Stop the car and hold the requested stick position still for 1 s.';return;
  }
  if(calibrationStep===1) {
    if(Math.abs(value)>30) {
      $('calibration-status').textContent='Center offset too large. Release the stick and recalibrate ECU1 first.';return;
    }
    calibrationCenter=value;calibrationStep=2;
    $('calibration-status').textContent='2/3: hold the stick fully LEFT (not diagonal) for 1 s, then capture.';
    $('calibrate-range').textContent='Capture LEFT';return;
  }
  if(calibrationStep===2) {
    calibrationLeft=value;calibrationStep=3;
    $('calibration-status').textContent='3/3: hold the stick fully RIGHT for 1 s, then capture.';
    $('calibrate-range').textContent='Capture RIGHT';return;
  }
  const result=calibrateSteering(calibrationCenter,calibrationLeft,value);
  calibrationStep=0;$('calibrate-range').textContent='Calibrate LEFT / CENTER / RIGHT';
  if(!result) {
    $('calibration-status').textContent='Axis did not sweep both sides. Check joystick Y -> ECU1 PA1, 3V3 and GND. Old calibration retained.';return;
  }
  Object.assign(settings,result);$('invert').checked=false;saveSettings();
  $('calibration-status').textContent='Range and direction saved. Small left/right movements now map proportionally.';
};
$('calibrate').onclick=()=>{
  const samples=steeringSamples.filter(s=>performance.now()-s.time<1500).map(s=>s.value);
  if (!fresh() || demo || input.speed>.1 || samples.length<10 ||
      Math.max(...samples)-Math.min(...samples)>8) {
    $('calibration-status').textContent='Stop, release the stick and keep it still for 1.5 s.';return;
  }
  const center=samples.reduce((a,b)=>a+b,0)/samples.length;
  if(Math.abs(center)>30) {
    $('calibration-status').textContent='Center offset too large. Check the analog wiring and restart ECU1 with the stick released.';return;
  }
  if(!calibrateSteering(center,settings.left,settings.right)) {
    $('calibration-status').textContent='Center is outside the saved travel. Run the full LEFT / CENTER / RIGHT calibration.';return;
  }
  settings.center=center;saveSettings();
  $('calibration-status').textContent='Center saved. Adjust sensitivity and deadzone to taste.';
};
$('buzzer-test').onclick=()=>{
  if (!demo && fresh() && input.feedback && !resetGate.pending) testAlarmUntil=performance.now()+1000;
};
$('reset-records').onclick=()=>{
  if(!confirm('Delete completed laps, last lap and best lap saved by this browser?'))return;
  timing.reset();saveLapRecords();$('calibration-status').textContent='Lap records cleared.';
};
$('audio-toggle').onclick=async()=>{
  try {
    const enabled=await audio.toggle();
    $('audio-toggle').textContent=enabled?'Mute audio':'Enable audio';
    $('audio-toggle').setAttribute('aria-pressed',String(enabled));
  } catch { $('audio-toggle').textContent='Audio unavailable'; }
};
$('volume').oninput=()=>{audio.volume=Number($('volume').value);};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
addEventListener('keydown',e=>{
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if(e.code==='KeyC'&&!e.repeat)setCameraMode(cameraMode==='chase'?'cockpit':'chase');
  if(e.code==='KeyR'&&!e.repeat)recover();
  if(!demo)return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)){e.preventDefault();keys.add(e.code);}
});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{
  keys.clear();if(document.hidden){timing.invalidate();feedback(false);audio.silence();testAlarmUntil=0;paused=true;}
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide',()=>{feedback(false);audio.close();stopped=true;clearInterval(heartbeat);clearTimeout(connectTimer);clearTimeout(reconnectTimer);socket?.close();});
addEventListener('pageshow',e=>{if(e.persisted)location.reload();});

function updateHud(now) {
  const live=fresh();
  $('speed').textContent=Math.round(speed);
  const rpm=demo?clamp(1000+speed/360*7000,1000,8000):resetGate.pending?1000:input.rpm;
  $('rpm').textContent=Math.round(rpm);$('rpm-bar').style.transform='scaleX('+clamp(rpm/8000,0,1)+')';
  $('lap-time').textContent=formatTime(timing.elapsed);$('laps').textContent=timing.laps;
  $('average').textContent=timing.average.toFixed(1)+' km/h';
  $('last-lap').textContent=timing.last?(formatTime(timing.last.time)+(timing.last.valid?'':' *')):'--:--.---';
  $('best-lap').textContent=formatTime(timing.best);
  $('lap-state').textContent=!timing.started?'Ready on the grid':!timing.valid?'Lap invalid - track limits / interruption':'Checkpoint '+timing.nextGate+'/16 - clean lap';
  $('warning').style.display=offtrack?'block':'none';
  $('mode').textContent=demo?'Keyboard simulation':'Hardware control';
  $('status').textContent=demo?'KEYBOARD DEMO':live&&resetGate.pending?'RESET PENDING':live?'ECU LIVE':connected?'WAITING FOR ECU':'CONNECTING TO GATEWAY';
  $('notice').textContent=demo?'W/S pedals - A/D steering - R recover':
    live&&resetGate.pending?'Waiting for ECU reset. Release throttle. Check GPIO14 -> PC11.':
    live?'Joystick: steering - Buttons: throttle and brake':
    connected?'Waiting for protocol v3 telemetry. Update ECU2, ESP32 and Arduino.':'Join HIL_Telemetry Wi-Fi. Reconnecting automatically.';
  $('steering-values').textContent='Input: '+input.steer+'% / output: '+Math.round(shapeSteering(input.steer,settings)*100)+'%';
  $('steering-dot').style.left=(50+shapeSteering(input.steer,settings)*50)+'%';
  $('diagnostic').textContent=demo?'Demo: hardware buzzer disabled.':!live?'Waiting for live ECU telemetry.':
    !input.feedback?'Return UART missing: connect ESP32 GPIO14 -> ECU2 PC11 and common GND.':
    resetGate.pending?'Return UART OK. Waiting for session '+resetGate.token+' acknowledgement.':
    'Return UART OK / session '+input.session+' / alarm '+(input.alarm?'ACK ON':'OFF')+' / buzzer: Arduino D7.';
  $('buzzer-test').disabled=demo||!live||!input.feedback||resetGate.pending;
  updateCockpitDisplay(rpm);
  drawMap();
}
const smooth=(a,b,rate,dt)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-rate*dt));
let lapToastTimer,previous=performance.now(),hudAt=0,wheelSpin=0,wasActive=false;
function announceLap(lap) {
  const toast=$('lap-toast');
  toast.querySelector('.eyebrow').textContent=lap.valid?
    (lap.newBest?'New best lap':'Lap '+lap.lap+' completed'):'Lap '+lap.lap+' invalid';
  toast.querySelector('strong').textContent=formatTime(lap.time);
  toast.classList.remove('show');void toast.offsetWidth;toast.classList.add('show');
  clearTimeout(lapToastTimer);lapToastTimer=setTimeout(()=>toast.classList.remove('show'),3500);
}
function animate(now) {
  if(stopped)return;
  requestAnimationFrame(animate);
  const elapsed=Math.min((now-previous)/1000,.25);previous=now;
  if(document.hidden)return;
  if(paused){paused=false;speed=0;demoSpeed=0;lastPacket=-Infinity;return;}
  const active=demo||(fresh()&&!resetGate.pending);
  if(!active&&wasActive)feedback(false);
  wasActive=active;
  if(!active&&timing.started)timing.invalidate();
  // Substeps bound steering integration even on slower GPUs.
  const steps=Math.max(1,Math.ceil(elapsed/(1/120))),dt=elapsed/steps;
  for(let i=0;i<steps;i++) {
    let desiredSpeed=active?input.speed:0,desiredSteer=active?shapeSteering(input.steer,settings):0;
    if(demo) {
      const throttle=keys.has('KeyW')||keys.has('ArrowUp'),brake=keys.has('KeyS')||keys.has('ArrowDown');
      const drive=throttle&&demoSpeed<360?38-27*demoSpeed/360:0;
      demoSpeed=clamp(demoSpeed+(brake?-65:drive-.9-.00003*demoSpeed*demoSpeed)*dt,0,360);
      desiredSpeed=demoSpeed;
      desiredSteer=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    }
    speed=smooth(speed,desiredSpeed,8,dt);steer=approachSteering(steer,desiredSteer,dt);
    if(!active)speed=0;
    driveStep(carState,speed,steer,dt);
    const nearest=nearestTrack(points,carState.x,carState.z);
    // Front/rear wheel envelopes, not just the centre, must remain on asphalt.
    const alignment=Math.cos(carState.heading-nearest.heading);
    const sideways=Math.abs(Math.sin(carState.heading-nearest.heading));
    offtrack=nearest.distance+1.0*Math.abs(alignment)+2.2*sideways>HALF_WIDTH;
    if(active) {
      const completed=timing.step(dt,speed/3.6*dt,nearest.progress,offtrack,alignment>0);
      if(completed){saveLapRecords();announceLap(completed);}
    }
    wheelSpin=(wheelSpin-speed/3.6*dt/.34)%(Math.PI*2);
  }
  const elevation=Math.max(0,scenery.heightAt(carState.x,carState.z));
  car.position.set(carState.x,elevation,carState.z);car.rotation.y=-carState.heading;
  body.rotation.z=smooth(body.rotation.z,-steer*.06*Math.min(speed/60,1),6,elapsed);
  for(const part of wheelParts){part.wheel.rotation.x=part.baseX+wheelSpin;if(part.front)part.pivot.rotation.y=-carState.wheelAngle;}
  const sin=Math.sin(carState.heading),cos=Math.cos(carState.heading);
  if(cameraMode==='cockpit') {
    const driverX=-.42,driverZ=.18;
    cameraPosition.set(carState.x+driverX*cos-driverZ*sin,1.22+elevation,
      carState.z+driverX*sin+driverZ*cos);
    lookTarget.set(cameraPosition.x+sin*30,cameraPosition.y+.05,cameraPosition.z-cos*30);
    camera.position.lerp(cameraPosition,1-Math.exp(-18*elapsed));
    cameraLook.lerp(lookTarget,1-Math.exp(-22*elapsed));camera.lookAt(cameraLook);
    camera.rotateZ(-steer*.012);
    camera.fov=smooth(camera.fov,60+Math.min(speed,300)*.018,4,elapsed);
  } else {
    cameraPosition.set(carState.x-sin*(10+speed*.005),4.2+elevation,carState.z+cos*(10+speed*.005));
    lookTarget.set(carState.x+sin*6,1+elevation,carState.z-cos*6);
    camera.position.lerp(cameraPosition,1-Math.exp(-5*elapsed));
    cameraLook.lerp(lookTarget,1-Math.exp(-7*elapsed));camera.lookAt(cameraLook);
    camera.fov=smooth(camera.fov,58,5,elapsed);
  }
  camera.updateProjectionMatrix();
  steeringWheel.rotation.z=-steer*1.45;
  sun.position.set(carState.x-45,65,carState.z-35);sun.target.position.set(carState.x,0,carState.z);
  sky.position.set(carState.x,0,carState.z);
  scenery.update(elapsed);
  audio.update({rpm:demo?clamp(1000+speed/360*7000,1000,8000):input.rpm,
    speed,steer,offtrack,active});
  if(now-hudAt>100){updateHud(now);hudAt=now;}
  renderer.render(scene,camera);
}
requestAnimationFrame(animate);
