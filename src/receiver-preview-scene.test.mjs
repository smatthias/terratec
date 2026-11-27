import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as THREE from 'three';
import {receiveTerraFluxModel} from '../shared/terraflux-receiver.mjs';
import {receiverPreviewFrame,createReceiverPreviewGroup,disposeReceiverPreviewGroup,fitReceiverPreviewCamera} from './receiver-preview-scene.js';
const fixture=await readFile(new URL('../fixtures/terraflux/model-v1.json',import.meta.url),'utf8');
test('preview meshes retain receiver topology and normals while optional ceilings and wireframe remain view settings',async()=>{
 const scene=await receiveTerraFluxModel(fixture),before=structuredClone(scene),group=createReceiverPreviewGroup(scene,{ceilings:true,wireframe:true});assert.equal(group.children.length,7);assert.equal(group.children.reduce((s,m)=>s+m.geometry.index.count/3,0),scene.summary.triangles);assert.ok(group.children.every(m=>m.material.wireframe));
 const floor=group.children.find(m=>m.userData.kind==='floor');assert.equal(floor.geometry.getAttribute('normal').getY(0),1);assert.ok(group.children.every(m=>m.geometry.boundingSphere.radius>0));assert.deepEqual(scene,before);disposeReceiverPreviewGroup(group);
 const cutaway=createReceiverPreviewGroup(scene);assert.equal(cutaway.children.length,6);assert.ok(!cutaway.children.some(m=>m.userData.kind==='ceiling'));disposeReceiverPreviewGroup(cutaway);
});
test('large receiver translations preserve local preview precision by recentering before float conversion',async()=>{
 const a=await receiveTerraFluxModel(fixture),b=await receiveTerraFluxModel(fixture,{placement:{x:1000000,y:1000000,z:-1000000}}),ga=createReceiverPreviewGroup(a),gb=createReceiverPreviewGroup(b);assert.equal(receiverPreviewFrame(b).centre.x,1000000);
 for(let i=0;i<ga.children.length;i++){const x=ga.children[i].geometry.getAttribute('position').array,y=gb.children[i].geometry.getAttribute('position').array;for(let j=0;j<x.length;j++)assert.ok(Math.abs(x[j]-y[j])<1e-5);}
 disposeReceiverPreviewGroup(ga);disposeReceiverPreviewGroup(gb);
});
test('camera fitting contains the receiver extents across narrow and wide viewports',()=>{
 for(const aspect of [.3,1,2.5])for(const span of [.1,6,2000]){const camera=new THREE.PerspectiveCamera(45);fitReceiverPreviewCamera(camera,span,aspect);camera.updateMatrixWorld(true);assert.ok(camera.position.length()>camera.near&&camera.position.length()<camera.far);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const p=new THREE.Vector3(x*span/2,y*span/2,z*span/2).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1);}}
});
test('closing or replacing a preview releases each geometry and material',async()=>{
 const group=createReceiverPreviewGroup(await receiveTerraFluxModel(fixture));let geometries=0,materials=0;const count=group.children.length;for(const m of group.children){m.geometry.addEventListener('dispose',()=>geometries++);m.material.addEventListener('dispose',()=>materials++);}disposeReceiverPreviewGroup(group);assert.equal(group.children.length,0);assert.equal(geometries,count);assert.equal(materials,count);
});
