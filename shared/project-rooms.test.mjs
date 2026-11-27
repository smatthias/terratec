import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from './project.mjs';
import {addProjectRoom,switchProjectRoom,renameProjectRoom,withActiveRoom,roomEntries,activeRoomId,activeRoomName} from './project-rooms.mjs';
import {togglePointConstraint,setLengthConstraint} from './room-constraints.mjs';
import {parseProjectJson,serializeProjectJson} from './project-json.mjs';
import {duplicateProject} from './duplicate-project.mjs';
import {storeDraft,readDrafts,RECOVERY_KEY} from './recovery.mjs';
import {createTimeline,appendVersion,stateAt,validateTimeline,projectElements,withElement} from './timeline.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'House',room:{width:6,depth:4,height:2.8}});
const add=p=>addProjectRoom(p,{id:'room-next',name:'Kitchen'});

test('legacy projects remain unchanged until rooms are added or named',()=>{
  const p=base(),before=structuredClone(p);
  assert.equal(activeRoomId(p),'room-1');assert.equal(activeRoomName(p),'Room 1');assert.equal(roomEntries(p).length,1);
  assert.deepEqual(switchProjectRoom(p,'room-1'),p);assert.deepEqual(p,before);assert.equal(p.schemaVersion,6);
  const renamed=renameProjectRoom(p,'room-1','Studio');assert.equal(renamed.schemaVersion,10);assert.equal(activeRoomName(renamed),'Studio');
});
test('switching preserves independent geometry, constraints, openings, furniture and locks',()=>{
  let first=base();
  first=validateProject(withActiveRoom(first,{...togglePointConstraint(first.room,'north-west'),locked:true,
    openings:[{id:'door',type:'door',wall:'north',offset:1,width:.9,height:2,sill:0}],
    furniture:[{id:'cab',type:'cabinet',name:'Cabinet',width:1,depth:.5,height:1,thickness:.018,shelves:1,x:0,z:0,rotation:0}]}));
  const saved=structuredClone(first.room),p=add(first);
  assert.equal(p.schemaVersion,10);assert.equal(p.rooms.length,2);assert.equal(activeRoomId(p),'room-next');assert.equal(activeRoomName(p),'Kitchen');
  assert.equal(p.room.constraints,undefined);assert.equal(p.room.furniture.length,0);assert.equal(p.room.openings.length,0);assert.equal(p.room.locked,undefined);
  const second=validateProject(withActiveRoom(p,setLengthConstraint(p.room,'north',5)));
  const switched=switchProjectRoom(second,'room-1');assert.deepEqual(switched.room,saved);
  assert.deepEqual(switchProjectRoom(switched,'room-next').room,second.room);
  assert.deepEqual(first.room,saved);
});
test('all rooms and active-room alias are validated; invalid inactive rooms cannot hide',()=>{
  const p=add(base()),before=structuredClone(p);
  const bad=structuredClone(p);bad.rooms[0].room.outline[0].x=NaN;
  assert.throws(()=>validateProject(bad));
  assert.throws(()=>validateProject({...p,room:{...p.room,height:4}}),/alias differs/);
  assert.throws(()=>validateProject({...p,activeRoomId:'missing'}),/Active room/);
  assert.throws(()=>validateProject({...p,schemaVersion:9}),/schemaVersion 10/);
  assert.deepEqual(p,before);
});
test('room collection rejects empty/oversize collections, duplicate IDs and invalid names',()=>{
  const p=add(base());
  for(const rooms of [[],null,[...p.rooms,p.rooms[0]],Array.from({length:17},(_,i)=>({...p.rooms[0],id:'room-'+i}))]) assert.throws(()=>validateProject({...p,rooms}));
  for(const name of ['',null,'x'.repeat(61)]) assert.throws(()=>renameProjectRoom(p,'room-next',name),/Room name/);
  for(const id of ['bad','room-','__proto__']) assert.throws(()=>addProjectRoom(base(),{id,name:'Room'}));
  assert.throws(()=>switchProjectRoom(p,'missing'),/Unknown room/);
  assert.throws(()=>renameProjectRoom(p,'missing','Name'),/Unknown room/);
  assert.throws(()=>addProjectRoom(p,{id:'room-next',name:'Duplicate'}),/unique/);
  const full=validateProject({...p,rooms:Array.from({length:16},(_,i)=>({...p.rooms[0],id:'room-'+i})),activeRoomId:'room-0',room:p.rooms[0].room});
  assert.throws(()=>addProjectRoom(full,{id:'room-new',name:'Too many'}),/16 rooms/);
});
test('JSON, duplication and recovery include every room and the selected room',()=>{
  const p=renameProjectRoom(add(base()),'room-1','Bedroom');
  assert.deepEqual(parseProjectJson(serializeProjectJson(p)),p);
  const copy=duplicateProject(p);assert.deepEqual(copy.rooms,p.rooms);assert.equal(copy.activeRoomId,p.activeRoomId);
  const storage=new Map();storage.getItem=k=>storage.get(k);storage.setItem=(k,v)=>storage.set(k,v);
  storeDraft(storage,'rooms',p);assert.deepEqual(readDrafts(storage.getItem(RECOVERY_KEY))[0].project,p);
});
test('timeline snapshots and room-specific restoration do not mix equal wall/furniture IDs',()=>{
  const first=add(base());
  const second=validateProject(withActiveRoom(first,{...first.room,height:3.5}));
  let t=createTimeline(first,{at:0});t=appendVersion(t,first,second,{at:5000,label:'Kitchen height'});
  assert.deepEqual(stateAt(t,1),first);assert.deepEqual(stateAt(t,2),second);assert.doesNotThrow(()=>validateTimeline(t,validateProject));
  const key='roomEntry:room-next',entry=projectElements(first).get(key).value;
  const other=switchProjectRoom(second,'room-1'),restored=validateProject(withElement(other,key,entry));
  assert.equal(restored.room.height,2.8);assert.equal(switchProjectRoom(restored,'room-next').room.height,2.8);
  assert.equal(restored.activeRoomId,'room-1');
  assert.throws(()=>withElement(other,'furniture:old',undefined),/room entry history/);
  assert.throws(()=>withElement(other,'roomEntry:room-1',undefined),/missing active room/);
});
