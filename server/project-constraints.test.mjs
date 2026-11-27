import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {projectStore} from './project-store.mjs';
import {validateProject} from '../shared/project.mjs';
import {togglePointConstraint,setLengthConstraint} from '../shared/room-constraints.mjs';
test('saved constraints survive store restart and invalid geometry leaves saved bytes intact',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'terratec-constraints-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const project=validateProject({schemaVersion:1,units:'m',name:'Stored constraints',room:{width:6,depth:4,height:3}});
  project.room=setLengthConstraint(togglePointConstraint(project.room,'north-west'),'north',6);project.schemaVersion=8;
  const stored=await projectStore(dir).save(project),path=join(dir,'projects',stored.id+'.json'),bytes=await readFile(path,'utf8');
  const restarted=projectStore(dir);assert.deepEqual((await restarted.read(stored.id)).project,validateProject(project));
  const bad=structuredClone(project);bad.room.outline[1].x+=1;
  await assert.rejects(restarted.save(bad,stored.id),/violates/);
  assert.equal(await readFile(path,'utf8'),bytes);
});
