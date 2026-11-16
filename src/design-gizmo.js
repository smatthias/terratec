// Direct manipulation in the furniture designer: drag planes, snapping, rotation
// rings and drop placement. Kept free of component state so it can be tested.
import * as THREE from 'three';
import {partCentre,partWorldBox} from '../shared/furniture-design.mjs';

export const AXIS_COLORS=Object.freeze({x:0xe0564b,y:0x5bbf6a,z:0x4b8de0});
// The world axis each orthographic view looks along.
export const VIEW_NORMAL=Object.freeze({Front:'z',Top:'y',Side:'x'});
const UNIT={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};

export const snap=(value,step)=>step>0?Math.round(value/step)*step:value;

// Pieces move in the view plane of orthographic views. In 3D they slide on a
// horizontal plane, or, with `vertical`, up and down on a vertical plane facing
// the camera. Pass the grabbed point so it stays under the pointer.
export function movePlane(view,centre,cameraDirection,vertical=false) {
  let normal=UNIT[VIEW_NORMAL[view]]??UNIT.y;
  if(view==='3D'&&vertical) {
    normal=new THREE.Vector3(cameraDirection.x,0,cameraDirection.z);
    if(normal.lengthSq()<1e-9) normal=UNIT.z.clone();
    normal.normalize();
  }
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone(),new THREE.Vector3(centre.x,centre.y,centre.z));
}
// The drag offset allowed by the plane: floor drags never change height and
// vertical drags only change height.
export function dragOffset(view,start,point,vertical=false) {
  const d={x:point.x-start.x,y:point.y-start.y,z:point.z-start.z};
  if(view==='3D') return vertical?{x:0,y:d.y,z:0}:{x:d.x,y:0,z:d.z};
  return {...d,[VIEW_NORMAL[view]]:0};
}
// New corner after a drag: moved axes snap to the grid, the others stay exact.
export function movedCorner(part,offset,step) {
  const out={};
  for(const axis of ['x','y','z']) out[axis]=offset[axis]===0?part[axis]:snap(part[axis]+offset[axis],step);
  return out;
}

// Angle in degrees of a point around a world axis through `centre`, using the
// right-hand rule, so it matches rotation about that axis.
export function ringAngle(point,centre,axis) {
  const v={x:point.x-centre.x,y:point.y-centre.y,z:point.z-centre.z};
  const [a,b]={x:[v.y,v.z],y:[v.z,v.x],z:[v.x,v.y]}[axis];
  return Math.atan2(b,a)*180/Math.PI;
}
// Shortest signed difference between two angles, snapped to `step` degrees.
export function ringDelta(from,to,step) {
  const delta=((to-from+540)%360)-180;
  return step>0?snap(delta,step):delta;
}

// World size of one screen pixel at `point` (for picking tolerances and sizes).
export function pixelSize(camera,point,heightPx) {
  if(camera.isOrthographicCamera) return (camera.top-camera.bottom)/camera.zoom/heightPx;
  const distance=camera.position.distanceTo(new THREE.Vector3(point.x,point.y,point.z));
  return 2*distance*Math.tan(camera.fov*Math.PI/360)/heightPx;
}
export const ringRadius=part=>{const {size}=partWorldBox(part);return Math.hypot(size.x,size.y,size.z)/2*1.08+15;};
// Rotation rings around a piece's centre; orthographic views show only the ring
// turning within the view plane.
export function buildRotateGizmo(part,view) {
  const centre=partCentre(part),radius=ringRadius(part),group=new THREE.Group();
  group.position.set(centre.x,centre.y,centre.z);
  for(const axis of view==='3D'?['x','y','z']:[VIEW_NORMAL[view]]) {
    const points=Array.from({length:96},(_,i)=>{
      const t=i/96*Math.PI*2,[a,b]={x:['y','z'],y:['z','x'],z:['x','y']}[axis],p=new THREE.Vector3();
      p[a]=Math.cos(t)*radius;p[b]=Math.sin(t)*radius;return p;
    });
    const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:AXIS_COLORS[axis],depthTest:false,transparent:true}));
    ring.renderOrder=10;ring.userData={role:'ring',axis};group.add(ring);
  }
  return group;
}
export function pickRing(gizmo,camera,x,y,tolerance) {
  const ray=new THREE.Raycaster();ray.params.Line.threshold=tolerance;ray.setFromCamera(new THREE.Vector2(x,y),camera);
  gizmo.updateMatrixWorld(true);
  return ray.intersectObjects(gizmo.children,false)[0]?.object.userData.axis??null;
}

// Plane that dropped pieces land on: the floor in 3D and Top, the back (z = 0)
// in Front and the left side (x = 0) in Side.
export const dropPlane=view=>new THREE.Plane(UNIT[VIEW_NORMAL[view]]??UNIT.y,0);
// Corner for a dropped piece of world `size` centred on the drop point, resting
// on the drop plane.
export function dropCorner(view,point,size,step) {
  const normal=VIEW_NORMAL[view]??'y',out={};
  for(const axis of ['x','y','z']) out[axis]=axis===normal?0:snap(point[axis]-size[axis]/2,step);
  return out;
}
// Arrow keys nudge along the axes as they appear on screen in each view. In
// Side view (looking from +x) screen-right is world −z. Shift+Up/Down moves
// vertically in 3D and Top.
export function nudgeAxis(view,key,shift=false) {
  const vertical={ArrowUp:['y',1],ArrowDown:['y',-1]};
  const maps={
    '3D':{ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['z',-1],ArrowDown:['z',1]},
    Top:{ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['z',-1],ArrowDown:['z',1]},
    Front:{ArrowLeft:['x',-1],ArrowRight:['x',1],...vertical},
    Side:{ArrowLeft:['z',1],ArrowRight:['z',-1],...vertical},
  };
  const entry=(shift&&(view==='3D'||view==='Top')?vertical[key]:undefined)??maps[view]?.[key];
  return entry?{axis:entry[0],sign:entry[1]}:null;
}
