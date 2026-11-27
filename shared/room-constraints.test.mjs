import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangle,moveCorner,moveCorners,validateOutline,scaleOutline} from './geometry.mjs';
import {cornerPoint,wallSegment} from './room-topology.mjs';
import {togglePointConstraint,setLengthConstraint,solveConstraints,constraintResidual,validateConstraints,CONSTRAINT_TOLERANCE} from './room-constraints.mjs';
import {validateProject} from './project.mjs';
import {parseProjectJson,serializeProjectJson} from './project-json.mjs';
import {createHistory,commitHistory,undoHistory,redoHistory} from './history.mjs';
import {duplicateProject} from './duplicate-project.mjs';
import {moveWall,replaceWall} from './room-construction.mjs';
import {storeDraft,readDrafts,RECOVERY_KEY} from './recovery.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Constraints',room:{width:6,depth:4,height:3}});
const normal=room=>validateProject({...base(),schemaVersion:8,room});
const constrained=()=>setLengthConstraint(togglePointConstraint(base().room,'north-west'),'north',6);

test('dragging a corner keeps its requested position and propagates fixed lengths to free neighbours',()=>{
  const room=setLengthConstraint(base().room,'north',6),before=structuredClone(room);
  const outline=moveCorner(room,'north-west',{x:-4,z:-2},.1,false),next={...room,outline};
  assert.deepEqual(cornerPoint(next,'north-west'),{x:-4,z:-2});
  assert.ok(Math.abs(wallSegment(next,'north').length-6)<=CONSTRAINT_TOLERANCE);
  assert.equal(cornerPoint(next,'north-east').x,2);
  assert.deepEqual(room,before);
});
test('locked points reject dragging, incompatible endpoint edits fail atomically',()=>{
  const room=constrained(),before=structuredClone(room);
  assert.throws(()=>moveCorner(room,'north-west',{x:-4,z:-2},.1,false),/locked point/);
  assert.throws(()=>moveCorners(room,{'north-west':{x:-3,z:-2},'north-east':{x:4,z:-2}},.1,false),/conflicts/);
  assert.deepEqual(room,before);
});
test('target lengths solve around locked points; mutually impossible lengths reject without mutation',()=>{
  const room=togglePointConstraint(base().room,'north-west');
  const fixed=setLengthConstraint(room,'north',5);
  assert.deepEqual(cornerPoint(fixed,'north-west'),{x:-3,z:-2});
  assert.ok(Math.abs(wallSegment(fixed,'north').length-5)<=CONSTRAINT_TOLERANCE);
  const both=togglePointConstraint(fixed,'north-east'),before=structuredClone(both);
  assert.throws(()=>setLengthConstraint(both,'north',7),/conflicts/);assert.deepEqual(both,before);
});
test('coupled lengths converge after a drag and scaling honours saved points',()=>{
  let room=setLengthConstraint(base().room,'north',6);room=setLengthConstraint(room,'east',4);
  const outline=moveCorner(room,'north-west',{x:-3.2,z:-2.1},.1,false);
  assert.ok(constraintResidual({...room,outline})<=CONSTRAINT_TOLERANCE);validateOutline(outline);
  const pinned=togglePointConstraint(room,'south-west');
  const scaled=solveConstraints(pinned,scaleOutline(pinned.outline,'x',7));
  assert.deepEqual(cornerPoint({...pinned,outline:scaled},'south-west'),cornerPoint(pinned,'south-west'));
});
test('nonconverging constraints are bounded and malformed constraints cannot enter saved projects',()=>{
  const room=base().room;
  for(const constraints of [null,{},[{type:'parallel'}],[{type:'point',corner:'missing',x:0,z:0}],[{type:'length',wall:'north',length:NaN}],[{type:'length',wall:'north',length:0}],Array(65).fill({type:'length',wall:'north',length:6}),[{type:'length',wall:'north',length:6},{type:'length',wall:'north',length:6}]])
    assert.throws(()=>normal({...room,constraints}));
  const impossible={...room,constraints:[{type:'length',wall:'north',length:100},{type:'length',wall:'east',length:.1},{type:'length',wall:'south',length:.1},{type:'length',wall:'west',length:.1}]};
  assert.throws(()=>solveConstraints(impossible,room.outline),/256 iterations/);
  assert.throws(()=>normal({...room,constraints:[{type:'length',wall:'north',length:5}]}),/violates/);
});
test('constraints persist in schema 8, JSON, duplicate, recovery and history; old formats remain unchanged',()=>{
  const project=normal(constrained());assert.equal(project.schemaVersion,8);
  assert.deepEqual(parseProjectJson(serializeProjectJson(project)),project);
  assert.deepEqual(duplicateProject(project).room,project.room);
  const storage=new Map();storage.getItem=key=>storage.get(key);storage.setItem=(key,value)=>storage.set(key,value);
  storeDraft(storage,'test',project);assert.deepEqual(readDrafts(storage.getItem(RECOVERY_KEY))[0].project,project);
  let history=commitHistory(createHistory(base().room),project.room);
  assert.deepEqual(undoHistory(history).present,base().room);
  assert.deepEqual(redoHistory(undoHistory(history)).present,project.room);
  assert.throws(()=>validateProject({...project,schemaVersion:7}),/schemaVersion 8/);
  assert.equal(base().schemaVersion,6);assert.equal(base().room.constraints,undefined);
  const removed=setLengthConstraint(togglePointConstraint(project.room,'north-west'),'north',null);
  assert.equal(normal(removed).schemaVersion,6);
});
test('wall construction cannot silently break constraints or retire constrained identities',()=>{
  const room=constrained();
  assert.throws(()=>moveWall(room,'west',1),/violates/);
  assert.throws(()=>replaceWall(room,'north',[{a:{x:-3,z:-2},b:{x:0,z:-2.5}},{a:{x:0,z:-2.5},b:{x:3,z:-2}}]),/valid/);
  assert.doesNotThrow(()=>moveWall(room,'south',.5));
  assert.throws(()=>togglePointConstraint({...room,locked:true},'north-east'),/locked/);
  assert.throws(()=>setLengthConstraint({...room,locked:true},'north',5),/locked/);
});
