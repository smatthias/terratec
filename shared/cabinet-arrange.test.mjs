import {validateFurniture} from './furniture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangle} from './geometry.mjs';
import {arrangeCabinet,cabinetInterval} from './cabinet-arrange.mjs';
import {createHistory,commitHistory,undoHistory} from './history.mjs';
const item={id:'a',name:'A',type:'cabinet',width:1,depth:.5,height:1.2,thickness:.018,shelves:1,x:-2,z:0,rotation:30};
const room={height:3,outline:rectangle(10,8),furniture:[item,{...item,id:'b',name:'B',x:2,z:2,rotation:0,width:1.4}]};
test('alignment and gaps use rotated body bounds and preserve all other parameters',()=>{
 for(const edge of ['min','center','max']){
  const next=arrangeCabinet(room,'a','b',{mode:'align',axis:'x',edge});
  assert.ok(Math.abs(cabinetInterval(next.furniture[0],'x')[edge]-cabinetInterval(next.furniture[1],'x')[edge])<1e-10);
  assert.equal(next.furniture[0].rotation,30);assert.equal(next.furniture[0].z,0);assert.deepEqual(next.furniture[1],validateFurniture(room.furniture,room.outline,room.height)[1]);
 }
 const next=arrangeCabinet(room,'a','b',{mode:'gap',axis:'z',side:'before',gap:.123});
 assert.ok(Math.abs(cabinetInterval(next.furniture[1],'z').min-cabinetInterval(next.furniture[0],'z').max-.123)<1e-10);
 assert.deepEqual(undoHistory(commitHistory(createHistory(room),next)).present,room);
});
test('invalid overlaps, boundaries and commands fail without changing the source room',()=>{
 const before=JSON.stringify(room),sameRow={...room,furniture:room.furniture.map(c=>({...c,z:0}))};
 assert.throws(()=>arrangeCabinet(sameRow,'a','b',{mode:'align',axis:'x',edge:'center'}),/overlap/);
 assert.throws(()=>arrangeCabinet(room,'a','b',{mode:'gap',axis:'x',side:'after',gap:10}),/inside/);
 for(const options of [{mode:'gap',axis:'x',side:'after',gap:-1},{mode:'align',axis:'bad',edge:'center'},{mode:'align',axis:'x',edge:'bad'}])assert.throws(()=>arrangeCabinet(room,'a','b',options));
 assert.throws(()=>arrangeCabinet(room,'a','a',{mode:'align',axis:'x',edge:'min'}),/different/);assert.equal(JSON.stringify(room),before);
});
