import * as THREE from 'three';
import {addFurnitureVisuals} from './furniture-scene.js';
export function createFurnitureGhost(candidate,valid,view){
  const group=new THREE.Group();group.name='furniture-insertion-preview';
  if(!candidate)return group;
  addFurnitureVisuals(group,{furniture:[candidate]});
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.visible=view==='Plan'?mesh.userData.role==='symbol':mesh.userData.role!=='symbol';
    mesh.material.color.setHex(valid?0x6fe5b0:0xff5c60);mesh.material.transparent=true;mesh.material.opacity=.45;mesh.material.depthWrite=false;mesh.material.depthTest=false;mesh.renderOrder=1000;
    mesh.userData={preview:true};mesh.raycast=()=>{};
  });return group;
}
export function disposeFurnitureGhost(group){group?.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});group?.removeFromParent();}
