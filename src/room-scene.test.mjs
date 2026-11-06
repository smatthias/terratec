import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoom, updateSurfaces, fitCamera, pickSurface } from './room-scene.js';

const room = { width: 6, depth: 4, height: 2.8 };
test('orthographic plan keeps all room corners in frame across aspect ratios and room sizes', () => {
  for (const dimensions of [room, { width: 1000, depth: .1, height: 1000 }]) {
    for (const aspect of [.35, 1, 2.5]) {
      const camera = new THREE.OrthographicCamera();
      fitCamera(camera, dimensions, aspect, 'Plan');
      for (const x of [-dimensions.width/2-.16, dimensions.width/2+.16])
        for (const z of [-dimensions.depth/2-.16, dimensions.depth/2+.16]) {
          const point = new THREE.Vector3(x,0,z).project(camera);
          assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
        }
      const low = new THREE.Vector3(1,0,0).project(camera);
      const high = new THREE.Vector3(1,dimensions.height,0).project(camera);
      assert.ok(Math.abs(low.x-high.x) < 1e-12, 'height must not change apparent scale');
    }
  }
});
test('plan ray picking identifies floor and all four walls; empty space clears selection', () => {
  const group = createRoom(room), camera = new THREE.OrthographicCamera();
  updateSurfaces(group,'Plan',null); fitCamera(camera,room,1.5,'Plan');
  for (const [id,x,z] of [['floor',0,0],['north',0,-2.08],['south',0,2.08],['west',-3.08,0],['east',3.08,0]]) {
    const point = new THREE.Vector3(x,0,z).project(camera);
    assert.equal(pickSurface(group,camera,point.x,point.y),id);
  }
  assert.equal(pickSurface(group,camera,.99,.99),null);
});
test('selection persists while cutaway hides walls and reappears in plan', () => {
  const group = createRoom(room), south = group.children.find(mesh => mesh.userData.id === 'south');
  updateSurfaces(group,'3D','south');
  assert.equal(south.visible,false);
  updateSurfaces(group,'Plan','south');
  assert.equal(south.visible,true);
  assert.notEqual(south.material.emissive.getHex(),0);
  updateSurfaces(group,'Plan',null);
  assert.equal(south.material.emissive.getHex(),0);
});
