import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectStore} from './project-store.mjs';
import {validateProject} from '../shared/project.mjs';
import {togglePointConstraint,setLengthConstraint,setAngleConstraint} from '../shared/room-constraints.mjs';
for(const angular of [false,true]) test(`saved ${angular?'angular':'point/length'} constraints survive store restart and reject invalid writes`,async t=>{
  const dir=await mkdtemp(join(tmpdir(),'terratec-constraints-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const project=validateProject({schemaVersion:1,units:'m',name:'Stored constraints',room:{width:6,depth:4,height:3}});
  project.room=setLengthConstraint(togglePointConstraint(project.room,'north-west'),'north',6);project.schemaVersion=8;
  if(angular) {project.room=setAngleConstraint(project.room,'north','east','perpendicular');project.schemaVersion=9;}
  const stored=await projectStore(dir).save(project),path=join(dir,'projects',stored.id+'.json'),bytes=await readFile(path,'utf8');
  const restarted=projectStore(dir);assert.deepEqual((await restarted.read(stored.id)).project,validateProject(project));
  const bad=structuredClone(project);bad.room.outline[1].x+=1;
  await assert.rejects(restarted.save(bad,stored.id),/violates/);
  assert.equal(await readFile(path,'utf8'),bytes);
});
