import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectStore} from './project-store.mjs';
import {validateProject} from '../shared/project.mjs';
import {addProjectRoom,setProjectRoomPlacement,switchProjectRoom,withActiveRoom} from '../shared/project-rooms.mjs';
import {roomAdjacencies} from '../shared/room-adjacency.mjs';
import {connectRoomOpening} from '../shared/opening-links.mjs';
test('connections persist across restart and broken-link saves preserve the original bytes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'terratec-links-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let p=validateProject({schemaVersion:1,units:'m',name:'Links',room:{width:6,depth:4,height:2.8}});
 p=setProjectRoomPlacement(addProjectRoom(p,{id:'room-next',name:'Next'}),'room-next',{x:6,z:0,rotation:0});p=switchProjectRoom(p,'room-1');
 p=validateProject(withActiveRoom(p,{...p.room,openings:[{id:'door',type:'door',wall:'east',offset:1,width:.9,height:2.1,sill:0}]}));
 p=connectRoomOpening(p,{candidateId:roomAdjacencies(p.rooms)[0].id,sourceRoomId:'room-1',openingId:'door',id:'link',pairedOpeningId:'pair'});
 const record=await projectStore(dir).save(p),path=join(dir,'projects',record.id+'.json'),bytes=await readFile(path,'utf8');assert.deepEqual((await projectStore(dir).read(record.id)).project,p);
 const bad=structuredClone(p);bad.rooms[1].room.openings=[];await assert.rejects(projectStore(dir).save(bad,record.id),/missing/);assert.equal(await readFile(path,'utf8'),bytes);
});
