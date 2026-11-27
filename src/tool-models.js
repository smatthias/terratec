// Recognisable 3D models of the workshop's tools, in millimetres with y up and
// the working point at the origin: the tip of a bit or cutter, the teeth of a
// saw, the sole of a plane, the edge of a chisel. Used by the CNC machine (the
// cutters in the spindle and the rack), the drilling and cutting benches (bits,
// blades, router bits) and the workbench (hand tools).
//
// Cutters are told apart as in the tool room: a spiral end mill's flutes wind
// one way (upcut) or the other (downcut), a compression cutter's turn over near
// the tip, a straight bit's run straight; a twist drill has a pointed tip, a
// brad point (dowel drill) a centre spur and two rim spurs, a Forstner or hinge
// boring bit a wide flat head on a slim shank.
import * as THREE from 'three';
import {surfaceTexture,faceTexture,projectUVs} from './material-textures.js';

const steel=()=>new THREE.MeshStandardMaterial({color:0xc6ccd1,map:surfaceTexture('brushed'),metalness:.85,roughness:.28});
const paint=(color,roughness=.6,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const brass=()=>paint(0xc9a44c,.32,.85);
const iron=()=>paint(0x1c1f24,.45,.35);      // japanned cast iron
// Wood for handles, totes and stocks, with its grain.
const wood=(id,color)=>{const t=faceTexture(id);return Object.assign(new THREE.MeshStandardMaterial({color,map:t,bumpMap:t,bumpScale:1.2,roughness:.6}),{userData:{wood:true}});};
const beech=()=>wood('beech',0xd9a877),rosewood=()=>wood('walnut',0x6a3320);
const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
const cyl=(top,bottom,h,segments=24)=>new THREE.CylinderGeometry(top,bottom,h,segments);
function add(group,geometry,material,[x,y,z]=[0,0,0],[rx,ry,rz]=[0,0,0]) {
  if(material.userData.wood) {geometry.computeBoundingBox();const s=geometry.boundingBox.getSize(new THREE.Vector3());projectUVs(geometry,{length:s.x>=s.y&&s.x>=s.z?'x':s.y>=s.z?'y':'z'});}
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);mesh.castShadow=true;group.add(mesh);return mesh;
}
// A rod from a to b (points [x, y, z]).
function rod(group,a,b,r,material,segments=12) {
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),length=from.distanceTo(to);
  const mesh=add(group,cyl(r,r,length,segments),material);
  mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
  return mesh;
}

// ---- Cutters
// A fluted body from y = 0 up to `length`: `flutes` grooves winding `turns`
// times (positive: right-hand, as an upcut spiral; negative: left-hand, a
// downcut). With `split`, the helix turns over at that height (compression).
export function flutedGeometry(r,length,{flutes=2,turns=1,split=-1,depth=.32}={}) {
  const g=new THREE.CylinderGeometry(r,r,length,40,Math.max(6,Math.ceil(length/1.2)));
  const p=g.attributes.position,twist=h=>turns*2*Math.PI*(split<0||h<split?h:2*split-h)/length;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(Math.hypot(x,z)<1e-6) continue;
    const f=.5+.5*Math.cos(flutes*(Math.atan2(z,x)-twist(y+length/2))),k=1-depth*f*f*f;
    p.setXYZ(i,x*k,y,z*k);
  }
  g.computeVertexNormals();g.translate(0,length/2,0);
  return g;
}
// The form of a cutter: drill (twist, brad, forstner) or end mill (upcut, downcut, compression, straight).
export function cutterForm(cutter) {
  if(cutter.kind!=='drill') return cutter.kind;
  return cutter.diameter>=15?'forstner':cutter.diameter<=3?'twist':'brad';
}
// A cutter (cnc-machine.mjs CUTTERS, a drill bench bit {kind, diameter} or a
// router bit) with its shank, and with `holder` an ER collet nut and ISO 30
// holder banded in `color` (the colour of its layer). Returns {group, gauge}:
// the gauge length from the tip to the top of the holder.
export function cutterModel(cutter,{holder=true,color=null}={}) {
  const group=new THREE.Group(),d=cutter.diameter,r=d/2,form=['twist','brad','forstner'].includes(cutter.kind)?cutter.kind:cutterForm(cutter);
  const reach=Math.min(cutter.reach??Math.max(30,d*4),45),metal=steel();
  let top;
  if(form==='twist') {
    const tip=r*.6;
    add(group,cyl(r,0,tip,20),metal,[0,tip/2,0]);
    const body=add(group,flutedGeometry(r,reach,{turns:reach/(d*5.5)}),metal,[0,tip,0]);top=tip+reach;body.castShadow=true;
  } else if(form==='brad') {
    // Centre spur and two rim spurs below a fluted body.
    const spur=Math.max(1.2,r*.7);
    add(group,cyl(r*.22,0,spur,12),metal,[0,spur/2,0]);
    for(const side of [-1,1]) add(group,cyl(r*.14,0,spur*.6,8),metal,[side*r*.82,spur*.7,0]);
    add(group,flutedGeometry(r,reach,{turns:reach/(d*6)}),metal,[0,spur*.4,0]);top=spur*.4+reach;
  } else if(form==='forstner') {
    // A wide flat head with a centre spur, two rim spurs and two cutting lips, on a slim shank.
    const spur=3,head=Math.min(14,r*.45+5);
    add(group,cyl(1.5,0,spur,10),metal,[0,spur/2,0]);
    add(group,cyl(r,r,head,40),metal,[0,spur+head/2,0]);
    for(const side of [-1,1]) {add(group,cyl(1.2,0,2.5,8),metal,[side*r*.92,spur-1,0]);add(group,box(r*.85,1.5,r*.35),paint(0x3a3f44,.4,.6),[side*r*.45,spur+head+.6,side*r*.2]);}
    const shank=Math.min(5,r*.4);add(group,cyl(shank,shank,reach,20),metal,[0,spur+head+reach/2,0]);top=spur+head+reach;
  } else {
    // Spiral and straight end mills: about a 30° helix (a lead of 5.4 × the diameter).
    const turns=form==='straight'?0:reach/(d*5.4)*(form==='downcut'?-1:1);
    const split=form==='compression'?Math.min(reach*.3,Math.max(4,d)):-1;
    add(group,flutedGeometry(r,reach,{flutes:cutter.flutes??2,turns,split,depth:form==='straight'?.42:(cutter.flutes??2)===1?.5:.32}),metal);
    top=reach;
  }
  const shank=Math.min(6,Math.max(1.5,form==='forstner'?Math.min(5,r*.4):r));
  add(group,cyl(shank,shank,18,16),metal,[0,top+9,0]);top+=18;
  if(!holder) return {group,gauge:top};
  // ER collet nut (hex), ISO 30 taper and flange, with a band in the layer colour.
  add(group,cyl(17,17,22,6),paint(0x8c949b,.35,.7),[0,top+10,0]);
  add(group,cyl(22,30,34,32),paint(0x3b4248,.4,.5),[0,top+38,0]);
  add(group,cyl(32,32,8,32),paint(0x2a2f33,.4,.5),[0,top+59,0]);
  if(color!==null) add(group,cyl(30.6,30.6,5,32),paint(color,.45,.1),[0,top+45,0]);
  return {group,gauge:top+63};
}
// A circular saw blade in the x/y plane (axis along z), teeth round the rim:
// the cutting point is the bottom of the blade at the origin. A dado set is a
// thick stack of blades.
export function sawBlade(radius,kerf,{teeth=48}={}) {
  const group=new THREE.Group(),g=new THREE.CylinderGeometry(radius,radius,kerf,teeth*4,1),p=g.attributes.position;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),rr=Math.hypot(x,z);if(rr<radius*.98) continue;
    const t=(Math.atan2(z,x)/(2*Math.PI)*teeth%1+1)%1,k=.93+.07*t;   // sawtooth: a gullet, then the tooth
    p.setX(i,x*k);p.setZ(i,z*k);
  }
  g.computeVertexNormals();g.rotateX(Math.PI/2);
  // The lowest tooth tip touches the origin.
  g.computeBoundingBox();const centre=-g.boundingBox.min.y;
  add(group,g,steel(),[0,centre,0]);
  // Arbor flange and nut; a dado set shows its stacked chippers.
  add(group,cyl(radius*.3,radius*.3,kerf+4,32),paint(0x3b4248,.4,.6),[0,centre,0],[Math.PI/2,0,0]);
  if(kerf>=5) for(let k=1;k<Math.floor(kerf/3);k++) add(group,cyl(radius*.92,radius*.92,.4,64),paint(0x2d3136,.5,.5),[0,centre,-kerf/2+k*3],[Math.PI/2,0,0]);
  return group;
}

// ---- Hand tools (workbench), lying along x with the working point at the origin.
function saw(group,{length,heel,toe,pitch,back=false}) {
  // The saw plate with its teeth along the bottom edge, then the handle at the heel.
  const shape=new THREE.Shape();shape.moveTo(0,0);
  const depth=pitch*.6;
  for(let x=0;x<length;x+=pitch) {shape.lineTo(Math.min(length,x+pitch*.7),depth);shape.lineTo(Math.min(length,x+pitch),0);}
  shape.lineTo(length,heel);shape.lineTo(0,toe);shape.lineTo(0,0);
  add(group,projectUVs(new THREE.ShapeGeometry(shape),{length:'x'}),Object.assign(steel(),{side:THREE.DoubleSide}));
  if(back) add(group,box(length+4,10,4),brass(),[length/2,toe+4,0]);
  const handle=back?rosewood():beech(),hx=length+45;
  add(group,box(26,heel*.9,18),handle,[hx,heel*.45+5,0],[0,0,-.25]);
  add(group,box(70,20,18),handle,[length+30,heel-2,0]);
  add(group,box(60,18,18),handle,[length+28,12,0]);
  for(const [x,y] of [[length-8,heel*.35],[length-8,heel*.7],[length+8,heel*.52]]) add(group,cyl(5,5,22,16),brass(),[x,y,0],[Math.PI/2,0,0]);
}
function benchPlane(group,length,{tote=true,width=55}={}) {
  const h=24;
  add(group,box(length,h,width),iron(),[length/2,h/2,0]);
  add(group,box(length*.3,4,width*.92),steel(),[length*.52,h+2,0]);                          // frog and lever cap
  add(group,box(70,6,width*.85),steel(),[length*.55,h+24,0],[0,0,-.8]);                       // iron and lever cap at 45°
  add(group,cyl(8,8,7,20),brass(),[length*.72,h+16,0],[Math.PI/2,0,0]);                       // depth adjuster
  if(tote) {add(group,box(22,78,20),rosewood(),[length*.84,h+36,0],[0,0,-.35]);add(group,box(34,16,20),rosewood(),[length*.8,h+72,0],[0,0,-.35]);}
  add(group,cyl(tote?15:13,tote?18:15,tote?38:22,24),rosewood(),[length*(tote?.16:.22),h+(tote?19:11),0]);   // knob
}
function chisel(group,{width,thick,blade,handle,mortise=false}) {
  add(group,box(width,blade,thick),steel(),[0,blade/2,0]);
  add(group,cyl(width*.45+3,width*.45+3,10,16),brass(),[0,blade+5,0]);
  add(group,cyl(mortise?15:13,mortise?16:15,handle,mortise?8:20),beech(),[0,blade+10+handle/2,0]);
  if(mortise) add(group,cyl(16,16,6,20),steel(),[0,blade+10+handle,0]);
}
function gauge(group,{mortise=false,knife=false}) {
  const beam=mortise?rosewood():beech();
  add(group,box(200,18,18),beam,[100,24,0]);
  add(group,box(24,64,64),beam,[150,24,0]);
  add(group,box(3,44,44),brass(),[137,24,0]);
  if(knife) add(group,box(4,16,10),steel(),[10,8,0]);else add(group,cyl(1,0,12,8),steel(),[10,9,0]);
  if(mortise) {add(group,box(120,4,8),brass(),[60,34,0]);add(group,cyl(1,0,12,8),steel(),[10,9,7]);add(group,cyl(6,6,14,16),brass(),[205,24,0],[0,0,Math.PI/2]);}
}
// A hand tool from the tool chest (tool-chest.mjs) by its id; `color` tints a brush's bristles.
// Planes are placed with their mouth (where the iron cuts) and saws with the middle
// of their teeth at the origin, the point they work at.
const WORKING={'jack-plane':198,'smoothing-plane':132,'jointer-plane':308,'block-plane':88,'shooting-board':198,'rabbet-plane':105,'plough-plane':118,'shoulder-plane':85,
  'panel-saw-crosscut':260,'panel-saw-rip':280,'carcass-saw':150,'tenon-saw':175,'dovetail-saw':115};
export function handTool(id,options={}) {
  const g=new THREE.Group(),tool=buildHandTool(id,options);tool.position.x=-(WORKING[id]??0);g.add(tool);return g;
}
function buildHandTool(id,{color=0xc0392b}={}) {
  const g=new THREE.Group();
  switch(id) {
    case 'rule':
      add(g,cyl(32,32,28,32),paint(0xf2c230,.5),[0,34,0],[Math.PI/2,0,0]);add(g,cyl(12,12,30,20),paint(0x1c1f24,.5),[0,34,0],[Math.PI/2,0,0]);
      add(g,box(150,.5,19),paint(0xe8d36a,.4,.5),[90,1,0]);add(g,box(2,9,19),steel(),[165,5,0]);break;
    case 'try-square': case 'combination-square':
      add(g,box(id==='try-square'?200:300,1.5,id==='try-square'?30:25),steel(),[id==='try-square'?100:150,1,0]);
      if(id==='try-square') {add(g,box(22,24,120),rosewood(),[0,12,-50]);for(const z of [-20,-50,-80]) add(g,cyl(3,3,25,12),brass(),[0,12,z]);}
      else {add(g,box(40,44,110),paint(0x3b4248,.4,.5),[110,22,-40]);add(g,cyl(4,4,30,12),paint(0x5cc46a,.2),[110,45,-60],[0,0,Math.PI/2]);add(g,cyl(8,8,10,20),brass(),[110,22,20],[Math.PI/2,0,0]);}
      break;
    case 'marking-gauge': gauge(g,{});break;
    case 'cutting-gauge': gauge(g,{knife:true});break;
    case 'mortise-gauge': gauge(g,{mortise:true});break;
    case 'marking-knife': {
      // A skewed blade standing on its edge, in a rosewood handle with brass rivets.
      const blade=new THREE.Shape();blade.moveTo(0,0);blade.lineTo(60,0);blade.lineTo(60,16);blade.lineTo(14,16);blade.lineTo(0,0);
      add(g,projectUVs(new THREE.ShapeGeometry(blade),{length:'x'}),Object.assign(steel(),{side:THREE.DoubleSide}));
      add(g,box(100,18,10),rosewood(),[108,9,0]);for(const x of [85,125]) add(g,cyl(2.5,2.5,11,10),brass(),[x,9,0],[Math.PI/2,0,0]);break;
    }
    case 'dividers':
      for(const side of [-1,1]) rod(g,[0,160,0],[side*40,0,0],2.5,steel());
      add(g,box(70,4,4),steel(),[0,90,0]);add(g,cyl(9,9,8,24),steel(),[0,166,0],[Math.PI/2,0,0]);add(g,cyl(5,5,14,16),brass(),[26,90,0],[0,0,Math.PI/2]);break;
    case 'awl': add(g,cyl(1.8,0,60,10),steel(),[0,30,0]);add(g,cyl(6,6,10,16),brass(),[0,65,0]);add(g,cyl(10,14,70,20),beech(),[0,105,0]);break;
    case 'panel-saw-crosscut': saw(g,{length:520,heel:125,toe:80,pitch:3.2});break;
    case 'panel-saw-rip': saw(g,{length:560,heel:130,toe:85,pitch:4.2});break;
    case 'carcass-saw': saw(g,{length:300,heel:80,toe:80,pitch:1.8,back:true});break;
    case 'tenon-saw': saw(g,{length:350,heel:100,toe:100,pitch:2.1,back:true});break;
    case 'dovetail-saw': saw(g,{length:230,heel:60,toe:60,pitch:1.1,back:true});break;
    case 'jack-plane': benchPlane(g,360);break;
    case 'smoothing-plane': benchPlane(g,240);break;
    case 'jointer-plane': benchPlane(g,560,{width:60});break;
    case 'block-plane': benchPlane(g,160,{tote:false,width:42});break;
    case 'shooting-board': {const p=new THREE.Group();benchPlane(p,360);p.rotation.x=Math.PI/2;p.position.y=28;g.add(p);add(g,box(420,20,160),beech(),[180,-10,-60]);break;}
    case 'card-scraper': for(const side of [-1,1]) add(g,box(76,60,1),steel(),[75+side*37,30,-3],[0,side*.08,0]);break;   // flexed between the thumbs
    case 'rabbet-plane':
      add(g,box(210,55,32),iron(),[105,28,0]);add(g,box(170,30,6),iron(),[100,16,-30]);rod(g,[60,20,-12],[60,20,-30],4,steel());
      add(g,cyl(12,14,30,20),rosewood(),[45,70,0]);add(g,box(20,70,18),rosewood(),[170,80,0],[0,0,-.35]);break;
    case 'plough-plane':
      add(g,box(230,70,12),steel(),[115,35,0]);add(g,box(200,50,10),rosewood(),[110,30,-70]);
      for(const x of [60,170]) rod(g,[x,35,0],[x,35,-80],5,steel());
      add(g,box(22,78,20),rosewood(),[200,95,4],[0,0,-.35]);add(g,box(4,30,6),steel(),[118,10,0]);break;
    case 'router-plane':
      add(g,box(170,10,80),iron(),[0,10,0]);for(const x of [-70,70]) add(g,cyl(16,14,40,20),rosewood(),[x,35,0]);
      add(g,cyl(6,6,70,16),steel(),[0,45,0]);add(g,box(14,4,8),steel(),[0,2,0]);add(g,cyl(10,10,6,20),brass(),[0,60,0]);break;
    case 'shoulder-plane':
      add(g,box(170,50,20),paint(0x9d7a3c,.35,.75),[85,25,0]);add(g,cyl(25,25,20,24),paint(0x9d7a3c,.35,.75),[85,50,0],[Math.PI/2,0,0]);
      add(g,box(60,6,16),steel(),[85,60,0],[0,0,-.6]);add(g,cyl(8,8,6,20),brass(),[30,45,12],[Math.PI/2,0,0]);break;
    case 'bench-chisels': chisel(g,{width:20,thick:4,blade:110,handle:110});break;
    case 'mortise-chisel': chisel(g,{width:10,thick:14,blade:120,handle:110,mortise:true});break;
    case 'paring-chisel': chisel(g,{width:20,thick:3,blade:170,handle:130});break;
    case 'brace-and-bits': {
      add(g,flutedGeometry(6,150,{turns:5}),steel());add(g,cyl(2.5,0,8,10),steel(),[0,-2,0]);
      const s=steel();add(g,cyl(10,14,50,20),s,[0,175,0]);
      rod(g,[0,200,0],[0,260,0],6,s);rod(g,[0,260,0],[120,260,0],6,s);rod(g,[120,260,0],[120,380,0],6,s);rod(g,[120,380,0],[0,380,0],6,s);rod(g,[0,380,0],[0,440,0],6,s);
      add(g,cyl(14,14,90,20),rosewood(),[120,320,0]);add(g,cyl(32,28,26,28),rosewood(),[0,455,0]);break;
    }
    case 'hand-drill': {
      add(g,flutedGeometry(2.5,50,{turns:3}),steel());add(g,cyl(8,6,30,20),steel(),[0,65,0]);rod(g,[0,80,0],[0,300,0],6,steel());
      const wheel=sawBlade(45,6,{teeth:40});wheel.rotation.y=Math.PI/2;wheel.position.set(12,160,0);g.add(wheel);
      rod(g,[12,205,0],[12,205,60],4,steel());add(g,cyl(8,8,40,16),rosewood(),[12,205,80],[Math.PI/2,0,0]);
      add(g,cyl(16,14,80,20),rosewood(),[0,340,0]);add(g,cyl(10,10,60,16),rosewood(),[0,250,-40],[Math.PI/2,0,0]);break;
    }
    case 'gimlet': add(g,flutedGeometry(2,60,{turns:6}),steel());add(g,cyl(1.5,0,6,10),steel(),[0,-1,0]);add(g,box(80,14,14),beech(),[0,70,0]);break;
    case 'brush': add(g,box(45,40,12),paint(color,.9),[0,20,0]);add(g,box(47,22,14),steel(),[0,51,0]);add(g,box(30,120,12),beech(),[0,121,0]);break;
    default: add(g,box(40,40,40),paint(0x9aa1a6),[0,20,0]);
  }
  return g;
}
