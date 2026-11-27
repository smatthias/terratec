import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {studioLights,softwareRenderer} from './studio-light.js';
// A stand-in for WebGLRenderer: its GPU name decides whether shadows are drawn.
const renderer=gpu=>({shadowMap:{},getContext:()=>({getExtension:()=>({UNMASKED_RENDERER_WEBGL:1}),getParameter:()=>gpu})});

test('a key light with shadows fitted to the scene, in millimetres or metres alike',()=>{
  for(const [scale,unit] of [[1,'m'],[1000,'mm']]) {
    const scene=new THREE.Scene(),r=renderer('NVIDIA GeForce RTX'),lights=studioLights(scene,r,{catcher:true});
    assert.equal(lights.shadows,true);assert.equal(r.shadowMap.enabled,true);
    lights.fit({min:{x:0,y:0,z:0},max:{x:2*scale,y:1*scale,z:.6*scale}},0);
    const key=scene.children.find(o=>o.isDirectionalLight&&o.castShadow),cam=key.shadow.camera;
    assert.ok(cam.right>=scale*1.3&&cam.right<scale*3,`${unit}: the shadow covers the scene`);
    assert.ok(key.position.y>1*scale&&key.position.distanceTo(key.target.position)>2*scale,`${unit}: the key light stands above`);
    assert.ok(Math.abs(key.shadow.normalBias/scale-.0045)<1e-5,`${unit}: bias in proportion`);
    const floor=scene.children.find(o=>o.userData.role==='shadow');
    assert.ok(floor.receiveShadow&&floor.material.isShadowMaterial&&floor.position.y<=0,`${unit}: a shadow catcher under the scene`);
    lights.setShadows(false);assert.equal(key.castShadow,false);assert.equal(floor.visible,false);
    lights.setShadows(true);assert.equal(key.castShadow,true);
  }
});

test('a software renderer gets the same lights without shadows',()=>{
  assert.equal(softwareRenderer(renderer('Google SwiftShader')),true);assert.equal(softwareRenderer(renderer('llvmpipe (LLVM 15)')),true);
  assert.equal(softwareRenderer(renderer('ANGLE (Intel, Mesa Intel(R) UHD Graphics)')),false);
  const scene=new THREE.Scene(),r=renderer('Google SwiftShader'),lights=studioLights(scene,r,{catcher:true});
  assert.equal(r.shadowMap.enabled,false);assert.equal(scene.children.some(o=>o.castShadow),false);assert.equal(scene.children.some(o=>o.userData.role==='shadow'),false);
  lights.setShadows(true);assert.equal(scene.children.some(o=>o.castShadow),false);
  assert.equal(scene.children.filter(o=>o.isLight).length,3,'ambient, key and fill');
});
