import * as THREE from 'three';
import { nearestTrack, clamp } from './racing-core.mjs';

/* Static, instanced scenery: no per-frame geometry allocation. */
export function addScenery(scene, points) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness:.85, ...extra});
  const heightAt = (x,z) => {
    const clearance=nearestTrack(points,x,z).distance;
    const lake=Math.hypot(x-205,z-5);
    // Keep a flat apron wider than a grid cell so triangles cannot cover asphalt.
    const blend=clamp((clearance-60)/65,0,1)*clamp((lake-80)/40,0,1);
    return -.035+blend*blend*(5+4*Math.sin(x*.012)*Math.cos(z*.015));
  };
  const terrain=new THREE.PlaneGeometry(2000,2000,100,100);
  terrain.rotateX(-Math.PI/2);terrain.translate(150,0,0);
  const positions=terrain.attributes.position, colors=[];
  const grass=new THREE.Color();
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),z=positions.getZ(i),y=heightAt(x,z);
    positions.setY(i,y);
    grass.setHSL(.245+Math.sin(x*.034)*.012,.24,.27+y*.012+Math.cos(z*.09)*.018);
    grass.convertSRGBToLinear();
    colors.push(grass.r,grass.g,grass.b);
  }
  terrain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrain.computeVertexNormals();
  const ground=new THREE.Mesh(terrain,mat('#ffffff',{vertexColors:true}));
  ground.receiveShadow=true;scene.add(ground);
  const lakeBank=new THREE.Mesh(new THREE.CircleGeometry(77,64),mat('#b6aa7c'));
  lakeBank.rotation.x=-Math.PI/2;lakeBank.position.set(205,.002,5);scene.add(lakeBank);
  const lake=new THREE.Mesh(new THREE.CircleGeometry(72,64),new THREE.MeshPhysicalMaterial({
    color:'#267b86',metalness:.45,roughness:.2,clearcoat:1
  }));
  lake.rotation.x=-Math.PI/2;lake.position.set(205,.008,5);scene.add(lake);

  let seed=921;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const dummy=new THREE.Object3D();
  const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),mat('#678450',{flatShading:true}),360);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.32,1,6),mat('#64513c'),120);
  const rocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),mat('#949e95',{flatShading:true}),120);
  for(let i=0;i<120;i++) {
    let x,z;
    do {x=-160+random()*840;z=-500+random()*1020;}
    while(nearestTrack(points,x,z).distance<35 || Math.hypot(x-205,z-5)<85 ||
      (x<0&&x>-90&&z>-130&&z<80));
    const y=heightAt(x,z),h=5+random()*5;
    dummy.rotation.set(0,random()*6.28,0);
    dummy.position.set(x,y+h*.4,z);dummy.scale.set(1,h*.8,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<3;j++) {
      dummy.position.set(x+(j-1)*h*.18,y+h*(.6+j*.1),z+(j%2)*h*.18);
      dummy.scale.set(h*.4,h*.35,h*.4);dummy.updateMatrix();foliage.setMatrixAt(i*3+j,dummy.matrix);
      foliage.setColorAt(i*3+j,new THREE.Color().setHSL(.22+random()*.07,.3,.28+random()*.1));
    }
    x+=8;z+=8;dummy.position.set(x,heightAt(x,z)+.6,z);dummy.scale.set(1+random()*2,.8+random(),1+random()*2);
    dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  }
  foliage.castShadow=trunks.castShadow=rocks.castShadow=true;scene.add(foliage,trunks,rocks);

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
  return {heightAt};
}
