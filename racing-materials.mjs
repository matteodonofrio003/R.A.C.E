import * as THREE from 'three';

const loader=new THREE.TextureLoader();
export function scannedMaterial(asset, options={}) {
  const load=(suffix,color=false)=>{
    const texture=loader.load('./assets/environment/'+asset+'_'+suffix+'_1k.jpg');
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=8;
    if(color)texture.colorSpace=THREE.SRGBColorSpace;
    return texture;
  };
  return new THREE.MeshStandardMaterial({
    map:load('diff',true),normalMap:load('nor_gl'),roughnessMap:load('rough'),
    roughness:1,normalScale:new THREE.Vector2(.55,.55),...options
  });
}

export function landscapeMaterial() {
  const material=scannedMaterial('grass_ground',{vertexColors:true,normalScale:new THREE.Vector2(.3,.3)});
  const rock=loader.load('./assets/environment/aerial_grass_rock_diff_1k.jpg');
  rock.colorSpace=THREE.SRGBColorSpace;
  rock.wrapS=rock.wrapT=THREE.RepeatWrapping;rock.anisotropy=8;
  material.onBeforeCompile=shader=>{
    shader.uniforms.raceRock={value:rock};
    shader.vertexShader='varying float raceHeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nraceHeight = position.y;');
    shader.fragmentShader='uniform sampler2D raceRock;\nvarying float raceHeight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
        vec2 uv = vMapUv;
        float macro = .5 + .5 * sin(uv.x * .063 + cos(uv.y * .071)) * cos(uv.y * .093);
        vec4 grassA = texture2D(map, uv);
        vec4 grassB = texture2D(map, vec2(-uv.y, uv.x) * .413 + vec2(7.13, 3.79));
        vec4 grassColor = mix(grassA, grassB, .25 + .45 * macro);
        vec4 rockA = texture2D(raceRock, uv * .19);
        vec4 rockB = texture2D(raceRock, vec2(-uv.y, uv.x) * .077 + vec2(3.2, 8.1));
        vec4 rockColor = mix(rockA, rockB, macro);
        float alpine = smoothstep(12., 90., raceHeight + macro * 12.);
        diffuseColor *= mix(grassColor, rockColor, alpine);
        diffuseColor.rgb *= .85 + .25 * macro;
      #endif
    `);
  };
  material.customProgramCacheKey=()=> 'race-landscape-v4';
  return material;
}

/* Crossed alpha-tested tree cards replace solid geometric cones.
 * Branches and leaf clusters are drawn once, never inside the render loop.
 */
export function treeTexture(random) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=768;
  const c=canvas.getContext('2d');
  function branch(x,y,length,angle,width,depth) {
    const ex=x+Math.sin(angle)*length,ey=y-Math.cos(angle)*length;
    c.strokeStyle=depth>2?'#615544':'#73664b';c.lineWidth=width;c.lineCap='round';
    c.beginPath();c.moveTo(x,y);c.lineTo(ex,ey);c.stroke();
    if(depth>0) {
      branch(ex,ey,length*.70,angle-.38-random()*.22,width*.6,depth-1);
      branch(ex,ey,length*.71,angle+.32+random()*.28,width*.6,depth-1);
    }
  }
  branch(256,754,204,0,21,4);
  // Irregular overlapping crowns, with holes retained between leaves.
  for(let cluster=0;cluster<24;cluster++) {
    const angle=cluster*2.39996;
    const radius=70+random()*100;
    const cx=256+Math.cos(angle)*radius,cy=268+Math.sin(angle)*radius*.92;
    for(let leaf=0;leaf<260;leaf++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random())*(50+random()*30);
      const x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;
      const light=18+random()*20+(400-y)*.018;
      c.fillStyle='hsl('+(77+random()*25)+',26%,'+light+'%)';
      c.beginPath();c.ellipse(x,y,2+random()*4,1+random()*2.5,random()*6.28,0,Math.PI*2);c.fill();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
