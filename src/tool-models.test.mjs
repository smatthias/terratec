import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {flutedGeometry,cutterForm,cutterModel,sawBlade,handTool} from './tool-models.js';
import {toolIcon} from './tool-icons.js';
import {CUTTERS} from '../shared/cnc-machine.mjs';
import {TOOL_CHEST} from '../shared/tool-chest.mjs';
import {DRILL_BITS} from '../shared/drilling-bench.mjs';
const meshes=group=>{const out=[];group.traverse(o=>{if(o.isMesh) out.push(o);});return out;};
const bounds=group=>{group.updateMatrixWorld(true);return new THREE.Box3().setFromObject(group);};
// The angle of the deepest groove at a height of the fluted body.
function grooveAngle(geometry,y) {
  const p=geometry.attributes.position;let best=null;
  for(let i=0;i<p.count;i++) if(Math.abs(p.getY(i)-y)<1e-6) {const r=Math.hypot(p.getX(i),p.getZ(i));if(r>1e-6&&(!best||r<best.r)) best={r,a:Math.atan2(p.getZ(i),p.getX(i))};}
  return best.a;
}
const turned=(from,to)=>{let d=to-from;while(d>Math.PI/2) d-=Math.PI;while(d<-Math.PI/2) d+=Math.PI;return d;};   // two flutes: period π

test('spiral flutes wind one way for upcut, the other for downcut, and turn over on a compression cutter',()=>{
  const length=24,rows=Math.ceil(length/1.2),h=length/rows*4;
  const up=flutedGeometry(3,length,{turns:.5}),down=flutedGeometry(3,length,{turns:-.5}),straight=flutedGeometry(3,length,{turns:0});
  assert.ok(turned(grooveAngle(up,0),grooveAngle(up,h))>.1,'upcut: the groove turns one way going up');
  assert.ok(turned(grooveAngle(down,0),grooveAngle(down,h))<-.1,'downcut: the other way');
  assert.ok(Math.abs(turned(grooveAngle(straight,0),grooveAngle(straight,h)))<1e-6,'straight flutes');
  const split=length/rows*7,comp=flutedGeometry(3,length,{turns:.5,split});
  const below=turned(grooveAngle(comp,0),grooveAngle(comp,split)),above=turned(grooveAngle(comp,split),grooveAngle(comp,split+length/rows*6));
  assert.ok(below>0&&above<0,'compression: the helix turns over at the split');
});

test('every cutter and drill bit is modelled in its own form, tip at the origin',()=>{
  assert.deepEqual(CUTTERS.map(cutterForm),['twist','brad','brad','brad','forstner','forstner','upcut','upcut','downcut','compression','compression','straight','compression']);
  for(const c of CUTTERS) {
    const {group,gauge}=cutterModel(c,{color:'#d9382a'}),b=bounds(group);
    assert.ok(Math.abs(b.min.y)<.01,c.id+': tip at the origin');assert.ok(Math.abs(b.max.y-gauge)<.5,c.id+': gauge to the top of the holder');
    assert.ok(meshes(group).some(m=>m.material.color.getHex()===0xd9382a),c.id+': banded in its layer colour');
    assert.ok(b.max.x>=c.diameter/2-.01||c.diameter<=22,c.id+': its diameter');
  }
  for(const bit of DRILL_BITS) {const {group,gauge}=cutterModel(bit,{holder:false});assert.ok(gauge>30&&Math.abs(bounds(group).min.y)<.01,bit.id);}
  const forstner=bounds(cutterModel({kind:'forstner',diameter:35},{holder:false}).group),twist=bounds(cutterModel({kind:'twist',diameter:5},{holder:false}).group);
  assert.ok(forstner.max.x>17&&twist.max.x<2.6,'a hinge bit is wide, a twist drill slim');
});

test('saw blades have teeth round the rim; a dado set is a stack',()=>{
  const blade=sawBlade(150,3.2),radii=[];
  const bladeMesh=meshes(blade)[0],centre=bladeMesh.position.y;bladeMesh.geometry.attributes.position.array.forEach((v,i,a)=>{if(i%3===0) radii.push(Math.hypot(a[i],a[i+1]));});
  const rim=radii.filter(r=>r>130);assert.ok(Math.min(...rim)<150*.95&&Math.max(...rim)>149.9,'gullets and tooth tips');
  assert.ok(Math.abs(bounds(blade).min.y)<.01,'cuts at the origin');
  assert.ok(meshes(sawBlade(150,12)).length>meshes(blade).length,'chippers in a dado set');
});

test('every hand tool in use has a model of its own, and every tool an icon',()=>{
  const usable=TOOL_CHEST.filter(t=>t.action),shapes=new Map();
  for(const t of usable) {
    const group=handTool(t.id),parts=meshes(group);
    assert.ok(parts.length>=2,t.id+': made of its parts, not a box');
    assert.ok(parts.every(m=>m.castShadow),t.id+': casts a shadow');
    const b=bounds(group);assert.ok(b.min.y<2&&b.max.y>10,t.id+': working point at the bench');
    shapes.set(t.id,parts.length+':'+b.getSize(new THREE.Vector3()).toArray().map(Math.round).join('x'));
  }
  const families=[['jack-plane','smoothing-plane','jointer-plane'],['carcass-saw','tenon-saw','dovetail-saw'],['bench-chisels','mortise-chisel','paring-chisel']];
  for(const family of families) assert.equal(new Set(family.map(id=>shapes.get(id))).size,3,family.join(', ')+': told apart by size and build');
  assert.equal(meshes(handTool('brush',{color:0x2e7d5b})).find(m=>m.material.color.getHex()===0x2e7d5b)!==undefined,true,'bristles in the finish');
  const fallback=toolIcon('no such tool');
  for(const t of TOOL_CHEST) assert.notEqual(toolIcon(t.id),fallback,t.id+': an icon');
  for(const name of ['twist','brad','forstner','upcut','downcut','compression','straight','saw','dado','router']) assert.notEqual(toolIcon(name),fallback,name);
  assert.notEqual(toolIcon('upcut'),toolIcon('downcut'));
});
