import * as THREE from 'three';
import {addFurnitureVisuals} from './furniture-scene.js';
export function createFurnitureGhost(candidate,valid,view,guides=[]){
  const group=new THREE.Group();group.name='furniture-insertion-preview';
  if(!candidate)return group;
  addFurnitureVisuals(group,{furniture:[candidate]});
  group.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.visible=view==='Plan'?mesh.userData.role==='symbol':mesh.userData.role!=='symbol';
    mesh.material.color.setHex(valid?0x6fe5b0:0xff5c60);mesh.material.transparent=true;mesh.material.opacity=.45;mesh.material.depthWrite=false;mesh.material.depthTest=false;mesh.renderOrder=1000;
    mesh.userData={preview:true};mesh.raycast=()=>{};
  });
  for(const guide of guides){
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(guide.from.x,.045,guide.from.z),new THREE.Vector3(guide.to.x,.045,guide.to.z)]);
    const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xffe189,transparent:true,opacity:.9,depthTest:false,depthWrite:false}));line.renderOrder=1001;line.userData={preview:true,guide:true};line.raycast=()=>{};group.add(line);
  }
  return group;
}
export function disposeFurnitureGhost(group){group?.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});group?.removeFromParent();}
