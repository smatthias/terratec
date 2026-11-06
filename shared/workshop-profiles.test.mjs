import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveWorkshopProfile,validateWorkshopProfiles,applyWorkshopProfile} from './workshop-profiles.mjs';
import {validateProject} from './project.mjs';
import {serializeProjectJson,parseProjectJson} from './project-json.mjs';
import {duplicateProject} from './duplicate-project.mjs';
import {createHistory,commitHistory,undoHistory} from './history.mjs';
const profile={id:'shop',name:'Workshop',stockLengthMm:2800,stockWidthMm:1400,stockTrimMm:10,stockKerfMm:4,stockAllowRotation:false};
test('workshop profile validation, name-based replacement and limits',()=>{
  assert.equal(saveWorkshopProfile([profile],{...profile,id:'new',name:' WORKSHOP ',stockKerfMm:5})[0].id,'shop');
  for(const p of [{...profile,name:''},{...profile,stockKerfMm:-1},{...profile,id:'bad id'}])assert.throws(()=>validateWorkshopProfiles([p]));
  assert.throws(()=>validateWorkshopProfiles([profile,profile]),/unique/);
  assert.throws(()=>validateWorkshopProfiles(Array(33).fill(profile)),/32/);
});
test('profile application preserves cabinet geometry, is mutation-free and supports one undo',()=>{
  const item={id:'cab',name:'A',type:'cabinet',width:.9,height:1.2,depth:.5,thickness:.018,shelves:1,x:0,z:0,rotation:0};
  const base=validateProject({schemaVersion:1,units:'m',name:'Project',room:{width:6,depth:4,height:3}});
  assert.deepEqual(base.workshopProfiles,[]);
  const project=validateProject({...base,workshopProfiles:[profile],room:{...base.room,furniture:[item]}}),before=JSON.stringify(project);
  const room=applyWorkshopProfile(project.room,'cab',profile);
  assert.equal(room.furniture[0].stockKerfMm,4);assert.equal(room.furniture[0].width,.9);assert.equal(room.furniture[0].material,'oak');
  assert.equal(JSON.stringify(project),before);
  assert.deepEqual(undoHistory(commitHistory(createHistory(project.room),room)).present,project.room);
  assert.throws(()=>applyWorkshopProfile(project.room,'missing',profile),/Select/);
  assert.deepEqual(parseProjectJson(serializeProjectJson(project)).workshopProfiles,[profile]);
  assert.deepEqual(duplicateProject(project).workshopProfiles,[profile]);
});
