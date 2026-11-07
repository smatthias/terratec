import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFurnitureGhost,disposeFurnitureGhost} from './furniture-ghost.js';
const item={id:'ghost',name:'Ghost',width:1,depth:.5,height:1.2,thickness:.018,shelves:1,x:0,z:0,rotation:0};
test('preview ghosts are view-aware, non-pickable and dispose their resources',()=>{
 for(const [view,valid] of [['Plan',false],['3D',true]]){
  const group=createFurnitureGhost(item,valid,view),meshes=group.children,scene=new THREE.Scene();scene.add(group);
  assert.equal(meshes.filter(m=>m.visible).length,view==='Plan'?1:meshes.length-1);
  assert.equal(meshes[0].material.depthWrite,false);assert.equal(meshes[0].material.color.getHex(),valid?0x6fe5b0:0xff5c60);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,4,0),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(group,true).length,0);
  let disposed=0;meshes[0].geometry.addEventListener('dispose',()=>disposed++);disposeFurnitureGhost(group);assert.equal(disposed,1);assert.equal(group.parent,null);
 }
});
