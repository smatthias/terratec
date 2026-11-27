// 3D view of the CNC machine (CncMachine.vue): a gantry router with a brushed
// aluminium bed, an MDF spoilboard with pop-up stops, a tool rack along the
// back edge, and the gantry, carriage and Z slide carrying the spindle, on a
// concrete workshop floor, lit with shadows. The blank is a height field
// (cnc-machine.mjs createStock) drawn as one textured mesh whose changed rows
// are updated as the tool cuts: its top shows the material's face
// (material-textures.js), its cuts what is inside (plywood plies banded by
// depth, a chipboard core, or the wood itself), or, as a depth map, how deep
// each point is cut. The toolpath is drawn over it by layer or by feed rate
// (the part already run brighter), and chips fly while the tool is cutting.
// Millimetres. Work coordinates (x, y, z) map to the scene as (x, z, −y): the
// bed in x/z, y up, work zero at the scene origin on top of the blank.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {paint} from './bench-scene.js';
import {MACHINE,homePosition,pocketPosition,heightAt} from '../shared/cnc-machine.mjs';
import {faceTexture,edgeTexture,surfaceTexture,coreOf,projectUVs,TILE} from './material-textures.js';
import {cutterModel} from './tool-models.js';

const at=(x,y,z)=>new THREE.Vector3(x,z,-y);
// Shared, cached textures stay; textures made for one scene (pocket labels) go with it.
const dispose=object=>object?.traverse(o=>{o.geometry?.dispose();for(const m of [o.material??[]].flat()) {if(m.map?.userData.owned) m.map.dispose();m.dispose?.();}});
const box=(w,h,d,material,x,y,z)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);if(material.map) projectUVs(m.geometry,{length:w>=d?'x':'z'});return m;};
const cylinder=(r0,r1,h,material,y=0,segments=32)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r0,r1,h,segments),material);m.position.y=y;return m;};
// Only Three.js classes the studio already uses: they share the initial chunk.
const brushed=(color,metalness=.6,roughness=.42)=>new THREE.MeshStandardMaterial({color,map:surfaceTexture('brushed'),metalness,roughness});
const steel=()=>brushed(0xb8bec4,.8,.3);

// A pocket label: "T1" on a plate with a band in the tool's layer colour (browser only).
function pocketLabel(number,color) {
  if(typeof document==='undefined') return null;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const c=canvas.getContext('2d');
  c.fillStyle='#f2f3eb';c.fillRect(0,0,128,64);c.fillStyle=color??'#263e3c';c.fillRect(0,0,128,12);
  c.fillStyle='#14201e';c.font='bold 40px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('T'+number,64,39);
  const texture=new THREE.Texture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.userData.owned=true;texture.needsUpdate=true;
  return new THREE.Mesh(new THREE.PlaneGeometry(56,28),new THREE.MeshBasicMaterial({map:texture}));
}
// ---- The blank's material: the face texture (a tint of the top colour) where
// it is untouched, the core where it is cut (`cut` vertex attribute), plywood
// plies banded by depth, or a depth map. Vertex colours carry the top, cut and
// depth shading.
const RAMP=`vec3 depthRamp(float d){
  if(d<.004) return vec3(.82,.81,.77);
  vec3 a=vec3(.33,.78,.96),b=vec3(.25,.8,.45),c=vec3(.98,.84,.22),e=vec3(.94,.36,.2),f=vec3(.72,.18,.58);
  return d<.34?mix(a,b,d/.34):d<.67?mix(b,c,(d-.34)/.33):d<.995?mix(c,e,(d-.67)/.33):f;
}`;
// Through cuts are drawn just above the spoilboard: as material they are not drawn
// at all (the spoilboard shows through), in the depth map they show as through.
const MAP=`if(depthMode<.5&&vHeight<-thickness+.03) discard;
vec3 faceTex=texture2D(map,vMapUv).rgb,coreTex=texture2D(coreMap,vMapUv).rgb;
float ply=1.;
if(plyT>0.){float k=-vHeight/plyT,f=fract(k);ply=(mod(floor(k),2.)<.5?1.:.85)*mix(.6,1.,smoothstep(0.,.09,min(f,1.-f)));}
diffuseColor.rgb*=mix(faceTex,coreTex*ply,clamp(vCut,0.,1.));`;
function blankMaterial(face,core,thickness) {
  const uniforms={coreMap:{value:core.texture},plyT:{value:core.ply},thickness:{value:thickness},depthMode:{value:0}};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,map:face,roughness:.82,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float cut;varying float vCut;varying float vHeight;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvCut=cut;vHeight=position.y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D coreMap;uniform float plyT,thickness,depthMode;varying float vCut;varying float vHeight;\n'+RAMP)
      .replace('#include <map_fragment>',MAP)
      .replace('#include <color_fragment>','#include <color_fragment>\nif(depthMode>.5) diffuseColor.rgb=depthRamp(clamp(-vHeight/thickness,0.,1.2));');
  };
  material.customProgramCacheKey=()=>'cnc-blank';
  material.userData.uniforms=uniforms;
  return material;
}
// Feed-rate colours from slow (blue) to fast (red); CncMachine.vue draws the same ramp.
export const FEED_RAMP=[0x3d7be0,0x2fc1c9,0x4cc46a,0xf2c12e,0xe5533d];
function rampColor(t,c) {
  const x=Math.min(.9999,Math.max(0,t))*(FEED_RAMP.length-1),k=Math.floor(x);
  return c.set(FEED_RAMP[k]).lerp(new THREE.Color(FEED_RAMP[k+1]),x-k);
}

export function createCncScene(host,{onFrame}={}) {
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(renderer.domElement);
  // Shadows need a graphics card: a software renderer (SwiftShader, llvmpipe: virtual
  // machines, remote desktops, CI) draws the machine without them.
  // It also draws at most five frames a second, so the rest of the page stays responsive.
  const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
  const software=/swiftshader|llvmpipe|softpipe|software/i.test(info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):''),minFrame=software?200:0;
  renderer.shadowMap.enabled=!software;renderer.shadowMap.type=THREE.PCFShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#1d2927');
  scene.add(new THREE.HemisphereLight(0xfffaf0,0x40382c,1.9));
  // The workshop light: soft shadows of the gantry, spindle and tools on the bed and the blank.
  const sun=new THREE.DirectionalLight(0xfff1da,2.4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0004;sun.shadow.normalBias=.6;
  scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xd8e8ff,.6);fill.position.set(1500,900,-1800);scene.add(fill);
  const camera=new THREE.PerspectiveCamera(40,1,20,3e4),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
  let machine=null,gantry=null,carriage=null,slide=null,spindle=null,spin=null,rack=null,stockMesh=null,skirt=null,paths=null,floor=null;
  let overhead=[],job=null,tool=null,toolKey='',view='machine',pathMode='layer',frame=0,last=performance.now(),spinning=false,pose={x:0,y:0,z:MACHINE.zTop};
  // Frames are drawn on demand: when the machine moves, the blank is cut, the
  // camera turns, chips fly or a setting changes; an idle machine costs nothing.
  let dirty=true,drawn=0;const redraw=()=>{dirty=true;};controls.addEventListener('change',redraw);
  const tools=new Map();
  // ---- Chips: a small pool of flying streaks thrown from the cutter, in the colour of the cut.
  const CHIPS=160,chipPos=new Float32Array(CHIPS*3),chipVel=new Float32Array(CHIPS*3),chipLife=new Float32Array(CHIPS),streaks=new Float32Array(CHIPS*6);let chipNext=0;
  const chipGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(streaks,3));
  const chips=new THREE.LineSegments(chipGeometry,new THREE.LineBasicMaterial({color:0xf0dcae}));chips.frustumCulled=false;scene.add(chips);
  chipPos.fill(-1e5);streaks.fill(-1e5);

  // ---- The machine frame, placed for the job (work zero at the scene origin).
  function buildMachine(setup) {
    dispose(machine);scene.remove(machine);machine=new THREE.Group();
    const T=setup.thickness,ox=setup.offset.x,oy=setup.offset.y,TX=MACHINE.travel.x,TY=MACHINE.travel.y,sb=MACHINE.spoilboard;
    const cx=TX/2-ox,cz=-(TY/2-oy),bedY=-T-sb-36,floorY=bedY-120-640;     // centre of the bed in the scene; heights
    // Spoilboard (surfaced MDF) on the brushed aluminium T-slot bed, on a welded steel base with legs.
    machine.add(box(TX+60,sb,TY+20,new THREE.MeshStandardMaterial({map:surfaceTexture('mdf'),roughness:.92}),cx,-T-sb/2,cz));
    machine.add(box(TX+140,36,TY+60,brushed(0xaab2b8),cx,-T-sb-18,cz));
    // T-slots, only where the bed shows beyond the spoilboard (long hidden faces seen
    // edge-on from above would leak through the spoilboard when rasterised).
    for(let x=-20;x<=TX+20;x+=125) for(const side of [-1,1]) machine.add(box(10,36.5,21,paint(0x3c4449),x-ox,-T-sb-18,cz+side*(TY/2+20.5)));
    const base=paint(0x2f5d50);
    machine.add(box(TX+180,120,TY+120,base,cx,bedY-60,cz));
    for(const lx of [-1,1]) for(const lz of [-1,1]) machine.add(box(110,640,110,base,cx+lx*(TX/2+20),bedY-120-320,cz+lz*(TY/2+10)));
    // Rails along X at the front and back, and the pop-up stops the blank rests against.
    for(const y of [-70,TY+70]) {machine.add(box(TX+200,40,50,steel(),cx,-T-sb-16,-(y-oy)));machine.add(box(TX+200,12,24,paint(0x1d2326),cx,-T-sb+10,-(y-oy)));}
    const stop=paint(0xd9822b),s=MACHINE.stops;
    for(const x of [s.x+150,s.x+600]) {const m=cylinder(6,6,18,stop,-T);m.position.x=x-ox;m.position.z=-(s.y-6-oy);machine.add(m);}
    {const m=cylinder(6,6,18,stop,-T);m.position.x=s.x-6-ox;m.position.z=-(s.y+150-oy);machine.add(m);}
    // Tool rack: a bar on posts along the back edge with a fork per pocket, in
    // the colour of the layer its tool cuts.
    rack=new THREE.Group();const r=MACHINE.rack;
    const first=pocketPosition(setup,1),count=Math.max(6,Math.min(r.pockets,job?.rack.length??6));
    const barY=r.z+70,length=(count-1)*r.pitch+120;
    rack.add(box(length,14,60,brushed(0xaab2b8),first.x+(count-1)*r.pitch/2,barY,-first.y));
    for(const x of [first.x-40,first.x+(count-1)*r.pitch+40]) rack.add(box(30,barY+T+sb,30,paint(0x59626a),x,(barY-T-sb)/2,-first.y-20));
    for(let k=0;k<count;k++) {
      const fork=cylinder(34,34,10,paint(job?.rack.find(t=>t.number===k+1)?.color??0x263e3c),barY+10,24);fork.position.set(first.x+k*r.pitch,barY+10,-first.y);rack.add(fork);
      // The pocket's number on a plate at the front of the bar, as on a tool changer.
      const label=pocketLabel(k+1,job?.rack.find(t=>t.number===k+1)?.color);
      if(label) {label.position.set(first.x+k*r.pitch,barY,-first.y+31);rack.add(label);}
    }
    machine.add(rack);
    // Work zero (G54): X red, Y green, Z blue.
    const axes=[],tint=[],c=new THREE.Color();
    for(const [dir,color] of [[at(1,0,0),0xe5484d],[at(0,1,0),0x46a758],[at(0,0,1),0x3e8ed0]]) {axes.push(0,.5,0,dir.x*80,dir.y*80+.5,dir.z*80);c.set(color);tint.push(c.r,c.g,c.b,c.r,c.g,c.b);}
    const origin=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(axes,3)).setAttribute('color',new THREE.Float32BufferAttribute(tint,3)),new THREE.LineBasicMaterial({vertexColors:true,depthTest:false}));
    origin.renderOrder=11;machine.add(origin);
    machine.traverse(o=>{if(o.isMesh) {o.receiveShadow=true;o.castShadow=o.parent===rack;}});
    scene.add(machine);
    // The workshop floor.
    dispose(floor);scene.remove(floor);
    floor=new THREE.Mesh(projectUVs(new THREE.PlaneGeometry(12000,9000),{length:'x',tile:1800}),new THREE.MeshStandardMaterial({map:surfaceTexture('concrete'),roughness:.95}));
    floor.rotation.x=-Math.PI/2;floor.position.set(cx,floorY,cz);floor.receiveShadow=true;scene.add(floor);
    // The gantry (moves in X) with its carriage (Y) and Z slide.
    dispose(gantry);scene.remove(gantry);
    gantry=new THREE.Group();carriage=new THREE.Group();slide=new THREE.Group();spindle=new THREE.Group();spin=new THREE.Group();
    const beamY=MACHINE.zTop+300,front=-(-70-oy),back=-(TY+70-oy),legs=paint(0x2f5d50);
    for(const z of [front,back]) {gantry.add(box(150,beamY+T+sb+60,40,legs,130,(beamY-T-sb+60)/2,z));gantry.add(box(260,40,70,steel(),130,-T-sb+4,z));}
    gantry.add(box(170,150,Math.abs(front-back)+40,brushed(0x8d979e,.55,.45),150,beamY+60,(front+back)/2));
    gantry.add(box(12,60,Math.abs(front-back)-40,steel(),60,beamY+20,(front+back)/2));
    // Carriage on the beam; the Z slide (its plate and the spindle) rides up and
    // down on it with the tool tip at the slide's origin.
    carriage.add(box(60,220,170,paint(0x263e3c),48,beamY+50,0));
    // Water-cooled spindle: body, cap and nose, above the tool holder.
    spindle.add(box(24,330,130,paint(0x3a4a47),30,150,0));
    spindle.add(cylinder(42,42,230,new THREE.MeshStandardMaterial({color:0xd7dbde,metalness:.55,roughness:.3}),115));
    spindle.add(cylinder(44,44,20,paint(0x1d2326),240));
    spindle.add(cylinder(30,38,18,steel(),-9));
    slide.add(spindle,spin);carriage.add(slide);gantry.add(carriage);scene.add(gantry);
    gantry.traverse(o=>{if(o.isMesh) o.castShadow=true;});
    // Looking straight down, everything above the cutter is hidden (as in a CAM simulator).
    overhead=[];gantry.traverse(o=>{if(o.isMesh) overhead.push(o);});
    // Shadows cover the blank and the gantry around it.
    const b=setup.blank,centre=at((b.x0+b.x1)/2,(b.y0+b.y1)/2,0),R=Math.max(b.x1-b.x0,b.y1-b.y0)/2+700,cam=sun.shadow.camera;
    sun.target.position.copy(centre);sun.position.copy(centre).add(new THREE.Vector3(-900,2600,1400));
    cam.left=cam.bottom=-R;cam.right=cam.top=R;cam.near=100;cam.far=6000;cam.updateProjectionMatrix();
  }

  // ---- The blank: a height field with side walls.
  function buildStock(stock,look) {
    for(const m of [stockMesh,skirt]) {dispose(m);scene.remove(m);}
    const {nx,ny,cx,cy,x0,y0,thickness:T}=stock,count=(nx+1)*(ny+1);
    const positions=new Float32Array(count*3),uvs=new Float32Array(count*2);
    for(let j=0;j<=ny;j++) for(let i=0;i<=nx;i++) {const k=j*(nx+1)+i,x=x0+i*cx,y=y0+j*cy;positions[k*3]=x;positions[k*3+2]=-y;uvs[k*2]=x/TILE;uvs[k*2+1]=y/TILE;}
    const index=new (count>65535?Uint32Array:Uint16Array)(nx*ny*6);let n=0;
    for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) {const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;index[n++]=a;index[n++]=b;index[n++]=c;index[n++]=b;index[n++]=d;index[n++]=c;}
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(count*3),3));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(count*3),3));
    geometry.setAttribute('cut',new THREE.BufferAttribute(new Float32Array(count),1));
    geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    geometry.setIndex(new THREE.BufferAttribute(index,1));
    const core=coreOf(look.material,T);
    stockMesh=new THREE.Mesh(geometry,blankMaterial(faceTexture(look.material),core,T));stockMesh.receiveShadow=true;
    // Baked cores (plywood, chipboard) take their own colours; solid wood shows a paler cut of itself.
    const cut=new THREE.Color(core.baked?0xf6f4f0:look.cut);
    stockMesh.userData={stock,top:new THREE.Color(look.top),cut,deep:cut.clone().lerp(new THREE.Color(core.baked?0x9c8f80:0x5a4128),core.baked?.5:.55)};
    scene.add(stockMesh);
    const sides=(nx+ny)*2*6,edge=edgeTexture(look.material,T);
    const wall=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(sides*3),3)).setAttribute('uv',new THREE.BufferAttribute(new Float32Array(sides*2),2));
    skirt=new THREE.Mesh(wall,new THREE.MeshStandardMaterial({color:edge.userData.baked?0xffffff:look.top,map:edge,roughness:.85,side:THREE.DoubleSide}));skirt.receiveShadow=true;scene.add(skirt);
    chips.material.color.set(core.baked?(core.ply?0xf1ddb2:0xd9c29a):look.cut);
    updateStock([0,nx,0,ny]);
  }
  function updateStock(dirty) {
    if(!stockMesh||!dirty) return;
    const {stock,top,cut,deep}=stockMesh.userData,{nx,ny,cx,cy,heights:h,thickness:T}=stock,g=stockMesh.geometry;
    const P=g.attributes.position.array,N=g.attributes.normal.array,C=g.attributes.color.array,K=g.attributes.cut.array,c=new THREE.Color();
    const i0=Math.max(0,dirty[0]-1),i1=Math.min(nx,dirty[1]+1),j0=Math.max(0,dirty[2]-1),j1=Math.min(ny,dirty[3]+1);
    const H=(i,j)=>h[Math.min(ny,Math.max(0,j))*(nx+1)+Math.min(nx,Math.max(0,i))];
    for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) {
      const k=j*(nx+1)+i,v=h[k];P[k*3+1]=Math.max(v,-T+.02);
      const gx=(H(i+1,j)-H(i-1,j))/(2*cx),gy=(H(i,j+1)-H(i,j-1))/(2*cy),l=Math.hypot(gx,1,gy);
      N[k*3]=-gx/l;N[k*3+1]=1/l;N[k*3+2]=gy/l;
      // A point on a cut, or on the rim of one (so the cut walls show the core), darkening with depth.
      const wall=v<-.02||H(i+1,j)<-.02||H(i-1,j)<-.02||H(i,j+1)<-.02||H(i,j-1)<-.02;
      K[k]=wall?1:0;
      if(wall) c.copy(cut).lerp(deep,Math.min(1,.15+.85*-v/T));else c.copy(top);
      C[k*3]=c.r;C[k*3+1]=c.g;C[k*3+2]=c.b;
    }
    const start=j0*(nx+1),length=(j1-j0+1)*(nx+1);
    for(const [name,size] of [['position',3],['normal',3],['color',3],['cut',1]]) {const a=g.attributes[name];a.clearUpdateRanges?.();a.addUpdateRange(start*size,length*size);a.needsUpdate=true;}
    g.boundingSphere=null;dirty=true;
    if(i0===0||j0===0||i1===nx||j1===ny) updateSkirt();
  }
  // Side walls from the edge of the height field down to the spoilboard, the
  // edge texture along them and across the thickness.
  function updateSkirt() {
    const {stock}=stockMesh.userData,{nx,ny,cx,cy,x0,y0,heights:h,thickness:T}=stock,S=skirt.geometry.attributes.position.array,U=skirt.geometry.attributes.uv.array;let n=0,m=0;
    const quad=(xa,ya,ha,xb,yb,hb,along)=>{for(const [x,y,z] of [[xa,ya,ha],[xb,yb,hb],[xa,ya,-T],[xb,yb,hb],[xb,yb,-T],[xa,ya,-T]]) {const Z=Math.max(z,-T);S[n++]=x;S[n++]=Z;S[n++]=-y;U[m++]=(along?x:y)/TILE;U[m++]=(Z+T)/T;}};
    for(let i=0;i<nx;i++) for(const j of [0,ny]) quad(x0+i*cx,y0+j*cy,h[j*(nx+1)+i],x0+(i+1)*cx,y0+j*cy,h[j*(nx+1)+i+1],true);
    for(let j=0;j<ny;j++) for(const i of [0,nx]) quad(x0+i*cx,y0+j*cy,h[j*(nx+1)+i],x0+i*cx,y0+(j+1)*cy,h[(j+1)*(nx+1)+i],false);
    for(const name of ['position','uv']) skirt.geometry.attributes[name].needsUpdate=true;
    skirt.geometry.computeVertexNormals();skirt.geometry.boundingSphere=null;
  }

  // ---- The toolpath: every move as a line; `done` draws the moves already run.
  // Colours by layer (the tool's layer colour) or by feed rate; rapids are yellow.
  function buildPaths(segments) {
    if(paths) for(const p of [paths.ahead,paths.done]) {dispose(p);scene.remove(p);}
    const moves=segments.filter(s=>s.kind==='feed'||s.kind==='rapid'),pos=new Float32Array(moves.length*6),order=new Int32Array(segments.length+1);
    let n=0;
    segments.forEach((s,k)=>{order[k]=n;if(s.kind!=='feed'&&s.kind!=='rapid') return;
      for(const p of [s.a,s.b]) {pos[n*3]=p.x;pos[n*3+1]=p.z+.05;pos[n*3+2]=-p.y;n++;}});
    order[segments.length]=n;
    const position=new THREE.BufferAttribute(pos,3),color=new THREE.BufferAttribute(new Float32Array(moves.length*6),3);
    const line=(opacity)=>{const g=new THREE.BufferGeometry().setAttribute('position',position).setAttribute('color',color);const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity,depthTest:false}));l.renderOrder=10;l.frustumCulled=false;scene.add(l);return l;};
    paths={ahead:line(.28),done:line(1),moves,color,order};paths.done.geometry.setDrawRange(0,0);
    colourPaths();
  }
  function colourPaths() {
    if(!paths) return;
    const {moves,color}=paths,c=new THREE.Color(),feeds=moves.filter(s=>s.kind==='feed').map(s=>s.feed),lo=Math.min(...feeds),hi=Math.max(...feeds);
    moves.forEach((s,k)=>{
      if(s.kind==='rapid') c.set(0xffd23f);else if(pathMode==='feed') rampColor(hi>lo?(s.feed-lo)/(hi-lo):.5,c);else c.set(job.colorOf(s.tool));
      color.array.set([c.r,c.g,c.b,c.r,c.g,c.b],k*6);
    });
    color.needsUpdate=true;dirty=true;
    paths.ahead.visible=paths.done.visible=pathMode!=='off';
  }

  // ---- Tools: in the spindle or standing in their rack pockets.
  function toolFor(number,cutter) {
    const color=job.rack.find(t=>t.number===number)?.color??null,key=number+':'+cutter.id+':'+cutter.diameter+':'+color;
    if(!tools.has(key)) tools.set(key,cutterModel(cutter,{color}));
    return tools.get(key);
  }
  function placeTools() {
    if(!job||!rack) return;
    for(const child of [...rack.children]) if(child.userData.tool) rack.remove(child);
    for(const t of job.rack) {
      if(t.number===tool) continue;
      const model=toolFor(t.number,t.cutter),p=pocketPosition(job.setup,t.number),g=model.group.clone();
      g.position.copy(at(p.x,p.y,p.z));g.userData.tool=true;rack.add(g);
    }
    spin.clear();
    const mounted=job.rack.find(t=>t.number===tool);
    const gauge=mounted?toolFor(mounted.number,mounted.cutter):null;
    if(gauge) spin.add(gauge.group.clone());
    spindle.position.y=gauge?gauge.gauge:0;
  }
  function placeAxes() {
    if(!gantry) return;
    gantry.position.x=pose.x;carriage.position.z=-pose.y;slide.position.y=pose.z;
  }

  const resize=()=>{if(!host.clientWidth) return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();dirty=true;};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function frameView(mode=view) {
    view=mode;if(!job) return;
    const b=job.setup.blank,centre=at((b.x0+b.x1)/2,(b.y0+b.y1)/2,0),size=Math.max(b.x1-b.x0,b.y1-b.y0,300);
    if(mode==='top') {controls.target.copy(centre);camera.position.set(centre.x,size*1.35+400,centre.z+1);}
    // Following the tool from the front left: the gantry's legs and beam stand to its right.
    else if(mode==='follow') {const p=at(pose.x,pose.y,Math.max(pose.z,0));controls.target.copy(p);camera.position.set(p.x-300,p.y+280,p.z+400);}
    else {controls.target.set(centre.x+size*.1,-40,centre.z);camera.position.set(centre.x-size*.6-260,size*.85+560,centre.z+size*1.1+640);}
    for(const o of overhead) o.visible=mode!=='top';
    // A near plane well off the camera keeps depth precise (16-bit depth buffers
    // would otherwise show the bed through the spoilboard and the blank).
    camera.near=mode==='follow'?5:20;camera.far=3e4;camera.updateProjectionMatrix();controls.update();dirty=true;
  }
  function emitChips(dt) {
    const rate=Math.min(12,Math.round(dt*420));
    for(let k=0;k<rate;k++) {
      const i=chipNext=(chipNext+1)%CHIPS,a=Math.random()*Math.PI*2,s=180+Math.random()*260;
      const r=(job?.rack.find(t=>t.number===tool)?.cutter.diameter??6)/2;
      chipPos[i*3]=pose.x+Math.cos(a)*r;chipPos[i*3+1]=Math.max(pose.z,-2)+1;chipPos[i*3+2]=-pose.y+Math.sin(a)*r;
      chipVel[i*3]=Math.cos(a)*s;chipVel[i*3+1]=120+Math.random()*260;chipVel[i*3+2]=Math.sin(a)*s;chipLife[i]=.5+Math.random()*.5;
    }
    flying=CHIPS;
  }
  let flying=0;
  function moveChips(dt) {
    if(!flying) return;
    flying=0;
    for(let i=0;i<CHIPS;i++) {
      if(chipLife[i]<=0) continue;
      flying++;
      chipLife[i]-=dt;chipVel[i*3+1]-=2400*dt;
      for(let a=0;a<3;a++) chipPos[i*3+a]+=chipVel[i*3+a]*dt;
      if(chipLife[i]<=0||chipPos[i*3+1]<0) {chipPos[i*3+1]=-1e5;chipLife[i]=0;}
      for(let a=0;a<3;a++) {streaks[i*6+a]=chipPos[i*3+a];streaks[i*6+3+a]=chipPos[i*3+a]-chipVel[i*3+a]*.012;}
    }
    chipGeometry.attributes.position.needsUpdate=true;dirty=true;
  }
  const animate=now=>{
    frame=requestAnimationFrame(animate);
    const dt=Math.min(.1,(now-last)/1000);last=now;
    onFrame?.(dt);
    if(spinning) {spin.rotation.y-=dt*40;dirty=true;}
    moveChips(dt);
    if(view==='follow') {const p=at(pose.x,pose.y,Math.max(pose.z,0)),d=p.clone().sub(controls.target);if(d.lengthSq()>1e-8) {controls.target.add(d);camera.position.add(d);dirty=true;}}
    if(controls.update()) dirty=true;
    if(dirty&&now-drawn>=minFrame) {dirty=false;drawn=now;renderer.render(scene,camera);}
  };
  frame=requestAnimationFrame(animate);
  return {
    // job: {setup, stock, look {material, top, cut}, segments, colorOf(tool), rack: [{number, cutter, color}]}
    setJob(next) {
      job=next;tool=-1;toolKey='';
      for(const t of tools.values()) dispose(t.group);tools.clear();
      buildMachine(job.setup);buildStock(job.stock,job.look);buildPaths(job.segments);
      pose=homePosition(job.setup);this.setPose(pose,{tool:0});frameView(view);
    },
    updateStock,
    refreshStock() {if(stockMesh) updateStock([0,stockMesh.userData.stock.nx,0,stockMesh.userData.stock.ny]);},
    // The tool tip at `p` (work coordinates) with `tool` in the spindle.
    setPose(p,{tool:number=0,spindle=false,cutting=false,dt=0}={}) {
      if(p.x!==pose.x||p.y!==pose.y||p.z!==pose.z||spindle!==spinning) dirty=true;
      pose=p;spinning=spindle;
      const key=number+'|'+job?.rack.map(t=>t.number+t.cutter.id+t.cutter.diameter).join();
      if(key!==toolKey) {toolKey=key;tool=number;placeTools();dirty=true;}
      placeAxes();
      if(cutting&&spindle&&dt>0) emitChips(dt);
    },
    setProgress(index) {
      const count=paths?.order[Math.min(index,paths.order.length-1)];
      if(paths&&count!==paths.done.geometry.drawRange.count) {paths.done.geometry.setDrawRange(0,count);dirty=true;}
    },
    // 'layer', 'feed' or 'off'.
    pathMode(mode) {pathMode=mode;colourPaths();},
    // 'material' or 'depth'.
    blankMode(mode) {if(stockMesh) stockMesh.material.userData.uniforms.depthMode.value=mode==='depth'?1:0;dirty=true;},
    // The point of the blank under the pointer: {x, y, depth, through} or null.
    probe(event) {
      if(!stockMesh) return null;
      const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster(),{stock}=stockMesh.userData;
      ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      // Meet the top, then the floor of the cut found there (close enough for a readout).
      let hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3()),h=hit&&heightAt(stock,hit.x,-hit.z);
      if(h===null||h===undefined) return null;
      if(h<0) {const deeper=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-h),new THREE.Vector3()),h2=deeper&&heightAt(stock,deeper.x,-deeper.z);if(h2!==null&&h2!==undefined) {hit=deeper;h=h2;}}
      return {x:hit.x,y:-hit.z,depth:Math.max(0,-h),through:h<=-stock.thickness+1e-6};
    },
    view:frameView,
    dispose() {
      cancelAnimationFrame(frame);observer.disconnect();controls.removeEventListener('change',redraw);controls.dispose();
      for(const t of tools.values()) dispose(t.group);dispose(scene);renderer.dispose();renderer.domElement.remove?.();
    },
  };
}
