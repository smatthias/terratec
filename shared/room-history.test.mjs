import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRoomHistories} from './room-history.mjs';
import {createHistory,commitHistory,undoHistory} from './history.mjs';
import {validateProject} from './project.mjs';
import {addProjectRoom,withActiveRoom,switchProjectRoom} from './project-rooms.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Undo rooms',room:{width:6,depth:4,height:2.8}});
test('geometry undo is retained per room and never applies another room history',()=>{
 const cache=createRoomHistories(),p=base(),first=validateProject(withActiveRoom(p,{...p.room,height:3}));
 const history=commitHistory(createHistory(p.room),first.room);cache.remember(first,history);
 const kitchen=addProjectRoom(first,{id:'room-kitchen',name:'Kitchen'}),edited=validateProject(withActiveRoom(kitchen,{...kitchen.room,height:4}));
 cache.remember(edited,commitHistory(cache.load(kitchen),edited.room));
 const back=switchProjectRoom(edited,'room-1'),loaded=cache.load(back);
 assert.equal(loaded.present.height,3);assert.equal(undoHistory(loaded).present.height,2.8);
 assert.equal(undoHistory(cache.load(edited)).present.height,2.8);
 loaded.present.height=9;assert.equal(cache.load(back).present.height,3);
});
test('external model changes invalidate cached history and clearing removes all project sessions',()=>{
 const cache=createRoomHistories(),p=base();cache.remember(p,commitHistory(createHistory({...p.room,height:2}),p.room));
 const changed=validateProject(withActiveRoom(p,{...p.room,height:3}));assert.equal(cache.load(changed).past.length,0);
 cache.clear();assert.equal(cache.load(p).past.length,0);
});
