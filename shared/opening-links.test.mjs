import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,switchProjectRoom,withActiveRoom} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {connectRoomOpening,unlinkRoomOpening} from './opening-links.mjs';
import {openingConnectionSegments} from './opening-connections.mjs';
import {serializeProjectJson,parseProjectJson} from './project-json.mjs';
import {duplicateProject} from './duplicate-project.mjs';
import {createTimeline,appendVersion,stateAt,projectElements,withElement,validateTimeline} from './timeline.mjs';
import {storeDraft,readDrafts,RECOVERY_KEY} from './recovery.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Connections',room:{width:6,depth:4,height:2.8}});
export function connectionProject(type='door') {
 let p=setProjectRoomPlacement(addProjectRoom(base(),{id:'room-kitchen',name:'Kitchen'}),'room-kitchen',{x:6,z:0,rotation:0});
 p=switchProjectRoom(p,'room-1');p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'source',type,wall:'east',offset:1,width:.9,height:type==='door'?2.1:1,sill:type==='door'?0:.8}]}));
 return switchProjectRoom(p,'room-kitchen');
}
export const connect=p=>connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-1',openingId:'source',id:'connection-1',pairedOpeningId:'paired'});
test('connecting creates an aligned mirrored counterpart atomically and keeps the active alias valid',()=>{
 const p=connectionProject(),before=structuredClone(p),next=connect(p);assert.equal(next.schemaVersion,12);assert.equal(next.activeRoomId,'room-kitchen');
 assert.equal(next.room.openings.length,1);const o=next.room.openings[0];assert.equal(o.wall,'west');assert.equal(o.offset,2.1);assert.equal(o.hinge,'B');assert.equal(o.swing,'out');
 assert.deepEqual(next.openingLinks,[{id:'connection-1',a:{roomId:'room-1',openingId:'source'},b:{roomId:'room-kitchen',openingId:'paired'}}]);
 assert.deepEqual(p,before);const [marker]=openingConnectionSegments(next.rooms,next.openingLinks);assert.deepEqual(marker.start,{x:3,z:-1});assert.ok(Math.abs(marker.end.z+.1)<1e-9);
});
test('windows connect and compatible existing target openings are reused without duplicates',()=>{
 let p=connectionProject('window');p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'existing',type:'window',wall:'west',offset:2.1,width:.9,height:1,sill:.8}]}));
 const next=connect(p);assert.equal(next.room.openings.length,1);assert.equal(next.openingLinks[0].b.openingId,'existing');assert.equal(next.room.openings[0].type,'window');
});
test('connecting from the reverse side maps offsets and canonicalizes endpoint order',()=>{
 let p=connectionProject();p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'back',type:'door',wall:'west',offset:2.1,width:.9,height:2.1,sill:0,hinge:'B',swing:'out'}]}));
 const next=connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-kitchen',openingId:'back',id:'reverse',pairedOpeningId:'unused'});
 assert.equal(next.openingLinks[0].a.openingId,'source');assert.equal(next.openingLinks[0].b.openingId,'back');assert.equal(next.rooms[0].room.openings.length,1);
});
test('blocked creation, locked rooms and incompatible existing doors leave the project unchanged',()=>{
 const p=connectionProject(),before=structuredClone(p);
 const low=validateProject(withActiveRoom(p,{...p.room,height:1.5}));assert.throws(()=>connect(low),/Opening must fit/);
 const locked=validateProject(withActiveRoom(p,{...p.room,locked:true}));assert.throws(()=>connect(locked),/locked/);
 const wrong=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'wrong',type:'door',wall:'west',offset:2.1,width:.9,height:2.1,sill:0,hinge:'A',swing:'in'}]}));assert.throws(()=>connect(wrong),/incompatible/);
 assert.throws(()=>connectRoomOpening(p,{candidateId:'stale'}),/no longer exists/);assert.deepEqual(p,before);
});
test('a connection rejects dangling, duplicate and misaligned edits until explicitly unlinked',()=>{
 const p=connect(connectionProject()),before=structuredClone(p);
 assert.throws(()=>setProjectRoomPlacement(p,'room-kitchen',{x:7,z:0,rotation:0}),/no longer align/);
 assert.throws(()=>validateProject(withActiveRoom(p,{...p.room,openings:[]})),/missing/);
 assert.throws(()=>validateProject(withActiveRoom(p,{...p.room,openings:p.room.openings.map(o=>({...o,offset:o.offset+.1}))})),/no longer align/);
 assert.throws(()=>validateProject({...p,openingLinks:[...p.openingLinks,{...p.openingLinks[0],id:'duplicate'}]}),/only one connection/);
 assert.throws(()=>validateProject(withActiveRoom(p,{...p.room,openings:p.room.openings.map(o=>({...o,offset:o.offset+.000009,width:o.width+.000009}))})),/no longer align/);
 assert.throws(()=>validateProject({...p,schemaVersion:11}),/schemaVersion 12/);
 const unlinked=unlinkRoomOpening(p,'connection-1');assert.equal(unlinked.openingLinks,undefined);assert.deepEqual(unlinked.rooms,p.rooms);assert.doesNotThrow(()=>setProjectRoomPlacement(unlinked,'room-kitchen',{x:7,z:0,rotation:0}));assert.deepEqual(p,before);
});
test('rotated rooms retain world alignment and source openings must fit the shared interval',()=>{
 let p=connectionProject();p=setProjectRoomPlacement(p,'room-kitchen',{x:6*Math.SQRT1_2,z:-6*Math.SQRT1_2,rotation:45});p=setProjectRoomPlacement(p,'room-1',{x:0,z:0,rotation:45});
 assert.equal(connect(p).openingLinks.length,1);
 const partial=setProjectRoomPlacement(connectionProject(),'room-kitchen',{x:6,z:3,rotation:0});assert.throws(()=>connect(partial),/entirely within/);
});
test('connection input rejects malformed records, excessive links and repeated IDs',()=>{
 const p=connect(connectionProject());
 for(const openingLinks of [null,{},Array(65).fill(p.openingLinks[0]),[{...p.openingLinks[0],id:''}],[{id:'bad',a:{roomId:'room-1',openingId:'missing'},b:p.openingLinks[0].b}],[p.openingLinks[0],p.openingLinks[0]]])assert.throws(()=>validateProject({...p,openingLinks}));
 assert.throws(()=>unlinkRoomOpening(p,'stale'),/no longer exists/);
});
test('connection metadata survives JSON, duplication, recovery and whole/link timeline restoration',()=>{
 const original=connectionProject(),p=connect(original);assert.deepEqual(parseProjectJson(serializeProjectJson(p)),p);assert.deepEqual(duplicateProject(p).openingLinks,p.openingLinks);
 const storage=new Map();storage.getItem=k=>storage.get(k);storage.setItem=(k,v)=>storage.set(k,v);storeDraft(storage,'links',p);assert.deepEqual(readDrafts(storage.getItem(RECOVERY_KEY))[0].project,p);
 let t=createTimeline(original,{at:0});t=appendVersion(t,original,p,{at:5000,label:'Connected openings'});assert.deepEqual(stateAt(t,2),p);assert.doesNotThrow(()=>validateTimeline(t,validateProject));
 const key='openingLink:connection-1',value=projectElements(p).get(key).value;assert.deepEqual(validateProject(withElement(unlinkRoomOpening(p,'connection-1'),key,value)),p);
});
