import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {rotationMatrix,normaliseRotation,rotateAboutWorldAxis,boxCorners,squareTo,boxPenetration,matrixAxes,IDENTITY} from './design-transform.mjs';
import * as D from './furniture-design-edit.mjs';
import {partCollisions,cncPlan} from './design-cnc.mjs';
const close=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,`${m??''} ${a} != ${b}`);
const ids=p=>{let n=0;return ()=>p+(++n);};
const box=()=>D.createDesign({id:'box',name:'Box',template:'box',makeId:ids('b')});

test('rotation matrices and angles match three.js XYZ Euler rotations',()=>{
  for(const r of [{x:30,y:0,z:0},{x:10,y:-45,z:120},{x:-170,y:80,z:5},{x:0,y:90,z:0}]) {
    const ours=rotationMatrix(r),theirs=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r.x*Math.PI/180,r.y*Math.PI/180,r.z*Math.PI/180,'XYZ')).elements;
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) close(ours[i][j],theirs[j*4+i],`${JSON.stringify(r)} [${i}][${j}]`);
    const back=rotationMatrix(rotateAboutWorldAxis(r,'x',0));
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) close(back[i][j],ours[i][j],'round trip');
  }
});

test('angles normalise to (−180, 180] and a zero rotation is not stored',()=>{
  assert.deepEqual(normaliseRotation({x:270,y:-450,z:180}),{x:-90,y:-90,z:180});
  assert.equal(normaliseRotation({x:360,y:0,z:-720}),undefined);
  assert.equal(normaliseRotation(undefined),undefined);
  assert.deepEqual(normaliseRotation({y:15}),{x:0,y:15,z:0});
  assert.throws(()=>normaliseRotation({x:NaN}),/finite degrees/);
  let r;for(let i=0;i<4;i++) r=rotateAboutWorldAxis(r,'y',90);
  assert.equal(r,undefined,'four quarter turns return to no rotation');
  assert.deepEqual(rotateAboutWorldAxis(undefined,'z',-15),{x:0,y:0,z:-15});
});

test('turning about a world axis turns the piece corners about its centre',()=>{
  const local={min:{x:0,y:0,z:0},max:{x:100,y:20,z:40}},centre={x:50,y:10,z:20};
  const start={x:20,y:-35,z:10},turned=rotateAboutWorldAxis(start,'y',30);
  const a=boxCorners(local,start,centre),b=boxCorners(local,turned,centre),m=rotationMatrix({x:0,y:30,z:0});
  a.forEach((p,i)=>{const d={x:p.x-centre.x,y:p.y-centre.y,z:p.z-centre.z};
    for(const [k,row] of [['x',0],['y',1],['z',2]]) close(b[i][k],centre[k]+m[row][0]*d.x+m[row][1]*d.y+m[row][2]*d.z,k);});
});

test('square frames and oriented-box penetration',()=>{
  assert.equal(squareTo(IDENTITY,rotationMatrix({x:90,y:0,z:180})),true);
  assert.equal(squareTo(rotationMatrix({x:0,y:30,z:0}),rotationMatrix({x:0,y:30,z:0})),true);
  assert.equal(squareTo(IDENTITY,rotationMatrix({x:0,y:45,z:0})),false);
  const cube=(size,rotation,c)=>boxCorners({min:{x:c.x-size/2,y:c.y-size/2,z:c.z-size/2},max:{x:c.x+size/2,y:c.y+size/2,z:c.z+size/2}},rotation,c);
  const axes=r=>matrixAxes(rotationMatrix(r));
  close(boxPenetration(cube(10,undefined,{x:0,y:0,z:0}),axes(),cube(10,undefined,{x:8,y:0,z:0}),axes()),2);
  assert.ok(boxPenetration(cube(10,undefined,{x:0,y:0,z:0}),axes(),cube(10,undefined,{x:10,y:0,z:0}),axes())<=0,'touching');
  const diamond={x:0,y:0,z:45};
  assert.ok(boxPenetration(cube(10,undefined,{x:0,y:0,z:0}),axes(),cube(10,diamond,{x:12.2,y:0,z:0}),axes(diamond))<=0,'a diamond clear of the cube (half-diagonal 7.07)');
  assert.ok(boxPenetration(cube(10,undefined,{x:0,y:0,z:0}),axes(),cube(10,diamond,{x:11,y:0,z:0}),axes(diamond))>0,'its corner reaches in');
});

test('rotation is stored only when set, validated and kept through edits',()=>{
  let {design,partId}=D.addPart(D.createDesign({id:'d',name:'D',makeId:ids('l')}),'bar',{makeId:ids('p')});
  assert.equal('rotation' in design.parts[0],false);
  design=D.updatePart(design,partId,{rotation:{x:0,y:405,z:0}});assert.deepEqual(design.parts[0].rotation,{x:0,y:45,z:0});
  assert.throws(()=>D.updatePart(design,partId,{rotation:{x:'a'}}),/finite degrees/);
  assert.deepEqual(D.duplicatePart(design,partId,ids('c')).design.parts[1].rotation,{x:0,y:45,z:0});
  assert.deepEqual(D.convertPart(design,partId,'tube').parts[0].rotation,{x:0,y:45,z:0});
  assert.equal('rotation' in D.updatePart(design,partId,{rotation:{x:0,y:0,z:0}}).parts[0],false);
  const wide=D.partWorldBox(D.updatePart(design,partId,{rotation:{x:0,y:0,z:90}}).parts[0]);
  close(wide.size.x,700);close(wide.size.y,45);close(wide.size.z,45);
  close(D.designBounds(design).size.x,45*Math.SQRT2,'world bounds include rotation');
});

test('a rigidly rotated carcass keeps its joints; removing a groove still collides',()=>{
  for(const [axis,degrees] of [['y',30],['x',90],['z',-17.5]]) {
    const design=box(),turned=D.rotatePartsAbout(design,design.parts.map(p=>p.id),axis,degrees);
    assert.deepEqual(partCollisions(turned),[],`${axis} ${degrees}`);
    const before=D.designBounds(design),after=D.designBounds(turned);
    for(const k of ['x','y','z']) close((after.min[k]+after.max[k])/2,(before.min[k]+before.max[k])/2,'turns about the common centre');
    const groove=turned.parts[0].features.find(f=>f.type==='groove');
    assert.equal(partCollisions(D.removeFeature(turned,groove.id)).length,1,`${axis} ${degrees} groove removed`);
    assert.deepEqual(cncPlan(turned).parts.map(p=>p.operations),cncPlan(design).parts.map(p=>p.operations),'machining stays in each sheet frame');
  }
  const design=box();
  assert.deepEqual(D.rotatePartsAbout(D.rotatePartsAbout(design,design.parts.map(p=>p.id),'y',90),design.parts.map(p=>p.id),'y',-90),design,'turning back restores the design');
});

test('angled pieces are tested exactly, not by their bounding boxes',()=>{
  let design=D.createDesign({id:'d',name:'D',makeId:ids('l')}),panel,brace;
  ({design,partId:panel}=D.addPart(design,'panel',{makeId:ids('p'),overrides:{orientation:'front',x:0,y:0,z:0,length:600,width:600,thickness:18}}));
  ({design,partId:brace}=D.addPart(design,'bar',{makeId:ids('q'),overrides:{axis:'x',length:800,width:30,height:30,x:-100,y:285,z:100,rotation:{x:0,y:0,z:45}}}));
  assert.deepEqual(partCollisions(design),[],'a diagonal brace in front of the panel');
  // A block in the empty top-left corner of the brace's bounding box: boxes would overlap, the pieces do not.
  const corner=D.addPart(design,'bar',{makeId:ids('k'),overrides:{axis:'y',length:40,width:40,height:30,x:20,y:520,z:100}});
  const braceBox=D.partWorldBox(corner.design.parts.find(p=>p.id===brace)),blockBox=D.partWorldBox(corner.design.parts.at(-1));
  assert.ok(['x','y','z'].every(k=>blockBox.min[k]<braceBox.max[k]&&blockBox.max[k]>braceBox.min[k]),'bounding boxes do overlap');
  assert.deepEqual(partCollisions(corner.design),[],'the exact test sees the gap');
  const [first,second,third]=corner.design.parts;
  assert.deepEqual(partCollisions(D.validateDesign({...corner.design,parts:[first,third,second]})),[],'in either order');
  design=D.updatePart(design,brace,{z:0});
  assert.equal(partCollisions(design).length,1,'the same brace through the panel');
  design=D.updatePart(design,brace,{z:100,rotation:{x:0,y:-60,z:0}});
  assert.equal(partCollisions(design).length,1,'turned about y it passes through the panel');
  // A tilted dowel fully inside a deep pocket is received.
  let pocket=D.addFeature(D.updatePart(design,brace,{z:300,rotation:{x:0,y:0,z:45}}),panel,'pocket',ids('f'));
  design=D.updateFeature(pocket.design,pocket.featureId,{u:200,v:200,length:200,width:200,depth:17});
  ({design}=D.addPart(design,'cylinder',{makeId:ids('r'),overrides:{axis:'x',length:120,diameter:8,x:240,y:296,z:6,rotation:{x:0,y:0,z:30}}}));
  assert.deepEqual(partCollisions(design).map(c=>c.message),[]);
});
