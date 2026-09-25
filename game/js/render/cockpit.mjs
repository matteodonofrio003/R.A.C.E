import * as THREE from 'three';

export function createCockpit({camera, vehicleBody, timing, formatTime,
                               getSpeed, cameraButton}) {
  const group = new THREE.Group();
  const cube = new THREE.BoxGeometry(1,1,1);
  group.visible = false;
  camera.add(group);

  const leather = new THREE.MeshPhysicalMaterial({
    color:'#090b0c',roughness:.58,clearcoat:.18
  });
  const carbon = new THREE.MeshPhysicalMaterial({
    color:'#171b1d',roughness:.3,metalness:.45,clearcoat:.5
  });
  const brushed = new THREE.MeshStandardMaterial({
    color:'#8e969a',roughness:.24,metalness:.85
  });
  const red = new THREE.MeshPhysicalMaterial({
    color:'#e1261c',roughness:.24,metalness:.18,clearcoat:1
  });
  const stitch = new THREE.MeshStandardMaterial({color:'#d8322a',roughness:.65});
  const mirrorGlass = new THREE.MeshPhysicalMaterial({
    color:'#9eb8c7',roughness:.12,metalness:.72,clearcoat:1
  });

  const box = (material,size,position,rotation=[0,0,0]) => {
    const mesh = new THREE.Mesh(cube,material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  box(leather,[2.6,.3,.52],[0,-.64,-1.3]);
  box(carbon,[2.5,.055,.66],[0,-.41,-1.31],[-.06,0,0]);
  box(leather,[.58,.7,.52],[.73,-.75,-1.12],[-.16,0,0]);
  box(red,[2.05,.07,2.15],[0,-.86,-2.18],[.035,0,0]);
  box(stitch,[2.22,.01,.01],[0,-.455,-1.0]);
  box(leather,[.105,1.55,.13],[-1.05,.13,-1.0],[0,0,-.24]);
  box(leather,[.105,1.55,.13],[1.05,.13,-1.0],[0,0,.24]);
  box(leather,[2.16,.09,.15],[0,.86,-.91]);
  const hoodCrease = new THREE.MeshStandardMaterial({
    color:'#8e120d',roughness:.32,metalness:.2
  });
  box(hoodCrease,[.018,.012,1.62],[-.5,-.818,-2.14],[0,0,-.025]);
  box(hoodCrease,[.018,.012,1.62],[.5,-.818,-2.14],[0,0,.025]);
  box(leather,[.48,.15,.045],[0,.64,-.77]);
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(.425,.105),mirrorGlass);
  rearGlass.position.set(0,.64,-.744);
  group.add(rearGlass);
  for (const side of [-1,1]) {
    box(red,[.27,.13,.055],[side*.99,-.29,-.91],[0,side*.12,side*.08]);
    const sideGlass = new THREE.Mesh(new THREE.PlaneGeometry(.21,.085),mirrorGlass);
    sideGlass.position.set(side*.985,-.285,-.878);
    sideGlass.rotation.y=side*-.12;
    group.add(sideGlass);
  }
  box(leather,[1.18,.014,.018],[-.08,-.485,-.94],[0,0,.045]);

  const steeringWheel = new THREE.Group();
  steeringWheel.position.set(0,-.59,-.95);
  group.add(steeringWheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.245,.029,16,64),leather);
  rim.scale.y=.94;
  steeringWheel.add(rim);
  for (const [x,y,angle] of [[0,-.075,0],[-.105,.018,-.65],[.105,.018,.65]]) {
    const spoke = new THREE.Mesh(cube,carbon);
    spoke.scale.set(.045,.155,.028);
    spoke.position.set(x,y,-.01);
    spoke.rotation.z=angle;
    steeringWheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.083,.083,.038,32),carbon);
  hub.rotation.x=Math.PI/2;
  hub.position.z=-.015;
  steeringWheel.add(hub);

  const badgeCanvas=document.createElement('canvas');
  badgeCanvas.width=badgeCanvas.height=256;
  const badgeContext=badgeCanvas.getContext('2d');
  badgeContext.fillStyle='#f3cb26';
  badgeContext.beginPath();
  badgeContext.arc(128,128,116,0,Math.PI*2);
  badgeContext.fill();
  badgeContext.strokeStyle='#111';
  badgeContext.lineWidth=10;
  badgeContext.stroke();
  badgeContext.fillStyle='#111';
  badgeContext.font='italic 900 104px Georgia';
  badgeContext.textAlign='center';
  badgeContext.textBaseline='middle';
  badgeContext.fillText('SF',128,132);
  const badgeTexture=new THREE.CanvasTexture(badgeCanvas);
  badgeTexture.colorSpace=THREE.SRGBColorSpace;
  const badge=new THREE.Mesh(new THREE.CircleGeometry(.062,32),
    new THREE.MeshBasicMaterial({map:badgeTexture}));
  badge.position.z=.03;
  steeringWheel.add(badge);

  const startButton=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.018,24),
    new THREE.MeshStandardMaterial({
      color:'#d11b12',emissive:'#430000',emissiveIntensity:.4,roughness:.35
    }));
  startButton.rotation.x=Math.PI/2;
  startButton.position.set(.145,-.03,.03);
  steeringWheel.add(startButton);
  for (const x of [-.19,.19]) {
    const paddle=new THREE.Mesh(cube,brushed);
    paddle.scale.set(.035,.13,.018);
    paddle.position.set(x,.005,-.055);
    paddle.rotation.z=x<0?.12:-.12;
    steeringWheel.add(paddle);
  }
  for (const [x,color] of [[-.15,'#367bc8'],[-.1,'#f3d12e'],[.1,'#2e9b55']]) {
    const control=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.012,16),
      new THREE.MeshStandardMaterial({color,roughness:.35}));
    control.rotation.x=Math.PI/2;
    control.position.set(x,-.105,.03);
    steeringWheel.add(control);
  }
  for (const x of [-.61,.61]) {
    const vent=new THREE.Mesh(new THREE.CylinderGeometry(.086,.086,.03,32),brushed);
    vent.rotation.x=Math.PI/2;
    vent.position.set(x,-.44,-1.02);
    group.add(vent);
    const centre=new THREE.Mesh(new THREE.CylinderGeometry(.063,.063,.035,24),leather);
    centre.rotation.x=Math.PI/2;
    centre.position.set(x,-.44,-.995);
    group.add(centre);
  }

  const instrumentCanvas=document.createElement('canvas');
  instrumentCanvas.width=640;
  instrumentCanvas.height=260;
  const instrumentContext=instrumentCanvas.getContext('2d');
  const instrumentTexture=new THREE.CanvasTexture(instrumentCanvas);
  instrumentTexture.colorSpace=THREE.SRGBColorSpace;
  const instruments=new THREE.Mesh(new THREE.PlaneGeometry(.55,.224),
    new THREE.MeshBasicMaterial({map:instrumentTexture,toneMapped:false}));
  instruments.position.set(0,-.35,-1.08);
  group.add(instruments);

  const labelCanvas=document.createElement('canvas');
  labelCanvas.width=512;
  labelCanvas.height=96;
  const labelContext=labelCanvas.getContext('2d');
  labelContext.fillStyle='#080909';
  labelContext.fillRect(0,0,512,96);
  labelContext.fillStyle='#d5b83b';
  labelContext.font='italic 700 48px Georgia';
  labelContext.textAlign='center';
  labelContext.fillText('FERRARI 458 ITALIA',256,65);
  const labelTexture=new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.Mesh(new THREE.PlaneGeometry(.56,.105),
    new THREE.MeshBasicMaterial({map:labelTexture,toneMapped:false}));
  label.position.set(.7,-.56,-1.02);
  group.add(label);

  function update(rpm) {
    const c=instrumentContext;
    c.fillStyle='#050708';c.fillRect(0,0,640,260);
    c.strokeStyle='#383e40';c.lineWidth=8;c.strokeRect(5,5,630,250);
    c.fillStyle='#f5d22d';c.beginPath();c.arc(320,130,102,0,Math.PI*2);c.fill();
    c.fillStyle='#111';c.beginPath();c.arc(320,130,86,0,Math.PI*2);c.fill();
    c.strokeStyle=rpm>7000?'#ef281b':'#f5d22d';c.lineWidth=10;
    c.beginPath();
    c.arc(320,130,92,-Math.PI*.8,
      -Math.PI*.8+Math.PI*1.6*Math.max(0,Math.min(1,rpm/8000)));
    c.stroke();
    c.fillStyle='#fff';c.font='700 60px "Segoe UI"';c.textAlign='center';
    c.fillText(Math.round(getSpeed()),320,140);
    c.font='20px "Segoe UI"';c.fillStyle='#bfc6c7';c.fillText('KM/H',320,174);
    c.textAlign='left';c.fillStyle='#ef3127';c.font='italic 700 24px Georgia';
    c.fillText('FERRARI',28,42);
    c.fillStyle='#fff';c.font='700 28px "Segoe UI"';
    c.fillText(Math.round(rpm)+' RPM',28,222);
    c.textAlign='right';c.fillText('LAP '+timing.laps,610,42);
    c.fillStyle='#c9d1d1';c.font='24px ui-monospace';
    c.fillText(formatTime(timing.elapsed),610,222);
    instrumentTexture.needsUpdate=true;
  }

  let mode='chase';
  try { mode=localStorage.getItem('race-camera-v1')==='cockpit'?'cockpit':'chase'; }
  catch { /* Storage can be unavailable in restricted browsers. */ }
  function setMode(nextMode) {
    mode=nextMode==='cockpit'?'cockpit':'chase';
    const inside=mode==='cockpit';
    group.visible=inside;
    vehicleBody.visible=!inside;
    document.body.classList.toggle('cockpit-view',inside);
    cameraButton.setAttribute('aria-pressed',String(inside));
    cameraButton.textContent=inside?'Chase view [C]':'Cockpit view [C]';
    try { localStorage.setItem('race-camera-v1',mode); } catch {}
  }
  setMode(mode);
  return {
    group,
    steeringWheel,
    update,
    setMode,
    toggle() { setMode(mode==='chase'?'cockpit':'chase'); },
    get mode() { return mode; }
  };
}
