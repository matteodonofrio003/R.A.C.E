import * as THREE from 'three';
import { nearestTrack, clamp } from './racing-core.mjs';
import { landscapeMaterial, treeTexture } from './racing-materials.mjs';

/* Static, instanced scenery: no per-frame geometry allocation. */
export function addScenery(scene, points) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness:.85, ...extra});
  const heightAt = (x,z) => {
    const clearance=nearestTrack(points,x,z).distance;
    const lake=Math.hypot(x-205,z-5);
    // Keep a flat apron wider than a grid cell so triangles cannot cover asphalt.
    const blend=clamp((clearance-60)/65,0,1)*clamp((lake-80)/40,0,1);
    const foothills=9+7*Math.sin(x*.012)*Math.cos(z*.015);
    const mountains=clamp((clearance-170)/360,0,1);
    const ridge=85+48*Math.sin(x*.003+z*.004)+24*Math.sin(x*.008-z*.006);
    return -.035+blend*blend*foothills+mountains*mountains*ridge;
  };
  const terrain=new THREE.PlaneGeometry(2800,2800,140,140);
  terrain.rotateX(-Math.PI/2);terrain.translate(150,0,0);
  const positions=terrain.attributes.position, colors=[];
  const grass=new THREE.Color();
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),z=positions.getZ(i),y=heightAt(x,z);
    positions.setY(i,y);
    const shade=.68+.12*Math.sin(x*.017)*Math.cos(z*.023);
    grass.setRGB(shade,shade,shade*.95);
    terrain.attributes.uv.setXY(i,x/5,z/5);
    colors.push(grass.r,grass.g,grass.b);
  }
  terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrain.computeVertexNormals();
  const ground=new THREE.Mesh(terrain,landscapeMaterial());
  ground.receiveShadow=true;scene.add(ground);
  const shoreline=radius=>{
    const geometry=new THREE.CircleGeometry(radius,96),p=geometry.attributes.position;
    for(let i=1;i<p.count;i++) {
      const angle=Math.atan2(p.getY(i),p.getX(i));
      const scale=1+.045*Math.sin(angle*5)+.025*Math.cos(angle*9);
      p.setXY(i,p.getX(i)*scale,p.getY(i)*scale);
    }
    return geometry;
  };
  const lakeBank=new THREE.Mesh(shoreline(77),mat('#9c9979'));
  lakeBank.rotation.x=-Math.PI/2;lakeBank.position.set(205,.002,5);scene.add(lakeBank);
  const waveData=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
    const i=(y*128+x)*4;
    waveData[i]=128+Math.round(18*Math.sin((x+y)*Math.PI/16));
    waveData[i+1]=128+Math.round(18*Math.cos((x-y*2)*Math.PI/32));
    waveData[i+2]=252;waveData[i+3]=255;
  }
  const waves=new THREE.DataTexture(waveData,128,128);
  waves.wrapS=waves.wrapT=THREE.RepeatWrapping;waves.repeat.set(16,16);waves.needsUpdate=true;
  const lake=new THREE.Mesh(shoreline(72),new THREE.MeshPhysicalMaterial({
    color:'#325f66',metalness:0,roughness:.18,ior:1.333,clearcoat:1,
    normalMap:waves,normalScale:new THREE.Vector2(.25,.25)
  }));
  lake.rotation.x=-Math.PI/2;lake.position.set(205,.008,5);scene.add(lake);

  let seed=921;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const dummy=new THREE.Object3D();
  const leaves=treeTexture(random);
  const forest=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),
    mat('#ffffff',{map:leaves,alphaTest:.45,side:THREE.DoubleSide,roughness:1}),1040);
  forest.customDepthMaterial=new THREE.MeshDepthMaterial({
    depthPacking:THREE.RGBADepthPacking,map:leaves,alphaTest:.45,side:THREE.DoubleSide
  });
  const rockGeometry=new THREE.IcosahedronGeometry(1,2);
  const rockPositions=rockGeometry.attributes.position;
  for(let i=0;i<rockPositions.count;i++) {
    const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i);
    const scale=1+.15*Math.sin(x*7+z*3)*Math.cos(y*8);
    rockPositions.setXYZ(i,x*scale,y*scale,z*scale);
  }
  rockGeometry.computeVertexNormals();
  const rocks=new THREE.InstancedMesh(rockGeometry,mat('#8d9386'),120);
  for(let i=0;i<520;i++) {
    let x,z;
    do {x=-210+random()*960;z=-620+random()*1260;}
    while(nearestTrack(points,x,z).distance<26 || Math.hypot(x-205,z-5)<85 ||
      (x<0&&x>-90&&z>-130&&z<80));
    const y=heightAt(x,z),h=9+random()*9,angle=random()*Math.PI;
    const tint=new THREE.Color().setRGB(.8+random()*.2,.85+random()*.15,.8+random()*.2);
    for(let j=0;j<2;j++) {
      dummy.position.set(x,y+h/2,z);dummy.rotation.set(0,angle+j*Math.PI/2,0);
      dummy.scale.set(h*.8,h,1);dummy.updateMatrix();forest.setMatrixAt(i*2+j,dummy.matrix);
      forest.setColorAt(i*2+j,tint);
    }
    if(i<120) {
      dummy.position.set(x+3,heightAt(x+3,z)+.6,z);dummy.scale.set(1+random()*2,.8+random(),1+random()*2);
      dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
    }
  }
  forest.castShadow=rocks.castShadow=true;forest.receiveShadow=true;scene.add(forest,rocks);

  const railMat=mat('#b1bcc0',{metalness:.7,roughness:.4});
  const railCount=Math.floor(points.length/4)*2;
  const rails=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),railMat,railCount);
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,1.2,.16),railMat,railCount);
  let index=0;
  for(let i=0;i<points.length;i+=4) {
    const a=points[i],b=points[(i+4)%points.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    for(const side of [-1,1]) {
      const x=(a.x+b.x)/2-dz/len*18*side,z=(a.z+b.z)/2+dx/len*18*side;
      dummy.position.set(x,.85,z);dummy.rotation.set(0,Math.atan2(dx,dz),0);dummy.scale.set(.14,.45,len+1);
      dummy.updateMatrix();rails.setMatrixAt(index,dummy.matrix);
      dummy.position.y=.6;dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(index++,dummy.matrix);
    }
  }
  scene.add(rails,posts);
  const stand=new THREE.Group();stand.position.set(-57,0,-60);scene.add(stand);
  const box=(size,pos,material)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);
    m.castShadow=m.receiveShadow=true;stand.add(m);return m;
  };
  const concrete=mat('#bdc4b8'),dark=mat('#20333d'),lime=mat('#c7ee62');
  for(let row=0;row<5;row++)box([3,1+row,60],[row*-3,(row+1)/2,0],concrete);
  for(const z of [-29,29])box([.3,10,.3],[-8,5,z],dark);
  box([20,.35,64],[-6,10,0],dark);box([.1,1,64],[4,9.5,0],lime);
  const spectators=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.25,.5,2,4),mat('#ffffff'),180);
  for(let i=0;i<180;i++) {
    const row=i%5;dummy.position.set(-row*3,1.6+row,-27+Math.floor(i/5)*1.5);
    dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();spectators.setMatrixAt(i,dummy.matrix);
    spectators.setColorAt(i,new THREE.Color().setHSL(random(),.65,.5));
  }
  stand.add(spectators);
  return {heightAt,update:dt=>{waves.offset.x=(waves.offset.x+dt*.015)%1;}};
}
