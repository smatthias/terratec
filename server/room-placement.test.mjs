import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectStore} from './project-store.mjs';
import {validateProject} from '../shared/project.mjs';
import {addProjectRoom,setProjectRoomPlacement} from '../shared/project-rooms.mjs';
test('placed room collections persist across restart and invalid placements preserve saved bytes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'terratec-placement-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const base=validateProject({schemaVersion:1,units:'m',name:'Placement',room:{width:6,depth:4,height:2.8}});
 const p=setProjectRoomPlacement(addProjectRoom(base,{id:'room-kitchen',name:'Kitchen'}),'room-1',{x:10,z:2,rotation:90});
 const record=await projectStore(dir).save(p),path=join(dir,'projects',record.id+'.json'),bytes=await readFile(path,'utf8');
 assert.deepEqual((await projectStore(dir).read(record.id)).project,p);
 const bad=structuredClone(p);bad.rooms[0].placement.x=1001;await assert.rejects(projectStore(dir).save(bad,record.id));assert.equal(await readFile(path,'utf8'),bytes);
});
