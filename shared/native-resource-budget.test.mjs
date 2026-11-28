import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {nativeResourceCheck,traceNativeTriangle} from './native-resource-budget.mjs';import {nativeViewerBundle,nativeViewerZip} from './native-viewer-adapter.mjs';import {exportSimulationHandoff} from './simulation-handoff.mjs';
const legacy=JSON.parse(await readFile(new URL('../fixtures/terraflux/handoff-legacy-v1.json',import.meta.url),'utf8')),text=await exportSimulationHandoff(JSON.stringify(legacy.model),legacy.mapping);
test('native logical memory models expanded OBJ triangle corners and exact budget boundaries',()=>{
 const report=nativeResourceCheck(28,{maxTriangles:28,maxLogicalCpuMeshBytes:8400});assert.equal(report.status,'within-budget');assert.equal(report.usage.importedVertices,84);assert.equal(report.usage.vertexBytes,8064);assert.equal(report.usage.indexBytes,336);assert.equal(report.utilization.logicalCpuMeshPercent,100);
 assert.deepEqual(nativeResourceCheck(28,{maxLogicalCpuMeshBytes:8399}).exceeded,['logicalCpuMeshBytes']);assert.deepEqual(nativeResourceCheck(28,{maxTriangles:27}).exceeded,['triangles']);
 for(const value of [0,1.5,Infinity,2000001])assert.throws(()=>nativeResourceCheck(value));for(const value of [{maxTriangles:0},{maxLogicalCpuMeshBytes:NaN},{maxLogicalCpuMeshBytes:1.5},{gpuBytes:10}])assert.throws(()=>nativeResourceCheck(28,value));
});
test('over-budget bundles cannot be exported and exact-fit admission preserves geometry',async()=>{
 await assert.rejects(()=>nativeViewerZip(text,{resourceBudget:{maxTriangles:27}}),/budget exceeded/);await assert.rejects(()=>nativeViewerBundle(text,{resourceBudget:{maxLogicalCpuMeshBytes:8399}}),/budget exceeded/);const bundle=await nativeViewerBundle(text,{resourceBudget:{maxTriangles:28,maxLogicalCpuMeshBytes:8400}});assert.equal(bundle.manifest.resources.usage.logicalCpuMeshBytes,8400);assert.equal(bundle.manifest.summary.triangles,28);
});
test('every native triangle maps to a scoped source element and material across range boundaries',async()=>{
 const {manifest}=await nativeViewerBundle(text);for(const e of manifest.elements)for(const index of [e.firstTriangle,e.firstTriangle+e.triangleCount-1]){const trace=traceNativeTriangle(manifest,index);assert.equal(trace.elementId,e.elementId);assert.equal(trace.roomId,e.roomId);assert.equal(trace.materialRef,'fixture');assert.equal(trace.objFace,index+1);assert.equal(trace.localTriangle,index-e.firstTriangle);}
 assert.equal(traceNativeTriangle(manifest,0).kind,'floor');assert.equal(traceNativeTriangle(manifest,27).furnitureId,'cab');for(const value of [-1,28,1.1,NaN])assert.throws(()=>traceNativeTriangle(manifest,value),/zero-based/);
});
test('traceability rejects gaps, overlaps, duplicate IDs and inconsistent metadata',async()=>{
 const {manifest}=await nativeViewerBundle(text);for(const change of [m=>m.elements[1].firstTriangle++,m=>m.elements[1].firstTriangle--,m=>m.elements[1].elementId=m.elements[0].elementId,m=>m.summary.triangles++,m=>m.elements[0].roomId='room-other']){const m=structuredClone(manifest);change(m);assert.throws(()=>traceNativeTriangle(m,0));}
 const old=structuredClone(manifest);for(const e of old.elements){delete e.roomId;delete e.wallId;delete e.furnitureId;delete e.materialRef;}assert.equal(traceNativeTriangle(old,0).roomId,'room-1');
});
