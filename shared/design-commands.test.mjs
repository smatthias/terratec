import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareDesignCommands,applyPreparedDesignCommands} from './design-commands.mjs';
import {validateProject} from './project.mjs';
import {activeRoomId,withActiveRoom,addProjectRoom} from './project-rooms.mjs';
import {createHistory,commitHistory} from './history.mjs';
import {travelRoomHistory} from './room-history.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Commands',room:{width:6,depth:4,height:2.8}});
const cabinet=(id='command-a',x=0)=>({id,name:id,width:.6,depth:.4,height:1.2,x,z:0});
const batch=(p,commands,other={})=>JSON.stringify({version:1,units:'m',roomId:activeRoomId(p),commands,...other});
test('command batch changes furniture atomically and travels through history as one step',()=>{
 const p=base(),before=structuredClone(p),prepared=prepareDesignCommands(p,batch(p,[{op:'add-cabinet',item:cabinet()},{op:'move',id:'command-a',x:1,z:0},{op:'rotate',id:'command-a',rotation:90},{op:'rename',id:'command-a',name:'Renamed'}]));
 assert.deepEqual(p,before);assert.equal(prepared.count,4);assert.equal(prepared.changes.length,1);const next=applyPreparedDesignCommands(p,prepared);assert.equal(next.room.furniture[0].name,'Renamed');assert.equal(next.room.furniture[0].x,1);assert.equal(next.room.furniture[0].rotation,90);
 const history=commitHistory(createHistory(p.room),next.room);assert.equal(history.past.length,1);const undo=travelRoomHistory(next,history,'undo');assert.deepEqual(undo.project,p);assert.deepEqual(travelRoomHistory(undo.project,undo.history,'redo').project,next);
});
test('invalid batches and unknown operations leave the entire project unchanged',()=>{
 const p=base(),before=structuredClone(p);
 for(const commands of [[{op:'add-cabinet',item:cabinet()},{op:'move',id:'missing',x:1,z:0}],[{op:'add-cabinet',item:cabinet()},{op:'add-cabinet',item:cabinet('b')}],[{op:'add-cabinet',item:cabinet('outside',50)}],[{op:'execute',code:'anything'}],[{op:'move',id:'a',x:0,z:0,shell:{}}]])assert.throws(()=>prepareDesignCommands(p,batch(p,commands)));
 assert.deepEqual(p,before);
});
test('final-state validation allows atomic swaps and validates removals',()=>{
 const p=applyPreparedDesignCommands(base(),prepareDesignCommands(base(),batch(base(),[{op:'add-cabinet',item:cabinet('a',-1)},{op:'add-cabinet',item:cabinet('b',1)}])));
 const moved=applyPreparedDesignCommands(p,prepareDesignCommands(p,batch(p,[{op:'move',id:'a',x:1,z:0},{op:'move',id:'b',x:-1,z:0}])));assert.equal(moved.room.furniture.find(i=>i.id==='a').x,1);
 const removed=applyPreparedDesignCommands(moved,prepareDesignCommands(moved,batch(moved,[{op:'remove',id:'a'}])));assert.equal(removed.room.furniture.length,1);
});
test('stale project state and modified prepared commands cannot be applied',()=>{
 const p=base(),prepared=prepareDesignCommands(p,batch(p,[{op:'add-cabinet',item:cabinet()}]));assert.throws(()=>applyPreparedDesignCommands({...p,name:'Edited later'},prepared),/changed after preview/);
 prepared.request.commands[0].item.x=1;assert.throws(()=>applyPreparedDesignCommands(p,prepared),/Commands changed/);
});
test('active-room targeting preserves other rooms and locked room shells',()=>{
 let p=addProjectRoom(base(),{id:'room-next',name:'Other'});p=validateProject(withActiveRoom(p,{...p.room,locked:true}));const before=structuredClone(p),prepared=prepareDesignCommands(p,batch(p,[{op:'add-cabinet',item:cabinet()}])),next=applyPreparedDesignCommands(p,prepared);
 assert.equal(next.room.locked,true);assert.deepEqual(next.room.outline,p.room.outline);const inactive=p.rooms.find(r=>r.id!==activeRoomId(p));assert.deepEqual(next.rooms.find(r=>r.id===inactive.id),inactive);assert.deepEqual(p,before);
 assert.throws(()=>prepareDesignCommands(p,batch(p,[{op:'remove',id:'a'}],{roomId:inactive.id})),/active room/);
});
test('bounded strict command format rejects excessive input, invalid units and no-ops',()=>{
 const p=base();for(const input of ['{',' '.repeat(32769),batch(p,[]),batch(p,Array.from({length:21},()=>({op:'remove',id:'a'}))),batch(p,[{op:'remove',id:'a'}],{units:'mm'}),batch(p,[{op:'remove',id:'a'}],{unexpected:true})])assert.throws(()=>prepareDesignCommands(p,input));
 assert.throws(()=>prepareDesignCommands(p,batch(p,[{op:'add-cabinet',item:cabinet()},{op:'remove',id:'command-a'}])),/no change/);
});
