import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRoomPlacement,placedRoomPoint,roomFootprint,footprintsOverlap,floorPlanLayout} from './room-placement.mjs';
import {rectangle} from './geometry.mjs';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,switchProjectRoom,renameProjectRoom,withActiveRoom} from './project-rooms.mjs';
import {togglePointConstraint} from './room-constraints.mjs';
import {parseProjectJson,serializeProjectJson} from './project-json.mjs';
import {duplicateProject} from './duplicate-project.mjs';
import {createRoomHistories} from './room-history.mjs';
import {createHistory,commitHistory} from './history.mjs';
import {createTimeline,appendVersion,stateAt,withElement,projectElements,validateTimeline} from './timeline.mjs';
import {storeDraft,readDrafts,RECOVERY_KEY} from './recovery.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Floor plan',room:{width:6,depth:4,height:2.8}});
const two=()=>addProjectRoom(base(),{id:'room-kitchen',name:'Kitchen'});
test('placements require finite bounded coordinates and normalize rotations without mutating input',()=>{
 const input={x:4,z:-3,rotation:-90};assert.deepEqual(validateRoomPlacement(input),{x:4,z:-3,rotation:270});assert.equal(input.rotation,-90);
 assert.deepEqual(validateRoomPlacement({x:0,z:0,rotation:720}),{x:0,z:0,rotation:0});
 for(const p of [null,{}, {x:'0',z:0,rotation:0},{x:NaN,z:0,rotation:0},{x:0,z:Infinity,rotation:0},{x:1001,z:0,rotation:0},{x:0,z:0,rotation:3601}]) assert.throws(()=>validateRoomPlacement(p));
});
test('placement rotates about the local origin and translates in world X/Z',()=>{
 const point=placedRoomPoint({x:2,z:1},{x:10,z:20,rotation:90});assert.ok(Math.abs(point.x-11)<1e-10);assert.ok(Math.abs(point.z-18)<1e-10);
 assert.deepEqual(placedRoomPoint({x:2,z:1}),{x:2,z:1});
});
test('interior overlaps are detected while touching edges/corners and gaps are allowed',()=>{
 const a=rectangle(6,4),at=(x,z)=>a.map(p=>({x:p.x+x,z:p.z+z}));
 assert.equal(footprintsOverlap(a,at(0,0)),true);assert.equal(footprintsOverlap(a,at(5.9,0)),true);
 assert.equal(footprintsOverlap(a,at(6,0)),false);assert.equal(footprintsOverlap(a,at(6,4)),false);assert.equal(footprintsOverlap(a,at(7,0)),false);
});
test('rotated thin rooms with overlapping bounding boxes can still be separated',()=>{
 const entry={room:{outline:rectangle(6,.2)},placement:{x:0,z:0,rotation:45}},a=roomFootprint(entry),b=roomFootprint({...entry,placement:{x:.5,z:.5,rotation:45}});
 assert.equal(footprintsOverlap(a,b),false);assert.equal(footprintsOverlap(a,roomFootprint({...entry,placement:{x:.05,z:.05,rotation:45}})),true);
});
test('overview contains transformed bounds, names, centres and advisory overlap pairs',()=>{
 const original=two(),overlap=floorPlanLayout(original.rooms);assert.equal(overlap.overlaps.length,1);
 const placed=setProjectRoomPlacement(original,'room-kitchen',{x:6,z:0,rotation:0}),layout=floorPlanLayout(placed.rooms);
 assert.equal(layout.overlaps.length,0);assert.equal(layout.rooms[1].centre.x,6);assert.equal(layout.rooms[1].centre.z,0);
 const [x,z,w,h]=layout.viewBox.split(' ').map(Number);for(const room of layout.rooms)for(const p of room.outline){assert.ok(p.x>x&&p.x<x+w&&p.z>z&&p.z<z+h);}
 assert.equal(original.schemaVersion,10);
});
test('placement preserves local geometry/constraints and geometry undo through room switching/editing',()=>{
 let p=two();p=validateProject(withActiveRoom(p,togglePointConstraint(p.room,'north-west')));
 const before=structuredClone(p),cache=createRoomHistories(),history=commitHistory(createHistory({...p.room,height:3}),p.room);cache.remember(p,history);
 const placed=setProjectRoomPlacement(p,'room-kitchen',{x:8,z:2,rotation:90});assert.equal(placed.schemaVersion,11);assert.deepEqual(placed.room,p.room);assert.deepEqual(p,before);
 assert.equal(cache.load(placed).past.length,1);assert.deepEqual(switchProjectRoom(placed,'room-1').rooms[1].placement,{x:8,z:2,rotation:90});
 const renamed=renameProjectRoom(placed,'room-kitchen','New name');assert.equal(renamed.schemaVersion,11);
 assert.deepEqual(validateProject(withActiveRoom(renamed,{...renamed.room,height:3.2})).rooms[1].placement,placed.rooms[1].placement);
 const added=addProjectRoom(placed,{id:'room-third',name:'Third'});assert.equal(added.schemaVersion,11);assert.deepEqual(added.rooms[1].placement,placed.rooms[1].placement);
});
test('old schemas reject placement data and inactive placements cannot bypass validation',()=>{
 const p=setProjectRoomPlacement(two(),'room-1',{x:0,z:0,rotation:0});
 assert.throws(()=>validateProject({...p,schemaVersion:10}),/schemaVersion 11/);
 const bad=structuredClone(p);bad.rooms[0].placement.x=Infinity;assert.throws(()=>validateProject(bad),/Room placement/);
 assert.throws(()=>setProjectRoomPlacement(p,'missing',{x:0,z:0,rotation:0}),/Unknown room/);
});
test('placement survives JSON, recovery, duplication and room-entry timeline restoration',()=>{
 const first=two(),p=setProjectRoomPlacement(first,'room-kitchen',{x:7,z:2,rotation:-90});
 assert.deepEqual(parseProjectJson(serializeProjectJson(p)),p);assert.deepEqual(duplicateProject(p).rooms,p.rooms);
 const storage=new Map();storage.getItem=k=>storage.get(k);storage.setItem=(k,v)=>storage.set(k,v);storeDraft(storage,'floorplan',p);assert.deepEqual(readDrafts(storage.getItem(RECOVERY_KEY))[0].project,p);
 let t=createTimeline(first,{at:0});t=appendVersion(t,first,p,{at:5000,label:'Placed Kitchen'});assert.deepEqual(stateAt(t,2),p);assert.doesNotThrow(()=>validateTimeline(t,validateProject));
 const previous=projectElements(first).get('roomEntry:room-kitchen').value,restored=validateProject(withElement(p,'roomEntry:room-kitchen',previous));assert.equal(restored.rooms[1].placement,undefined);assert.deepEqual(restored.room,p.room);
});
