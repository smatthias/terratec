import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangle} from './geometry.mjs';
import {furnitureClearance,clearanceSettings} from './furniture-clearance.mjs';
import {evaluateFurniturePlacement} from './furniture-placement.mjs';
const item={id:'a',name:'Cabinet',type:'cabinet',x:0,z:0,width:1,depth:.4,height:1.2,rotation:0,thickness:.018,shelves:1};
const door={id:'door',type:'door',wall:'north',offset:2.5,width:1,height:2.1,sill:0,hinge:'A',swing:'in'};
const room={height:3,outline:rectangle(6,4),openings:[door],furniture:[{...item,x:2}]};
test('wall gaps measure rotated bodies against finite wall segments',()=>{
 assert.ok(Math.abs(furnitureClearance(room,item).nearestWall.distance-1.8)<1e-10);
 const angle=Math.PI/4,outline=room.outline.map(p=>({x:p.x*Math.cos(angle)+p.z*Math.sin(angle),z:-p.x*Math.sin(angle)+p.z*Math.cos(angle)}));
 assert.ok(Math.abs(furnitureClearance({...room,outline,openings:[]},{...item,rotation:45}).nearestWall.distance-1.8)<1e-10);
 assert.ok(furnitureClearance(room,{...item,z:-1.78}).issues.some(i=>i.code==='WALL_GAP'));
 assert.throws(()=>clearanceSettings({minWall:-1}));assert.throws(()=>clearanceSettings({doorDepth:NaN}));
});
test('opening planning zones respect door swing depth and window sill height',()=>{
 const near={...item,z:-.9,depth:.5};assert.ok(furnitureClearance(room,near).issues.some(i=>i.code==='DOOR_ZONE'));
 assert.ok(!furnitureClearance({...room,openings:[{...door,swing:'out'}]},near).issues.some(i=>i.code==='DOOR_ZONE'));
 const window={...door,id:'window',type:'window',sill:1.5,height:1};
 assert.ok(!furnitureClearance({...room,openings:[window]},{...item,z:-1.7}).issues.some(i=>i.code==='WINDOW_ZONE'));
 assert.ok(furnitureClearance({...room,openings:[window]},{...item,z:-1.7,height:1.8}).issues.some(i=>i.code==='WINDOW_ZONE'));
});
test('preview clearances are advisory unless explicitly enforced and do not mutate the room',()=>{
 const before=JSON.stringify(room),request={kind:'copy',sourceId:'a',id:'new',point:{x:0,z:-1}};
 const advisory=evaluateFurniturePlacement(room,request,.1,true,false);assert.equal(advisory.valid,true);assert.ok(advisory.clearance.issues.length);
 const strict=evaluateFurniturePlacement(room,request,.1,true,false,{enforce:true,minWall:.05,doorDepth:.6});assert.equal(strict.valid,false);assert.match(strict.error,/Clearance/);assert.equal(JSON.stringify(room),before);
});
test('door sweep follows hinge and excludes the unused corner of its bounding rectangle',()=>{
 const small={...item,width:.2,depth:.2,x:.35,z:-1.15};
 const report=hinge=>furnitureClearance({...room,openings:[{...door,hinge}]},small,{doorDepth:0,minWall:0});
 assert.equal(report('A').issues.length,0);
 assert.ok(report('B').zones.some(z=>z.kind==='sweep'&&z.polygon.length===66));
 assert.ok(!report('B').zones.some(z=>z.kind==='access'));
 const access=furnitureClearance(room,{...small,z:-1.7},{doorDepth:.6,minWall:0});
 assert.ok(access.zones.some(z=>z.kind==='access'));
});
test('sweep collision follows rotated walls and all hinge/swing combinations',()=>{
 for(const hinge of ['A','B'])for(const swing of ['in','out']){
  const sign=swing==='in'?1:-1;
  const cabinet={...item,width:.2,depth:.2,x:hinge==='A'?-.35:.35,z:-2+sign*.5};
  const opening={...door,hinge,swing};
  assert.ok(furnitureClearance({...room,openings:[opening]},cabinet,{doorDepth:0,minWall:0}).zones.some(z=>z.kind==='sweep'));
  const angle=.63,rotate=p=>({x:p.x*Math.cos(angle)+p.z*Math.sin(angle),z:-p.x*Math.sin(angle)+p.z*Math.cos(angle)});
  const rotated={...room,outline:room.outline.map(rotate),openings:[opening]};
  assert.ok(furnitureClearance(rotated,{...cabinet,...rotate(cabinet),rotation:angle*180/Math.PI},{doorDepth:0,minWall:0}).zones.some(z=>z.kind==='sweep'));
 }
});
test('analytic sweep catches edge crossings and permits circle tangency',()=>{
 const options={doorDepth:0,minWall:0};
 const crossing={...item,width:2,depth:.2,x:-.5,z:-1.05};
 assert.ok(furnitureClearance(room,crossing,options).zones.some(z=>z.kind==='sweep'));
 const tangent={...item,width:.2,depth:.2,x:-.5,z:-.9};
 assert.equal(furnitureClearance(room,tangent,options).zones.length,0);
});

test('project review aggregates cabinet issues without mutation and reacts to settings and fixes',async()=>{
 const {reviewFurnitureClearance}=await import('./furniture-clearance.mjs');
 const problem={...item,id:'problem',name:'Door unit',x:-.35,z:-1.5,width:.2,depth:.2};
 const projectRoom={...room,furniture:[{...item,x:2},problem]},before=JSON.stringify(projectRoom);
 const review=reviewFurnitureClearance(projectRoom);
 assert.equal(review.cabinetCount,2);assert.equal(review.affectedCount,1);
 assert.equal(review.issues[0].cabinetId,'problem');assert.equal(review.issues[0].cabinetName,'Door unit');assert.equal(review.issues[0].code,'DOOR_ZONE');
 assert.equal(JSON.stringify(projectRoom),before);
 assert.equal(reviewFurnitureClearance({...projectRoom,furniture:[{...problem,z:0}]}).issues.length,0);
 const close={...item,z:-1.78};
 assert.ok(reviewFurnitureClearance({...room,openings:[],furniture:[close]}).issues.length);
 assert.equal(reviewFurnitureClearance({...room,openings:[],furniture:[close]},{minWall:0}).issues.length,0);
 assert.deepEqual(reviewFurnitureClearance({...room,furniture:[]}),{cabinetCount:0,affectedCount:0,issues:[]});
 assert.throws(()=>reviewFurnitureClearance({...room,furniture:[]},{minWall:NaN}));
});
