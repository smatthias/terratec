import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {receiveTerraFluxModel} from './terraflux-receiver.mjs';import {exportTerraFluxModel} from './terraflux-model.mjs';import {addProjectRoom} from './project-rooms.mjs';
const fixture=await readFile(new URL('../fixtures/terraflux/model-v1.json',import.meta.url),'utf8'),expected=JSON.parse(await readFile(new URL('../fixtures/terraflux/expected-v1.json',import.meta.url),'utf8'));
test('frozen exchange v1 yields independently specified transformed bounds and triangle counts',async()=>{
 const scene=await receiveTerraFluxModel(fixture,{placement:expected.placement});assert.deepEqual(scene.summary,expected.summary);assert.deepEqual(scene.surfaces[0].positions.slice(0,3),expected.firstFloorVertex);assert.deepEqual(scene.bodies[0].bounds,expected.bodyBounds);assert.equal(scene.simulationConnected,false);
 for(const m of [...scene.surfaces,...scene.bodies]){assert.equal(m.positions.length,m.normals.length);assert.ok(m.positions.every(Number.isFinite));assert.ok(m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3));for(let i=0;i<m.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...m.normals.slice(i,i+3))-1)<1e-8);}
});
test('triangulation preserves aperture area and surface orientation',async()=>{
 const scene=await receiveTerraFluxModel(fixture),north=scene.surfaces.find(m=>m.wallId==='north');let area=0;
 for(let i=0;i<north.indices.length;i+=3){const p=north.indices.slice(i,i+3).map(j=>north.positions.slice(j*3,j*3+3)),u=p[1].map((v,k)=>v-p[0][k]),v=p[2].map((v,k)=>v-p[0][k]);area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}
 assert.ok(Math.abs(area-(6*2.8-2))<1e-8);assert.equal(scene.surfaces[0].normals[1],1);assert.equal(scene.surfaces[1].normals[1],-1);
 for(const m of scene.bodies)for(let i=0;i<m.positions.length;i+=3){const centre={x:1,y:.6,z:0};const dot=(m.positions[i]-centre.x)*m.normals[i]+(m.positions[i+1]-centre.y)*m.normals[i+1]+(m.positions[i+2]-centre.z)*m.normals[i+2];assert.ok(dot>0);}
});
test('overlaps require explicit opt-in and do not silently weld room surfaces',async()=>{
 const project=addProjectRoom(JSON.parse(fixture).source.project,{id:'room-second',name:'Second'}),text=await exportTerraFluxModel(project);await assert.rejects(()=>receiveTerraFluxModel(text),/explicit allowOverlaps/);const scene=await receiveTerraFluxModel(text,{allowOverlaps:true});assert.equal(scene.summary.rooms,2);assert.ok(scene.warnings.some(w=>w.includes('explicitly allowed')));assert.equal(new Set(scene.surfaces.map(m=>m.id)).size,scene.surfaces.length);
});
test('tampered files, unsupported options and invalid placement are rejected',async()=>{
 const value=JSON.parse(fixture);value.rooms[0].floor[0].x++;await assert.rejects(()=>receiveTerraFluxModel(JSON.stringify(value)),/integrity/);
 for(const options of [{unknown:true},{allowOverlaps:'yes'},{placement:{yaw:Infinity}},{placement:{x:1000001}},{placement:{y:NaN}},{placement:{latitude:0}}])await assert.rejects(()=>receiveTerraFluxModel(fixture,options));
 const a=await receiveTerraFluxModel(fixture),b=await receiveTerraFluxModel(fixture);assert.deepEqual(a,b);
});

test('CLI checks frozen v1 without creating files and rejects unsupported arguments',()=>{
 const script=fileURLToPath(new URL('../scripts/check-terraflux.mjs',import.meta.url)),file=fileURLToPath(new URL('../fixtures/terraflux/model-v1.json',import.meta.url));
 const result=JSON.parse(execFileSync(process.execPath,[script,file],{encoding:'utf8'}));assert.equal(result.status,'compatible');assert.equal(result.triangles,28);assert.equal(result.simulationConnected,false);
 const scene=JSON.parse(execFileSync(process.execPath,[script,file,'--scene'],{encoding:'utf8'}));assert.equal(scene.format,'terratec-terraflux-receiver-scene');assert.equal(scene.openings.length,1);
 assert.throws(()=>execFileSync(process.execPath,[script,file,'--unknown'],{stdio:'pipe'}),error=>error.status===1&&error.stderr.toString().includes('Usage:'));
});
