// Machining plan and checks for furniture designs. This is the machine-neutral
// structure that CNC output will be generated from. It does not emit G-code:
// tools, feeds, tabs, lead-ins and machine post-processing are future work.
//
// Operations are grouped per panel and ordered by layer (the layer list is the
// machining order), then by face and sheet position for a stable result.
// Coordinates are millimetres in the panel's sheet frame (u along length, v along
// width, from the minimum corner, face A up). Face B operations need the panel
// turned over, and are marked so.
import {validateDesign,partBox,partCentre,featureBox,isThrough,hollowBox,PIECE_FORMS} from './furniture-design.mjs';
import {rotationMatrix,boxCorners,boundsOf,toLocal,squareTo,boxPenetration,matrixAxes} from './design-transform.mjs';
import {MATERIALS} from './materials.mjs';

const FEATURE_OPERATION={drill:'drill',pocket:'pocket',groove:'groove'};
const EPSILON=1e-6;
const overlap=(a,b)=>['x','y','z'].every(axis=>Math.min(a.max[axis],b.max[axis])-Math.max(a.min[axis],b.min[axis])>EPSILON);
const intersection=(a,b)=>({min:Object.fromEntries(['x','y','z'].map(k=>[k,Math.max(a.min[k],b.min[k])])),max:Object.fromEntries(['x','y','z'].map(k=>[k,Math.min(a.max[k],b.max[k])]))});
const contains=(outer,inner)=>['x','y','z'].every(k=>inner.min[k]>=outer.min[k]-1e-3&&inner.max[k]<=outer.max[k]+1e-3);

// Parts may only interpenetrate where one of them is machined or hollow to
// receive the other (a back panel in grooves, a dowel in a hole, a rod in a
// tube). Touching is allowed.
//
// Each pair is checked in the first piece's own frame. When the two pieces are
// square to each other (same rotation or quarter turns), both are axis-aligned
// boxes there and the overlap must lie inside a receiving feature. Otherwise an
// exact oriented-box test applies, and a piece counts as received only when it
// lies entirely inside a receiving feature of the other.
function frameOf(part) {
  const m=rotationMatrix(part.rotation),centre=partCentre(part);
  return {part,m,centre,box:partBox(part),receivers:[...(part.features??[]).map(f=>featureBox(part,f)),hollowBox(part)].filter(Boolean)};
}
const inFrameOf=(host,guest,box)=>boundsOf(boxCorners(box,guest.part.rotation,guest.centre).map(p=>toLocal(host.m,host.centre,p)));
const insideBox=(box,p)=>['x','y','z'].every(k=>p[k]>=box.min[k]-1e-3&&p[k]<=box.max[k]+1e-3);
function collides(a,b) {
  if(squareTo(a.m,b.m)) {
    const other=inFrameOf(a,b,b.box);
    if(!overlap(a.box,other)) return false;
    const shared=intersection(a.box,other);
    return ![...a.receivers,...b.receivers.map(r=>inFrameOf(a,b,r))].some(r=>contains(r,shared));
  }
  const cornersA=boxCorners(a.box,a.part.rotation,a.centre),cornersB=boxCorners(b.box,b.part.rotation,b.centre);
  if(boxPenetration(cornersA,matrixAxes(a.m),cornersB,matrixAxes(b.m))<=1e-3) return false;
  const bInA=cornersB.map(p=>toLocal(a.m,a.centre,p)),aInB=cornersA.map(p=>toLocal(b.m,b.centre,p));
  return !(a.receivers.some(r=>bInA.every(p=>insideBox(r,p)))||b.receivers.some(r=>aInB.every(p=>insideBox(r,p))));
}
export function partCollisions(design) {
  const frames=design.parts.map(frameOf),collisions=[];
  for(let i=0;i<frames.length;i++) for(let j=i+1;j<frames.length;j++) {
    const a=frames[i].part,b=frames[j].part;
    if(collides(frames[i],frames[j])) collisions.push({a:a.id,b:b.id,message:`${a.name} and ${b.name} overlap without a groove, pocket, hole or tube to receive them`});
  }
  return collisions;
}

export function cncPlan(input) {
  const design=validateDesign(input),order=new Map(design.layers.map((l,i)=>[l.id,i])),layerById=new Map(design.layers.map(l=>[l.id,l]));
  const issues=[],parts=[];
  for(const part of design.parts) {
    const partLayer=layerById.get(part.layer);
    if(part.shape!=='panel') {
      if(partLayer.operation!=='none') issues.push({code:'NOT_SHEET',severity:'warning',partId:part.id,message:`${part.name} is a ${PIECE_FORMS[part.shape].label.toLowerCase()}; only panels are machined from sheets in this version`});
      continue;
    }
    const operations=[];
    for(const feature of part.features) {
      const layer=layerById.get(feature.layer),expected=FEATURE_OPERATION[feature.type];
      if(layer.operation==='none') issues.push({code:'NOT_MACHINED',severity:'warning',partId:part.id,featureId:feature.id,message:`${part.name}: ${feature.type} on layer “${layer.name}” has no CNC operation`});
      else if(layer.operation!==expected) issues.push({code:'LAYER_OPERATION_MISMATCH',severity:'error',partId:part.id,featureId:feature.id,message:`${part.name}: ${feature.type} feature is on ${layer.operation} layer “${layer.name}”`});
      if(layer.operation==='none') continue;
      const geometry=feature.type==='drill'?{u:feature.u,v:feature.v,diameter:feature.diameter}:{u:feature.u,v:feature.v,length:feature.length,width:feature.width};
      operations.push({layerId:layer.id,layer:layer.name,operation:layer.operation,type:feature.type,featureId:feature.id,face:feature.face,flip:feature.face==='B',...geometry,depth:feature.depth,through:isThrough(part,feature)});
    }
    if(partLayer.operation==='profile') operations.push({layerId:partLayer.id,layer:partLayer.name,operation:'profile',type:'outline',face:'A',flip:false,u:0,v:0,length:part.length,width:part.width,depth:part.thickness,through:true});
    else if(partLayer.operation!=='none') issues.push({code:'LAYER_OPERATION_MISMATCH',severity:'error',partId:part.id,message:`${part.name} outline is on ${partLayer.operation} layer “${partLayer.name}”; part outlines belong on a profile layer`});
    operations.sort((a,b)=>order.get(a.layerId)-order.get(b.layerId)||(a.face<b.face?-1:a.face>b.face?1:0)||a.v-b.v||a.u-b.u);
    if(operations.some(op=>op.flip)) issues.push({code:'FLIP_REQUIRED',severity:'info',partId:part.id,message:`${part.name} has face B operations; the panel must be turned over`});
    for(const op of operations) if(!layerById.get(op.layerId).visible) {issues.push({code:'HIDDEN_LAYER',severity:'info',partId:part.id,message:`${part.name} has operations on hidden layer “${op.layer}”`});break;}
    parts.push({partId:part.id,name:part.name,material:part.material,materialLabel:MATERIALS[part.material].label,
      sheet:{lengthMm:part.length,widthMm:part.width,thicknessMm:part.thickness},operations});
  }
  for(const collision of partCollisions(design)) issues.push({code:'PART_COLLISION',severity:'error',partId:collision.a,otherPartId:collision.b,message:collision.message});
  const layers=design.layers.map((layer,index)=>{
    const ops=parts.flatMap(p=>p.operations).filter(op=>op.layerId===layer.id);
    return {id:layer.id,name:layer.name,order:index+1,operation:layer.operation,visible:layer.visible,operations:ops.length,maxDepthMm:ops.length?Math.max(...ops.map(op=>op.depth)):0};
  });
  return {layers,parts,issues,ready:!issues.some(issue=>issue.severity==='error')};
}

export function cncPlanJson(design,generatedAt=new Date().toISOString()) {
  const plan=cncPlan(design);
  return JSON.stringify({format:'terratec-cnc-plan',version:1,units:'mm',generatedAt,
    note:'Machine-neutral machining plan. Not G-code: tools, feeds, tabs and post-processing are not included.',
    design:{id:design.id,name:design.name},...plan},null,2)+'\n';
}
