import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from './project.mjs';
import {addProjectRoom,setProjectRoomPlacement,withActiveRoom} from './project-rooms.mjs';
import {roomAdjacencies} from './room-adjacency.mjs';
import {connectRoomOpening,unlinkRoomOpening} from './opening-links.mjs';
import {createHistory,commitHistory} from './history.mjs';
import {travelRoomHistory} from './room-history.mjs';
function setup() {
 let p=validateProject({schemaVersion:1,units:'m',name:'Undo connection',room:{width:6,depth:4,height:2.8}});
 p=setProjectRoomPlacement(addProjectRoom(p,{id:'room-next',name:'Next'}),'room-next',{x:6,z:0,rotation:0});const history=createHistory(p.room);
 p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'source',type:'door',wall:'west',offset:1,width:.9,height:2.1,sill:0}]}));
 const h=commitHistory(history,p.room);p=connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-next',openingId:'source',id:'link',pairedOpeningId:'pair'});return {project:p,history:h};
}
test('an undo that would break a connection leaves both model and history cursor untouched',()=>{
 const {project,history}=setup(),before=structuredClone({project,history});assert.throws(()=>travelRoomHistory(project,history,'undo'),/missing/);assert.deepEqual({project,history},before);
 const next=travelRoomHistory(unlinkRoomOpening(project,'link'),history,'undo');assert.equal(next.project.room.openings.length,0);assert.equal(next.history.past.length,0);
});
test('compatible geometry undo/redo preserves connections and updates the cursor atomically',()=>{
 const state=setup(),p=validateProject(withActiveRoom(state.project,{...state.project.room,height:3})),h=commitHistory(state.history,p.room);
 const undone=travelRoomHistory(p,h,'undo');assert.equal(undone.project.room.height,2.8);assert.equal(undone.project.openingLinks.length,1);
 const redone=travelRoomHistory(undone.project,undone.history,'redo');assert.equal(redone.project.room.height,3);assert.deepEqual(redone.project,p);
});
