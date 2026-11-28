import {test} from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera,Vector3} from 'three';
import {constraintLayout} from './constraint-layout.js';
import {fitCamera} from './room-scene.js';
import {validateProject} from '../shared/project.mjs';
import {setAngleConstraint,setLengthConstraint,togglePointConstraint} from '../shared/room-constraints.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Markers',room:{width:6,depth:4,height:3}}).room;
test('markers track world anchors under zoom/pan and viewport aspect changes',()=>{
  const room=togglePointConstraint(base(),'north-west');
  for(const [width,height] of [[900,600],[400,900]]) {
    const camera=new OrthographicCamera();fitCamera(camera,room,width/height,'Plan');
    for(const zoom of [1,1.2]) {
      camera.zoom=zoom;camera.position.x+=.1;camera.updateMatrixWorld();camera.updateProjectionMatrix();
      const p=new Vector3(-3,0,-2).project(camera),m=constraintLayout(room,camera,width,height)[0];
      assert.ok(Math.abs(m.x-((p.x+1)*width/2+12))<1e-8);
      assert.ok(Math.abs(m.y-((1-p.y)*height/2+18))<1e-8);
      assert.equal(m.text,'C1 lock');assert.match(m.label,/locked/);
    }
  }
});
test('multiple wall rules stack instead of occupying the same marker position',()=>{
  const room=setAngleConstraint(setLengthConstraint(base(),'north',6),'north','south','parallel');
  const camera=new OrthographicCamera();fitCamera(camera,room,1.5,'Plan');
  const markers=constraintLayout(room,camera,900,600);
  assert.equal(markers.length,3);assert.equal(new Set(markers.map(m=>m.key)).size,3);
  const north=markers.filter(m=>m.key.endsWith(':north'));
  assert.equal(north.length,2);assert.equal(north[1].y-north[0].y,18);
  assert.equal(north[0].x,north[1].x);
});
test('empty, hidden, clipped and uninitialized views produce no markers',()=>{
  const room=togglePointConstraint(base(),'north-west'),camera=new OrthographicCamera();fitCamera(camera,room,1.5,'Plan');
  assert.deepEqual(constraintLayout(base(),camera,900,600),[]);
  assert.deepEqual(constraintLayout(room,null,900,600),[]);
  assert.deepEqual(constraintLayout(room,camera,0,600),[]);
  camera.position.x+=100;camera.updateMatrixWorld();
  assert.deepEqual(constraintLayout(room,camera,900,600),[]);
});
test('failure highlights track saved wall spans under pan and ignore retired identities',async()=>{const {constraintFailureLayout}=await import('./constraint-layout.js'),room=base(),camera=new OrthographicCamera();fitCamera(camera,room,1.5,'Plan');const failure={affectedWalls:['north','north','missing']},before=structuredClone(room),lines=constraintFailureLayout(room,failure,camera,900,600);assert.equal(lines.length,1);assert.equal(lines[0].wall,'north');const p=new Vector3(-3,0,-2).project(camera);assert.ok(Math.abs(lines[0].x1-(p.x+1)*450)<1e-8);camera.position.x+=1;camera.updateMatrixWorld();assert.notEqual(constraintFailureLayout(room,failure,camera,900,600)[0].x1,lines[0].x1);assert.deepEqual(constraintFailureLayout(room,null,camera,900,600),[]);assert.deepEqual(constraintFailureLayout(room,failure,null,900,600),[]);assert.deepEqual(room,before);});
