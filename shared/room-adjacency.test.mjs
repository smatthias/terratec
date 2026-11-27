import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomAdjacencies,ADJACENCY_TOLERANCE} from './room-adjacency.mjs';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,withActiveRoom} from './project-rooms.mjs';
import {rectangle} from './geometry.mjs';
import {parseProjectJson,serializeProjectJson} from './project-json.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Adjacent rooms',room:{width:6,depth:4,height:2.8}});
const pair=(x=6,z=0,rotation=0)=>setProjectRoomPlacement(addProjectRoom(base(),{id:'room-kitchen',name:'Kitchen'}),'room-kitchen',{x,z,rotation});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('touching rooms identify the opposite facing walls, common span and local offsets',()=>{
 const links=roomAdjacencies(pair().rooms);assert.equal(links.length,1);const [link]=links;
 assert.equal(link.a.wallId,'east');assert.equal(link.b.wallId,'west');assert.equal(link.a.roomId,'room-1');assert.equal(link.b.roomId,'room-kitchen');
 assert.deepEqual(link.start,{x:3,z:-2});assert.deepEqual(link.end,{x:3,z:2});close(link.length,4);close(link.height,2.8);
 assert.deepEqual([link.a.from,link.a.to,link.b.from,link.b.to],[0,4,0,4]);assert.equal(link.heightMismatch,false);
});
test('partial adjacency reports offsets relative to each wall A endpoint',()=>{
 let p=pair(6,1);p=validateProject(withActiveRoom(p,{...p.room,outline:rectangle(6,2)}));
 const [link]=roomAdjacencies(p.rooms);close(link.length,2);assert.deepEqual(link.start,{x:3,z:0});assert.deepEqual(link.end,{x:3,z:2});
 assert.deepEqual([link.a.from,link.a.to,link.b.from,link.b.to],[2,4,0,2]);
});
test('room rotation preserves adjacency and maps stable wall IDs rather than compass positions',()=>{
 const radians=Math.PI/4;let p=pair(6*Math.cos(radians),-6*Math.sin(radians),45);p=setProjectRoomPlacement(p,'room-1',{x:0,z:0,rotation:45});
 const links=roomAdjacencies(p.rooms);assert.equal(links.length,1);close(links[0].length,4);assert.equal(links[0].a.wallId,'east');assert.equal(links[0].b.wallId,'west');
 const turned=roomAdjacencies(pair(6,0,180).rooms);assert.equal(turned.length,1);assert.equal(turned[0].b.wallId,'east');
});
test('gaps, corner contact, intersecting interiors and identical rooms are not shared-wall candidates',()=>{
 for(const p of [pair(6.001),pair(6,4),pair(5.9),pair(0),pair(6,0,1)]) assert.deepEqual(roomAdjacencies(p.rooms),[]);
 assert.deepEqual(roomAdjacencies([]),[]);assert.deepEqual(roomAdjacencies([{id:'room-1',name:'Only',room:base().room}]),[]);
});
test('coincidence tolerance accepts numerical gaps but rejects separated lines and tiny spans',()=>{
 assert.equal(roomAdjacencies(pair(6+ADJACENCY_TOLERANCE*.5).rooms).length,1);
 assert.equal(roomAdjacencies(pair(6+ADJACENCY_TOLERANCE*2).rooms).length,0);
 assert.equal(roomAdjacencies(pair(6,4-ADJACENCY_TOLERANCE*.5).rooms).length,0);
});
test('custom stable wall IDs and unequal heights remain explicit',()=>{
 let p=pair();p=validateProject(withActiveRoom(p,{...p.room,height:3.5,walls:['wall-a','wall-b','wall-c','wall-d'].map(id=>({id}))}));
 const [link]=roomAdjacencies(p.rooms);assert.equal(link.b.wallId,'wall-d');assert.equal(link.b.wallName,'Wall wall-d');assert.equal(link.heightMismatch,true);close(link.height,2.8);
});
test('candidate IDs and spans are deterministic across room ordering, names and persistence',()=>{
 const p=pair(),before=structuredClone(p),links=roomAdjacencies(p.rooms);
 assert.deepEqual(roomAdjacencies([...p.rooms].reverse()),links);assert.deepEqual(roomAdjacencies(parseProjectJson(serializeProjectJson(p)).rooms),links);
 const renamed=structuredClone(p);renamed.rooms[1].name='Changed';assert.equal(roomAdjacencies(renamed.rooms)[0].id,links[0].id);
 assert.deepEqual(p,before);assert.equal(p.schemaVersion,11);assert.equal(p.rooms[0].room.openings.length,0);assert.equal(p.rooms[1].room.openings.length,0);
});
test('multiple adjoining rooms produce separate candidates and edits recompute stale spans',()=>{
 let p=addProjectRoom(pair(),{id:'room-third',name:'Third'});p=setProjectRoomPlacement(p,'room-third',{x:12,z:0,rotation:0});
 assert.equal(roomAdjacencies(p.rooms).length,2);
 const moved=setProjectRoomPlacement(p,'room-kitchen',{x:6,z:5,rotation:0});assert.equal(roomAdjacencies(moved.rooms).length,0);
});
