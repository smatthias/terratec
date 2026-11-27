import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from './project.mjs';
import {moveCorner,validateOutline} from './geometry.mjs';
import {cornerIds,cornerPoint,wallSegment} from './room-topology.mjs';
import {setAngleConstraint,setLengthConstraint,togglePointConstraint,constraintResidual,CONSTRAINT_TOLERANCE,validateConstraints} from './room-constraints.mjs';
import {createHistory,commitHistory,undoHistory,redoHistory} from './history.mjs';
import {serializeProjectJson,parseProjectJson} from './project-json.mjs';
import {duplicateProject} from './duplicate-project.mjs';
import {moveWall,replaceWall} from './room-construction.mjs';
const project=()=>validateProject({schemaVersion:1,units:'m',name:'Angles',room:{width:6,depth:4,height:3}});
const normal=room=>validateProject({...project(),schemaVersion:9,room});
const assertSolved=room=>{assert.ok(constraintResidual(room)<=CONSTRAINT_TOLERANCE);validateOutline(room.outline);normal(room);};

test('parallel walls remain parallel through corner dragging without moving the dragged point',()=>{
  const room=setAngleConstraint(project().room,'north','south','parallel'),before=structuredClone(room);
  const next={...room,outline:moveCorner(room,'north-west',{x:-3,z:-2.4},.1,false)};
  assert.deepEqual(cornerPoint(next,'north-west'),{x:-3,z:-2.4});assertSolved(next);assert.deepEqual(room,before);
});
test('perpendicular walls with a shared corner solve together with fixed lengths and a locked point',()=>{
  let room=togglePointConstraint(project().room,'south-west');
  room=setLengthConstraint(room,'north',6);
  room=setAngleConstraint(room,'north','east','perpendicular');
  const next={...room,outline:moveCorner(room,'north-west',{x:-3.15,z:-2.1},.1,false)};
  assertSolved(next);
  assert.deepEqual(cornerPoint(next,'south-west'),{x:-3,z:2});
  assert.ok(Math.abs(wallSegment(next,'north').length-6)<=CONSTRAINT_TOLERANCE);
});
test('adding a relationship adjusts a skewed room and leaves valid geometry',()=>{
  const room=project().room;room.outline[1]={x:3,z:-1.5};
  assertSolved(setAngleConstraint(room,'north','south','parallel'));
  assertSolved(setAngleConstraint(room,'north','east','perpendicular'));
});
test('inconsistent locked relationships fail atomically',()=>{
  let room=project().room;room.outline[1]={x:3,z:-1.5};
  for(const id of cornerIds(room)) room=togglePointConstraint(room,id);
  const before=structuredClone(room);
  assert.throws(()=>setAngleConstraint(room,'north','south','parallel'),/conflicts/);
  assert.deepEqual(room,before);
  assert.throws(()=>setAngleConstraint({...room,locked:true},'north','south','parallel'),/locked/);
});
test('wall pairs normalize independent of order; replacing or removing affects only that pair',()=>{
  let room=setAngleConstraint(project().room,'south','north','parallel');
  assert.deepEqual(room.constraints,[{type:'parallel',wall:'north',other:'south'}]);
  room=setAngleConstraint(room,'north','east','perpendicular');
  assert.equal(room.constraints.length,2);
  const removed=setAngleConstraint(room,'south','north',null);assert.equal(removed.constraints.length,1);
  assert.equal(removed.constraints[0].type,'perpendicular');
  assert.throws(()=>setAngleConstraint(room,'north','north','parallel'),/different/);
  assert.throws(()=>setAngleConstraint(room,'north','missing','parallel'),/Unknown wall/);
  assert.throws(()=>setAngleConstraint(room,'north','south','diagonal'),/Unknown wall relationship/);
});
test('validation rejects duplicate/reversed pairs, missing IDs, self-pairs and violated relationships',()=>{
  const room=project().room;
  for(const constraints of [
    [{type:'parallel',wall:'north',other:'north'}],
    [{type:'parallel',wall:'north',other:'absent'}],
    [{type:'parallel',wall:'north',other:'south'},{type:'perpendicular',wall:'south',other:'north'}],
    [{type:'perpendicular',wall:'north',other:'south'}]
  ]) assert.throws(()=>validateConstraints(constraints,room));
});
test('schema 9 JSON, duplicate and history preserve relationships; schema 8 rejects them',()=>{
  const p=normal(setAngleConstraint(project().room,'north','south','parallel'));
  assert.equal(p.schemaVersion,9);assert.deepEqual(parseProjectJson(serializeProjectJson(p)),p);
  assert.deepEqual(duplicateProject(p).room,p.room);
  const h=commitHistory(createHistory(project().room),p.room);
  assert.deepEqual(redoHistory(undoHistory(h)).present,p.room);
  assert.throws(()=>validateProject({...p,schemaVersion:8}),/schemaVersion 9/);
  const removed=setAngleConstraint(p.room,'south','north',null);
  assert.equal(normal(removed).schemaVersion,6);
});
test('construction rejects changes that invalidate or retire angular references',()=>{
  const room=setAngleConstraint(project().room,'north','east','perpendicular');
  assert.throws(()=>replaceWall(room,'north',[{a:{x:-3,z:-2},b:{x:0,z:-2.5}},{a:{x:0,z:-2.5},b:{x:3,z:-2}}]),/existing/);
  assert.doesNotThrow(()=>moveWall(room,'south',.25));
});
