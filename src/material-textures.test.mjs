import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {faceTexture,edgeTexture,endTexture,surfaceTexture,coreOf,plyCount,projectUVs,grainAxis,materialSwatch,TILE} from './material-textures.js';
import {WOOD_IDS,METAL_IDS} from '../shared/materials.mjs';
const grey=(t,i,j)=>t.image.data[(j*t.image.width+i)*4];
const mean=t=>{const d=t.image.data;let s=0;for(let k=0;k<d.length;k+=4) s+=d[k];return s/(d.length/4)/255;};

test('every catalogue material has a seamless face texture that tints its colour',()=>{
  for(const id of [...WOOD_IDS,...METAL_IDS]) {
    const t=faceTexture(id),{width:w,height:h}=t.image;
    assert.equal(t.userData.baked,false,id+': a tint');assert.equal(t.wrapS,THREE.RepeatWrapping);assert.equal(faceTexture(id),t,id+': cached');
    assert.ok(mean(t)>.8&&mean(t)<=1,`${id}: close to the flat colour (mean ${mean(t).toFixed(2)})`);
    // Opposite borders continue each other (the pattern repeats without a seam).
    let jump=0,inside=0;
    for(let j=0;j<h;j++) {jump+=Math.abs(grey(t,0,j)-grey(t,w-1,j));inside+=Math.abs(grey(t,w/2,j)-grey(t,w/2-1,j));}
    assert.ok(jump<=inside*2.5+h*2,`${id}: no seam across x (${jump} vs ${inside})`);
  }
  // Wood has visible grain: latewood rings make the across-grain profile vary.
  const oak=faceTexture('oak'),column=Array.from({length:512},(_,j)=>grey(oak,64,j));
  assert.ok(Math.max(...column)-Math.min(...column)>60,'oak grain has contrast');
  const white=faceTexture('white');assert.ok(mean(white)>.95,'melamine is nearly plain');
});

test('plywood edges show an odd number of plies with glue lines; board edges their core between the faces',()=>{
  assert.deepEqual([6,12,15,18,25].map(plyCount),[5,9,11,13,19]);assert.equal(plyCount(2),3);
  const ply=edgeTexture('birch',18),n=plyCount(18),h=ply.image.height;
  assert.equal(ply.userData.baked,true);assert.equal(edgeTexture('birch',18.1),ply,'rounded to 0.5 mm and cached');
  const row=y=>grey(ply,10,Math.min(h-1,Math.floor(y*h)));
  for(let k=1;k<n;k++) assert.ok(row(k/n)<row((k-.5)/n),'a glue line between plies '+k);
  const board=edgeTexture('white',18);
  assert.equal(board.userData.baked,true);assert.deepEqual([0,1,2].map(c=>board.image.data[c]),[232,232,226],'the white face skin at face B');
  assert.equal(edgeTexture('beech',18),faceTexture('beech'),'solid wood: side grain');
  assert.equal(endTexture('beech').userData.key,'end:beech');assert.equal(endTexture('steel'),faceTexture('steel'));
});

test('workshop surfaces and what a cut shows',()=>{
  for(const kind of ['mdf','concrete','chipboard','plycore']) assert.equal(surfaceTexture(kind).userData.baked,true,kind);
  assert.equal(surfaceTexture('brushed').userData.baked,false);assert.throws(()=>surfaceTexture('glass'),/Unknown surface/);
  assert.deepEqual([coreOf('birch',18).texture.userData.key,coreOf('birch',18).ply],['plycore',18/13]);
  assert.deepEqual([coreOf('white',18).texture.userData.key,coreOf('white',18).ply],['chipboard',0]);
  assert.deepEqual([coreOf('pine',18).texture.userData.key,coreOf('pine',18).baked],['face:pine',false]);
});

test('box projection runs the grain along the chosen axis in millimetres',()=>{
  const geometry=projectUVs(new THREE.BoxGeometry(2,.5,.1),{length:grainAxis({x:2,y:.5,z:.1}),unit:1000}),uv=geometry.attributes.uv,n=geometry.attributes.normal;
  assert.equal(grainAxis({x:.1,y:.7,z:.5}),'y');
  for(let i=0;i<uv.count;i++) {
    const p=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i);
    if(Math.abs(n.getZ(i))>.9) assert.deepEqual([uv.getX(i),uv.getY(i)].map(v=>Math.round(v*1e6)),[p.x*1000/TILE,p.y*1000/TILE].map(v=>Math.round(v*1e6)),'front face: x along the grain');
    if(Math.abs(n.getX(i))>.9) assert.deepEqual([uv.getX(i),uv.getY(i)].map(v=>Math.round(v*1e6)),[p.y*1000/TILE,p.z*1000/TILE].map(v=>Math.round(v*1e6)),'end face: across axes');
  }
});

test('each wood has the feature it is told apart by',()=>{
  const at=(t,x,y)=>t.image.data[(Math.floor(y*t.image.height)*t.image.width+Math.floor(x*t.image.width))*4]/255;
  const pine=faceTexture('pine');assert.ok(at(pine,.3,.62)<mean(pine)-.25,'pine: a dark knot');
  const birch=faceTexture('birch');assert.ok(at(birch,.55+.09*.95,.35)<at(birch,.55,.35)-.08,'birch: a repair patch with its outline');
  // Maple's curl: regular bands across the grain, 26 to a tile (the strength of that frequency along a row).
  const band=(t,y)=>{let re=0,im=0;const W=t.image.width;for(let i=0;i<W;i++) {const v=at(t,i/W,y),a=2*Math.PI*26*i/W;re+=v*Math.cos(a);im+=v*Math.sin(a);}return Math.hypot(re,im)/W;};
  const rows=[.1,.3,.5,.7,.9],curl=t=>rows.reduce((a,y)=>a+band(t,y),0)/rows.length;
  for(const other of ['beech','oak','walnut','pine','birch']) assert.ok(curl(faceTexture('maple'))>4*curl(faceTexture(other)),'maple: curly bands, unlike '+other);
  const beech=faceTexture('beech'),d=beech.image.data;let dark=0;for(let k=0;k<d.length;k+=4) if(d[k]<mean(beech)*255-30) dark++;
  assert.ok(dark>d.length/4*.005,'beech: dark ray flecks');
  assert.equal(materialSwatch('oak'),'','swatches are drawn in the browser');
});
