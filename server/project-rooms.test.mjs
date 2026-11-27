import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectStore} from './project-store.mjs';
import {makeServer} from './index.mjs';
import {validateProject} from '../shared/project.mjs';
import {addProjectRoom,switchProjectRoom,withActiveRoom} from '../shared/project-rooms.mjs';
const base=()=>addProjectRoom(validateProject({schemaVersion:1,units:'m',name:'Rooms',room:{width:6,depth:4,height:2.8}}),{id:'room-kitchen',name:'Kitchen'});
test('room collections survive storage restart and invalid inactive writes preserve saved bytes',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'terratec-rooms-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const project=base(),stored=await projectStore(dir).save(project),path=join(dir,'projects',stored.id+'.json'),bytes=await readFile(path,'utf8');
 const restarted=projectStore(dir);assert.deepEqual((await restarted.read(stored.id)).project,project);
 const bad=structuredClone(project);bad.rooms[0].room.height=-1;
 await assert.rejects(restarted.save(bad,stored.id));assert.equal(await readFile(path,'utf8'),bytes);
});
test('geometry API uses the active room and saving retains every room',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'terratec-rooms-api-')),server=makeServer({dataDir:dir});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+server.address().port;
 let project=base();project=validateProject(withActiveRoom(project,{...project.room,height:4}));
 const post=(path,p)=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)});
 const response=await post('/api/projects',project);assert.equal(response.status,201);const record=await response.json();
 assert.deepEqual((await(await fetch(url+'/api/projects/'+record.id)).json()).project,project);
 const kitchen=await post('/api/geometry',project);assert.equal(kitchen.status,200);assert.equal((await kitchen.json()).volume,96);
 const bedroom=await post('/api/geometry',switchProjectRoom(project,'room-1'));assert.equal(bedroom.status,200);assert.equal((await bedroom.json()).volume,67.2);
});
