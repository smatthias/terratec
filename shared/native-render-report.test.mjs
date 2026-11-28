import {test} from 'node:test';import assert from 'node:assert/strict';
import {nativeRenderEvidence} from './native-render-report.mjs';
import {nativeViewerCapabilities,nativeViewerBundle} from './native-viewer-adapter.mjs';
const direct='Imported scene: 28 triangles, 1 meshes\nVisible OBJ pixels: 321\nOpenGL wildfire replay smoke test rendered 1 frame(s)\n';
const offscreen='OFFSCREEN_JSON={"width":800,"height":600,"resize_failures":0,"fallback":false}\nOffscreen composed: 800x600 -> 800x600\n'+direct;
test('native render evidence requires measured OBJ pixels and a completed smoke frame',()=>{
 assert.equal(nativeRenderEvidence(direct).visibleObjPixels,321);for(const log of ['',direct.replace('321','0'),direct.replace('rendered 1','rendered 0'),direct.replace('frame(s)','frames'),direct+'TerraFlux viewer error: failed'])assert.throws(()=>nativeRenderEvidence(log));
});
test('offscreen evidence requires successful target creation and blit without fallback',()=>{
 assert.equal(nativeRenderEvidence(offscreen,{offscreen:true}).mode,'offscreen');for(const log of [direct,offscreen.replace('false','true'),offscreen.replace('"resize_failures":0','"resize_failures":1'),offscreen.replace('Offscreen composed:','No blit:')])assert.throws(()=>nativeRenderEvidence(log,{offscreen:true}));
});
test('pinned capability checks distinguish supported, unsupported, unknown and runtime-only requirements',async()=>{
 assert.equal(nativeViewerCapabilities(['sceneGeometry','normals']).status,'supported-by-profile');assert.equal(nativeViewerCapabilities(['physicalMaterialExecution','rigidBodySimulation']).status,'blocked');assert.deepEqual(nativeViewerCapabilities(['unknownSolver']).unsupported,['unknownSolver']);assert.equal(nativeViewerCapabilities(['nativeRendering']).status,'requires-runtime-check');
 await assert.rejects(()=>nativeViewerBundle('{}',{requiredFeatures:['physicalMaterialExecution']}),/lacks required capabilities/);await assert.rejects(()=>nativeViewerBundle('{}',{requiredFeatures:['nativeRendering']}),/runtime smoke check/);for(const value of [[],['normals','normals'],null,['../bad']])assert.throws(()=>nativeViewerCapabilities(value));
});

test('OSMesa evidence requires the measured software context and real OpenGL version',()=>{
 const log='OSMESA_CONTEXT_RENDERER=llvmpipe\nOSMESA_CONTEXT_VERSION=4.5 (Core Profile) Mesa\n'+direct;assert.equal(nativeRenderEvidence(log,{backend:'osmesa'}).renderer,'llvmpipe');assert.throws(()=>nativeRenderEvidence(direct,{backend:'osmesa'}),/real OpenGL/);assert.throws(()=>nativeRenderEvidence(log.replace('4.5','3.3'),{backend:'osmesa'}),/real OpenGL/);
});
