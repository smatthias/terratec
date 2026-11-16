// Three.js view of a furniture design (millimetres). Each piece is a group at
// its centre carrying its rotation; inside it the piece is shaded in its colour
// (or its layer colour) with edges in its layer colour, and machining features are
// translucent volumes in their layer colour, drawn through the panel so depth work
// stays visible. Hidden layers are not drawn or picked; with a focus layer,
// everything on other layers is dimmed.
import * as THREE from 'three';
import {partSize,partCentre,featureBox,designBounds,PANEL_ORIENTATIONS,SECTION_AXES} from '../shared/furniture-design.mjs';
import {isMetal} from '../shared/materials.mjs';

const SELECTED=0x766228;
const centreOf=box=>new THREE.Vector3((box.min.x+box.max.x)/2,(box.min.y+box.max.y)/2,(box.min.z+box.max.z)/2);
function orient(geometry,axis) {
  // Cylinder geometry runs along y; turn it onto the requested axis.
  if(axis==='x') geometry.rotateZ(Math.PI/2);
  if(axis==='z') geometry.rotateX(Math.PI/2);
  return geometry;
}

const UNIT={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
// Cross-sections, centred in their own plane (width along local x, height along
// y). Each is a set of convex quads for the end caps and closed loops for the
// side walls (outer loops anticlockwise, holes clockwise). Every section used
// here splits into rectangles or ring segments, so no general polygon
// triangulation (and no ExtrudeGeometry) is needed.
function section(part) {
  const w=part.width/2,h=part.height/2,t=part.wall;
  const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
  if(part.shape==='tube') {
    const r=part.diameter/2,n=32,at=(radius,i)=>[radius*Math.cos(i/n*2*Math.PI),radius*Math.sin(i/n*2*Math.PI)];
    const quads=Array.from({length:n},(_,i)=>[at(r-t,i),at(r,i),at(r,i+1),at(r-t,i+1)]);
    return {quads,loops:[Array.from({length:n},(_,i)=>at(r,i)),Array.from({length:n},(_,i)=>at(r-t,n-i))]};
  }
  if(part.shape==='angle') return {quads:[rect(-w,-h,w,-h+t),rect(-w,-h+t,-w+t,h)],loops:[[[-w,-h],[w,-h],[w,-h+t],[-w+t,-h+t],[-w+t,h],[-w,h]]]};
  if(part.shape==='box-tube') return {quads:[rect(-w,-h,w,-h+t),rect(-w,h-t,w,h),rect(-w,-h+t,-w+t,h-t),rect(w-t,-h+t,w,h-t)],loops:[rect(-w,-h,w,h),rect(-w+t,-h+t,w-t,h-t).reverse()]};
  return {quads:[rect(-w,-h,w,h)],loops:[rect(-w,-h,w,h)]};
}
// Extrudes a section along local z, centred on the origin.
function extrude({quads,loops},length) {
  const z=length/2,positions=[];
  const tri=(...points)=>{for(const p of points) positions.push(...p);};
  for(const [a,b,c,d] of quads) {
    tri([...a,z],[...b,z],[...c,z]);tri([...a,z],[...c,z],[...d,z]);
    tri([...a,-z],[...c,-z],[...b,-z]);tri([...a,-z],[...d,-z],[...c,-z]);
  }
  for(const loop of loops) loop.forEach((p,i)=>{
    const q=loop[(i+1)%loop.length];
    tri([...p,-z],[...q,-z],[...q,z]);tri([...p,-z],[...q,z],[...p,z]);
  });
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}
// Geometry centred on the origin in world orientation.
function pieceGeometry(part,size) {
  if(part.shape==='panel') return new THREE.BoxGeometry(size.x,size.y,size.z);
  if(part.shape==='cylinder') return orient(new THREE.CylinderGeometry(part.diameter/2,part.diameter/2,part.length,32),part.axis);
  const geometry=extrude(section(part),part.length),[a,b]=SECTION_AXES[part.axis];
  return geometry.applyMatrix4(new THREE.Matrix4().makeBasis(UNIT[a],UNIT[b],UNIT[part.axis]));
}

const RAD=Math.PI/180;
function dim(material) {material.transparent=true;material.opacity=.16;material.depthWrite=false;return material;}
export function buildDesignGroup(design,{selectedPartId=null,selectedFeatureId=null,colorByLayer=false,focusLayerId=null}={}) {
  const group=new THREE.Group(),layers=new Map(design.layers.map(l=>[l.id,l]));
  const dimmed=layerId=>focusLayerId!==null&&layerId!==focusLayerId;
  for(const part of design.parts) {
    const layer=layers.get(part.layer);
    const size=partSize(part),c=partCentre(part),centre=new THREE.Vector3(c.x,c.y,c.z);
    const holder=new THREE.Group();holder.position.copy(centre);holder.userData={role:'piece',partId:part.id};
    if(part.rotation) holder.rotation.set(part.rotation.x*RAD,part.rotation.y*RAD,part.rotation.z*RAD,'XYZ');
    group.add(holder);
    if(layer.visible) {
      const geometry=pieceGeometry(part,size),selected=part.id===selectedPartId,metal=isMetal(part.material);
      // Some section bases are mirrored, so both faces are drawn.
      const material=new THREE.MeshStandardMaterial({color:new THREE.Color(colorByLayer?layer.color:part.color).getHex(),roughness:metal?.35:.75,metalness:metal?.55:0,side:THREE.DoubleSide,emissive:selected?SELECTED:0x000000,emissiveIntensity:.6});
      const mesh=new THREE.Mesh(geometry,dimmed(part.layer)?dim(material):material);
      mesh.userData={role:'part',partId:part.id,layerId:part.layer};holder.add(mesh);
      const lines=new THREE.LineBasicMaterial({color:selected?0xffe08a:new THREE.Color(layer.color).getHex()});
      const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),dimmed(part.layer)?dim(lines):lines);
      edges.userData={role:'edges',partId:part.id,layerId:part.layer};holder.add(edges);
    }
    for(const feature of part.features??[]) {
      const featureLayer=layers.get(feature.layer);
      if(!featureLayer.visible) continue;
      const box=featureBox(part,feature),normal=PANEL_ORIENTATIONS[part.orientation].n,selected=feature.id===selectedFeatureId;
      const geometry=feature.type==='drill'
        ?orient(new THREE.CylinderGeometry(feature.diameter/2,feature.diameter/2,feature.depth,24),normal)
        :new THREE.BoxGeometry(box.max.x-box.min.x,box.max.y-box.min.y,box.max.z-box.min.z);
      const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:selected?0xffe08a:new THREE.Color(featureLayer.color).getHex(),transparent:true,opacity:selected?.9:dimmed(feature.layer)?.12:.65,depthTest:false,depthWrite:false}));
      mesh.position.copy(centreOf(box)).sub(centre);mesh.renderOrder=2;
      mesh.userData={role:'feature',partId:part.id,featureId:feature.id,layerId:feature.layer};holder.add(mesh);
    }
  }
  return group;
}
export function disposeDesignGroup(group) {
  group?.traverse(item=>{item.geometry?.dispose();item.material?.dispose();});
  group?.removeFromParent();
}

// Views: 3D looks from the front-right; Front looks along −z, Top down (front
// toward the bottom of the screen) and Side from the right (+x).
export const DESIGN_VIEWS=Object.freeze(['3D','Front','Top','Side']);
const VIEW_SETUP={Front:{dir:[0,0,1],up:[0,1,0],w:'x',h:'y'},Top:{dir:[0,1,0],up:[0,0,-1],w:'x',h:'z'},Side:{dir:[1,0,0],up:[0,1,0],w:'z',h:'y'}};
export function fitDesignCamera(camera,design,aspect,view) {
  const bounds=design.parts.length?designBounds(design):{min:{x:0,y:0,z:0},max:{x:1000,y:1000,z:1000}};
  const size={x:bounds.max.x-bounds.min.x,y:bounds.max.y-bounds.min.y,z:bounds.max.z-bounds.min.z},centre=centreOf(bounds);
  const extent=Math.max(size.x,size.y,size.z,100);
  if(view==='3D') {
    camera.aspect=aspect;camera.up.set(0,1,0);
    const distance=extent*1.9/Math.min(1,aspect);
    camera.position.set(centre.x+distance*.8,centre.y+distance*.6,centre.z+distance);
    camera.near=1;camera.far=distance*20;
  } else {
    const setup=VIEW_SETUP[view],margin=1.25;
    const half=Math.max(size[setup.h]/2,size[setup.w]/(2*aspect),60)*margin;
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.zoom=1;
    camera.up.set(...setup.up);
    camera.position.set(centre.x+setup.dir[0]*(extent*2+1000),centre.y+setup.dir[1]*(extent*2+1000),centre.z+setup.dir[2]*(extent*2+1000));
    camera.near=1;camera.far=extent*6+4000;
  }
  camera.lookAt(centre);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  return centre;
}
// Features are drawn on top of their panel, so they win when both are hit.
// With `withPoint`, the world point hit on the piece is included.
export function pickDesign(group,camera,x,y,withPoint=false) {
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);group.updateMatrixWorld(true);
  const targets=[];group.traverse(o=>{if(o.userData.role==='part'||o.userData.role==='feature') targets.push(o);});
  const hits=ray.intersectObjects(targets,false);
  const hit=hits.find(h=>h.object.userData.role==='feature')??hits[0];
  if(!hit) return null;
  const result={partId:hit.object.userData.partId,featureId:hit.object.userData.featureId??null};
  return withPoint?{...result,point:{x:hit.point.x,y:hit.point.y,z:hit.point.z}}:result;
}
