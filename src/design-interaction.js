// Pointer state machine for the furniture designer canvas, independent of the
// Vue component so it can be driven in tests with a real camera and scene.
//
// Move tool: press on a piece and drag more than 4 px to move it on the view's
// drag plane (Shift in 3D moves vertically); a press without dragging selects.
// Rotate tool: press on a ring of the selected piece and drag around it.
// While dragging, onPreview receives the edited design; on release onCommit
// receives it once, so each drag is one undo step. cancel() discards a drag.
import * as THREE from 'three';
import * as D from '../shared/furniture-design-edit.mjs';
import {rotateAboutWorldAxis} from '../shared/design-transform.mjs';
import {pickDesign} from './design-scene.js';
import {movePlane,dragOffset,movedCorner,ringAngle,ringDelta,pickRing,pixelSize} from './design-gizmo.js';

const round1=v=>Math.round(v*10)/10;
export function createDesignInteraction(ctx) {
  // ctx: element, camera(), group(), gizmo(), view(), tool(), design(), selectedPart(),
  //      gridStep(), angleStep(), onPreview(design, info), onCommit(design, message), onSelect(hit)
  let press=null,drag=null;
  function ndc(event) {const rect=ctx.element.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*2-1,y:-(event.clientY-rect.top)/rect.height*2+1};}
  function planeHit(event,plane) {
    const p=ndc(event),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(p.x,p.y),ctx.camera());
    return ray.ray.intersectPlane(plane,new THREE.Vector3());
  }
  const layerLocked=(design,layerId)=>design.layers.find(l=>l.id===layerId)?.locked;
  function begin(event,state) {
    event.preventDefault?.();event.stopImmediatePropagation?.();
    drag={...state,pointerId:event.pointerId,start:{x:event.clientX,y:event.clientY}};
    ctx.element.setPointerCapture?.(event.pointerId);
  }
  function pointerDown(event) {
    const group=ctx.group(),camera=ctx.camera();
    if(event.button!==0||!group||!camera) return;
    const part=ctx.selectedPart(),gizmo=ctx.gizmo();
    if(ctx.tool()==='rotate'&&part&&gizmo) {
      const p=ndc(event),centre=D.partCentre(part);
      const axis=pickRing(gizmo,camera,p.x,p.y,pixelSize(camera,centre,ctx.element.getBoundingClientRect().height)*7);
      if(axis) {
        const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),new THREE.Vector3(centre.x,centre.y,centre.z));
        const hit=planeHit(event,plane);
        if(hit) {begin(event,{kind:'rotate',axis,part,centre,plane,startAngle:ringAngle(hit,centre,axis),moved:true});return;}
      }
    }
    const p=ndc(event),picked=pickDesign(group,camera,p.x,p.y,true),hit=picked&&{partId:picked.partId,featureId:picked.featureId};
    press={x:event.clientX,y:event.clientY,hit};
    if(ctx.tool()==='move'&&hit) {
      const design=ctx.design(),target=design.parts.find(q=>q.id===hit.partId);
      if(target&&!layerLocked(design,target.layer)) begin(event,{kind:'move',part:target,grab:picked.point,moved:false});
    }
  }
  function pointerMove(event) {
    if(!drag||event.pointerId!==drag.pointerId) return;
    const design=ctx.design(),view=ctx.view();
    let next,info;
    if(drag.kind==='move') {
      if(!drag.moved) {
        if(Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y)<=4) return;
        const vertical=view==='3D'&&!!event.shiftKey;
        // The plane passes through the grabbed point, so that point follows the pointer.
        drag.plane=movePlane(view,drag.grab,ctx.camera().getWorldDirection(new THREE.Vector3()),vertical);drag.vertical=vertical;
        // Measure from the press, not from where the threshold was crossed, so
        // the piece stays under the pointer.
        drag.origin=planeHit({clientX:drag.start.x,clientY:drag.start.y},drag.plane);if(!drag.origin) return;
        drag.moved=true;ctx.onSelect({partId:drag.part.id,featureId:null});
      }
      const point=planeHit(event,drag.plane);if(!point) return;
      const corner=movedCorner(drag.part,dragOffset(view,drag.origin,point,drag.vertical),ctx.gridStep());
      try {next=D.updatePart(design,drag.part.id,corner);} catch {return;}
      info=`Move ${['x','y','z'].filter(k=>corner[k]!==drag.part[k]).map(k=>k+' '+round1(corner[k]-drag.part[k])).join(' · ')||'0'} mm`;
    } else {
      const point=planeHit(event,drag.plane);if(!point) return;
      const delta=ringDelta(drag.startAngle,ringAngle(point,drag.centre,drag.axis),ctx.angleStep());
      try {next=D.updatePart(design,drag.part.id,{rotation:rotateAboutWorldAxis(drag.part.rotation,drag.axis,delta)});} catch {return;}
      info=`Rotate about ${drag.axis} ${delta>0?'+':''}${round1(delta)}°`;
    }
    drag.result=next;ctx.onPreview(next,info);
  }
  function release() {
    if(drag) ctx.element.releasePointerCapture?.(drag.pointerId);
    const finished=drag;drag=null;ctx.onPreview(null,'');return finished;
  }
  function pointerUp(event) {
    if(drag&&event.pointerId===drag.pointerId) {
      const finished=release();
      if(finished.moved&&finished.result) {press=null;ctx.onCommit(finished.result,finished.kind==='move'?'Piece moved':'Piece rotated');return;}
      if(finished.kind==='rotate') {press=null;return;}
    }
    const start=press;press=null;
    if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5) return;
    ctx.onSelect(start.hit);
  }
  function cancel() {if(!drag) return false;release();press=null;return true;}
  return {pointerDown,pointerMove,pointerUp,cancel,dragging:()=>!!drag};
}
