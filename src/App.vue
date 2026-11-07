<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createRoom, updateSurfaces, fitCamera, pickSurface, surfaces, createGrid, pickOpening } from './room-scene.js';

import {createFurnitureGhost,disposeFurnitureGhost} from './furniture-ghost.js';
import FurnitureClearance from './FurnitureClearance.vue';
import {furnitureClearance} from '../shared/furniture-clearance.mjs';
const clearanceOptions=ref({minWall:.05,doorDepth:.6,enforce:false});
function updateClearance(options){clearanceOptions.value=options;if(furnitureInsertion.value){const request=furnitureInsertion.value.request;furnitureInsertion.value={...evaluateInsertion(request),request};}}
import {evaluateFurniturePlacement,placementRotation} from '../shared/furniture-placement.mjs';
const furnitureInsertion=ref(null),pointerFurniture=ref(false),guideSnapping=ref(false);
function evaluateInsertion(request){return evaluateFurniturePlacement(project.value.room,request,gridSpacing.value,snapEnabled.value,guideSnapping.value,clearanceOptions.value);}
function setPreviewRotation(value){if(!furnitureInsertion.value)return;try{const request={...furnitureInsertion.value.request,rotation:placementRotation(value)};furnitureInsertion.value={...evaluateInsertion(request),request};}catch(error){message.value=error.message;}}
function rotatePreview(delta){setPreviewRotation((furnitureInsertion.value?.candidate?.rotation??furnitureInsertion.value?.request.rotation??0)+delta);}
function setGuideSnapping(value){guideSnapping.value=value;if(furnitureInsertion.value){const request=furnitureInsertion.value.request;furnitureInsertion.value={...evaluateInsertion(request),request};}}
let insertionPointerId=null;
function cancelFurnitureInsertion(){
  furnitureInsertion.value=null;pointerFurniture.value=false;
  if(insertionPointerId!==null){const id=insertionPointerId;insertionPointerId=null;clearPointer();if(controls)controls.enabled=true;if(renderer?.domElement.hasPointerCapture(id))renderer.domElement.releasePointerCapture(id);}
}
function startPointerFurniture(payload){cancelFurnitureInsertion();previewFurniture(payload);pointerFurniture.value=true;view.value='Plan';message.value='Move pointer in Plan · click to place · Escape cancels';}
function updatePointerFurniture(event){
  if(!pointerFurniture.value||!furnitureInsertion.value||view.value!=='Plan')return;
  const hit=planPoint(event);if(!hit)return;
  const request={...furnitureInsertion.value.request,point:{x:hit.x,z:hit.z}};
  furnitureInsertion.value={...evaluateInsertion(request),request};
}
function insideCanvas(event){const r=renderer.domElement.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;}
function canvasLeave(){clearPreview();if(pointerFurniture.value&&insertionPointerId===null){cancelFurnitureInsertion();message.value='Furniture pointer placement cancelled';}}
function cancelPointerFurnitureOnBlur(){if(pointerFurniture.value)cancelFurnitureInsertion();}
function previewFurniture({kind,point,presetId}){
  placementType.value=null;furniturePlacing.value=false;
  const preset=project.value.furniturePresets?.find(p=>p.id===presetId);
  const previous=furnitureInsertion.value?.request,same=previous?.kind===kind&&(kind==='preset'?previous.preset?.id===presetId:previous.sourceId===selectedFurniture.value?.id);
  const request={kind,point,preset,sourceId:selectedFurniture.value?.id,id:previous?.id??crypto.randomUUID(),...(same&&previous.rotation!==undefined?{rotation:previous.rotation}:{})};
  const result=evaluateInsertion(request);
  furnitureInsertion.value={...result,request};
}
function confirmFurnitureInsertion(){
  if(!furnitureInsertion.value)return;
  const result=evaluateInsertion(furnitureInsertion.value.request);
  if(!result.valid){furnitureInsertion.value={...furnitureInsertion.value,...result};message.value=result.error;return;}
  const id=result.candidate.id;applyRoom({...project.value.room,furniture:[...project.value.room.furniture,result.candidate]});cancelFurnitureInsertion();selected.value='furniture:'+id;message.value='Furniture preview committed';
}
import FurnitureLibrary from './FurnitureLibrary.vue';
import {duplicateCabinet,saveFurniturePreset,instantiateFurniturePreset,previewFurnitureInsertion} from '../shared/furniture-library.mjs';
function duplicateFurniture(point){try{const id=crypto.randomUUID();applyRoom(duplicateCabinet(project.value.room,selectedFurniture.value?.id,id,point,gridSpacing.value,snapEnabled.value));selected.value='furniture:'+id;message.value='Cabinet duplicated';}catch(error){message.value=error.message;}}
function saveFurniture(name){try{const furniturePresets=saveFurniturePreset(project.value.furniturePresets??[],{...selectedFurniture.value,id:crypto.randomUUID(),name});project.value=validateProject({...project.value,furniturePresets});message.value='Furniture preset saved · save project to keep it';}catch(error){message.value=error.message;}}
function addFurniturePreset({id,point}){try{const preset=project.value.furniturePresets?.find(p=>p.id===id);if(!preset)throw Error('Furniture preset not found');const newId=crypto.randomUUID();applyRoom(instantiateFurniturePreset(project.value.room,preset,newId,point,gridSpacing.value,snapEnabled.value));selected.value='furniture:'+newId;message.value='Cabinet added from preset';}catch(error){message.value=error.message;}}
function deleteFurniturePreset(id){project.value=validateProject({...project.value,furniturePresets:project.value.furniturePresets.filter(p=>p.id!==id)});message.value='Furniture preset removed · cabinet settings retained';}
import CabinetArrange from './CabinetArrange.vue';
import {arrangeCabinet,arrangeCabinetGroup} from '../shared/cabinet-arrange.mjs';
function arrangeGroup({ids,options}){try{applyRoom(arrangeCabinetGroup(project.value.room,ids,options));message.value=options.mode==='align-group'?'Cabinet group aligned':'Cabinet gaps distributed';}catch(error){message.value=error.message;}}
function arrangeSelected({referenceId,options}){try{applyRoom(arrangeCabinet(project.value.room,selectedFurniture.value?.id,referenceId,options));message.value=options.mode==='align'?'Cabinet aligned':'Cabinet gap applied';}catch(error){message.value=error.message;}}
import {moveFurniture} from '../shared/furniture.mjs';
import CabinetLayout from './CabinetLayout.vue';
import ManufacturingPanel from './ManufacturingPanel.vue';
import WorkshopJobs from './WorkshopJobs.vue';
function exportJobRecord(text){downloadText(text,'application/json','_job-record.json');message.value='Workshop job record exported';}
function exportQuotePrint(text){downloadText(text,'text/html;charset=utf-8','_quote.html');message.value='Printable quote exported';}
function exportQuote(text){downloadText(text,'application/json','_quote.json');message.value='Quote snapshot exported';}
function exportSavedJob(text){downloadText(text,'application/json','_job-revision.json');message.value='Saved job revision exported';}
import WorkshopProfiles from './WorkshopProfiles.vue';
import {saveWorkshopProfile,applyWorkshopProfile,exportWorkshopProfiles,importWorkshopProfiles,applyWorkshopProfileToCabinets,MAX_WORKSHOP_BYTES} from '../shared/workshop-profiles.mjs';
import {exportJobManifest,verifyJobManifest,MAX_MANIFEST_BYTES} from '../shared/job-manifest.mjs';
const manifestResult=ref('');
async function exportJob(){try{downloadText(await exportJobManifest(project.value),'application/json','_job.json');message.value='Workshop job manifest exported';}catch(error){message.value=error.message;}}
async function verifyJob(file){
  if(!file)return;
  try{
    if(file.size>MAX_MANIFEST_BYTES)throw Error('Job manifest exceeds 2 MiB');
    const snapshot=JSON.stringify(project.value);
    const result=await verifyJobManifest(await file.text(),JSON.parse(snapshot));
    manifestResult.value=result.matchesCurrent&&snapshot===JSON.stringify(project.value)?'Verified manifest · matches current project · '+result.validation.status:'Verified manifest · differs from current project';
  }catch(error){manifestResult.value=error.message;}
}
import {workshopHandoff} from '../shared/workshop-handoff.mjs';
function exportWorkshop(){downloadText(workshopHandoff(project.value),'text/html;charset=utf-8','_workshop.html');message.value='Workshop handoff exported';}
const showManufacturing=ref(false);
function exportManufacturing(csv){downloadText(csv,'text/csv;charset=utf-8','_manufacturing.csv');message.value='Project manufacturing CSV exported';}
import {nestCabinet,nestingCsv} from '../shared/nesting.mjs';
import {cabinetBom,cabinetBomCsv} from '../shared/cabinet-parts.mjs';
import { savePreset } from '../shared/presets.mjs';
import { parseProjectJson, serializeProjectJson } from '../shared/project-json.mjs';
import { RECOVERY_KEY, readDrafts, storeDraft, removeDraft } from '../shared/recovery.mjs';
import { duplicateProject } from '../shared/duplicate-project.mjs';
import { exportPlanSvg, planSheetLayout } from '../shared/plan-svg.mjs';
import { validateProject } from '../shared/project.mjs';
import { bounds, edgeIds, validateOutline, snapPoint, scaleOutline, moveCorner } from '../shared/geometry.mjs';
import { dimensionLayout, openingChainLayout } from './dimensions.js';
import { createPlacementPreview } from './placement-preview.js';
import { wallLength, openingAtPoint, previewOpening, openingPreset } from '../shared/openings.mjs';
import { createHistory, commitHistory, undoHistory, redoHistory } from '../shared/history.mjs';
const blankProject=()=>validateProject({schemaVersion:1,units:'m',name:'Untitled studio',room:{width:6,depth:4,height:2.8}});
const project=ref(blankProject());
const printScale=ref(0),paperSize=ref('auto'),paperOrientation=ref('landscape');
const sheetFeedback=computed(()=>{
  if(paperSize.value==='auto') return null;
  try{return planSheetLayout(project.value,{scale:printScale.value||null,paper:paperSize.value,orientation:paperOrientation.value});}
  catch(error){return {fits:false,error:error.message};}
});
const fingerprint=p=>JSON.stringify(validateProject(p));
const baseline=ref(fingerprint(project.value)),draftKey=ref('draft-'+crypto.randomUUID()),recoveryOrigin=ref(null);
const recoveryDrafts=ref([]),recoveryChoice=ref(''),recoveryNotice=ref(''),jsonInput=ref(null);
const dirty=computed(()=>{try{return fingerprint(project.value)!==baseline.value;}catch{return true;}});
function refreshDraftChoice() {
  if(!recoveryDrafts.value.some(d=>d.key===recoveryChoice.value)) recoveryChoice.value=recoveryDrafts.value[0]?.key||'';
}
let ignoredDraft=null;
function captureDraft() {
  if(dragging.value || !dirty.value) return;
  try {validateProject(project.value);}catch{return;}
  if(ignoredDraft?.key===draftKey.value && ignoredDraft.snapshot===fingerprint(project.value)) return;
  try {recoveryDrafts.value=storeDraft(localStorage,draftKey.value,project.value);refreshDraftChoice();}
  catch {recoveryNotice.value='Local recovery storage is unavailable. Save or export your project.';}
}
function clearCurrentDraft() {
  try {recoveryDrafts.value=removeDraft(localStorage,draftKey.value);if(recoveryOrigin.value) recoveryDrafts.value=removeDraft(localStorage,recoveryOrigin.value);recoveryOrigin.value=null;refreshDraftChoice();}
  catch {recoveryNotice.value='Could not clear local recovery data.';}
}
function resetWorkspaceState() {
  furniturePlacing.value=false;placementType.value=null;selected.value=null;selectedOpeningId.value=null;history.value=createHistory(project.value.room);resetView();
}
function recoverDraft() {
  const draft=recoveryDrafts.value.find(d=>d.key===recoveryChoice.value);if(!draft)return;
  captureDraft();project.value=validateProject(draft.project);activeProjectId.value=null;projectChoice.value='';
  recoveryOrigin.value=draft.key;draftKey.value='draft-'+crypto.randomUUID();baseline.value='';resetWorkspaceState();message.value='Draft recovered as an unsaved copy';
}
function discardDraft() {
  if(recoveryChoice.value===draftKey.value) {
    let snapshot=null;try{snapshot=fingerprint(project.value);}catch{}
    ignoredDraft={key:draftKey.value,snapshot};
  }
  try {recoveryDrafts.value=removeDraft(localStorage,recoveryChoice.value);refreshDraftChoice();message.value='Local draft discarded';}
  catch {recoveryNotice.value='Could not clear local recovery data.';}
}
function beforeUnload() {captureDraft();}

const activeProjectId=ref(null),projectChoice=ref(''),projectList=ref([]),listLoading=ref(true);
const dimensionDraft=ref({width:project.value.room.width,depth:project.value.room.depth,height:project.value.room.height});
watch(()=>project.value.room,room=>{dimensionDraft.value={width:room.width,depth:room.depth,height:room.height};},{deep:true});
const history=ref(createHistory(project.value.room)), dragging=ref(false), cornerHandles=ref([]);
let dragState;
watch(project,()=>{manifestResult.value='';},{deep:true});
watch([project,dragging],captureDraft,{deep:true,flush:'post'});
const editingLocked=computed(()=>busy.value || dragging.value);
function applyRoom(room,record=true) {
  const next=validateProject({...project.value,room}).room;
  if(record) history.value=commitHistory(history.value,next);
  project.value.room=next;
}
function travel(direction) {
  if(editingLocked.value) return;
  furniturePlacing.value=false;placementType.value=null;
  history.value=direction==='undo'?undoHistory(history.value):redoHistory(history.value);
  project.value.room=JSON.parse(JSON.stringify(history.value.present));
  message.value=direction==='undo'?'Geometry edit undone':'Geometry edit redone';
}
function setHeight(event) {
  try { applyRoom({...project.value.room,height:Number(event.target.value)}); }
  catch(error) { message.value=error.message; }
  dimensionDraft.value.height=project.value.room.height;
  event.target.value=project.value.room.height;
}
const viewport = ref(null), message = ref('Ready to design'), busy = ref(false), metrics = ref(null), view = ref('3D');
const selected = ref(null);
const selectedLabel = computed(() => surfaces.find(surface => surface.id === selected.value)?.label || project.value.room.furniture.find(item=>'furniture:'+item.id===selected.value)?.name || 'Nothing selected');
const hiddenSelection = computed(() => view.value === '3D' && ['south','east'].includes(selected.value));
const valid = computed(() => { try { validateProject(project.value); return true; } catch { return false; } });
const gridSpacing=ref(.25), snapEnabled=ref(true), endpointDraft=ref([]);
const selectedEdge=computed(()=>edgeIds.indexOf(selected.value));
const placementType=ref(null), placementPreview=ref(null), placementSize=ref(null);
const furniturePlacing=ref(false),furnitureDraft=ref(null);
const selectedFurniture=computed(()=>project.value.room.furniture.find(item=>'furniture:'+item.id===selected.value));
const selectedClearance=computed(()=>{try{return selectedFurniture.value?furnitureClearance(project.value.room,selectedFurniture.value,clearanceOptions.value):null;}catch(error){return {error:error.message};}});
const furnitureBom=computed(()=>selectedFurniture.value?cabinetBom(selectedFurniture.value):null);
const furnitureLayout=computed(()=>selectedFurniture.value?nestCabinet(selectedFurniture.value):null);
function exportNesting(){downloadText(nestingCsv(selectedFurniture.value),'text/csv;charset=utf-8','_cabinet-layout.csv');message.value='Cabinet layout CSV exported';}
function exportCabinetBom() {
  try {downloadText(cabinetBomCsv(selectedFurniture.value),'text/csv;charset=utf-8','_cabinet-panels.csv');message.value='Cabinet panel CSV exported';}
  catch(error){message.value=error.message;}
}
watch([selected,project],()=>{furnitureDraft.value=selectedFurniture.value?{...selectedFurniture.value}:null;},{deep:true});
function cabinetDefault(point) {
  const b=bounds(project.value.room.outline);
  return {id:crypto.randomUUID(),type:'cabinet',name:'Cabinet',width:Math.min(.9,b.width*.4),depth:Math.min(.5,b.depth*.4),height:Math.min(1.2,project.value.room.height),thickness:.018,shelves:1,x:point?.x??b.x,z:point?.z??b.z,rotation:0,material:'oak',lengthAllowanceMm:0,widthAllowanceMm:0,stockLengthMm:2440,stockWidthMm:1220,stockTrimMm:0,stockAllowRotation:true,stockKerfMm:3};
}
function addCabinet(point) {
  try {
    const item=cabinetDefault(point),position=snapPoint(item,gridSpacing.value,snapEnabled.value);
    item.x=position.x;item.z=position.z;
    applyRoom({...project.value.room,furniture:[...project.value.room.furniture,item]});
    selected.value='furniture:'+item.id;furniturePlacing.value=false;message.value='Cabinet added';
  } catch(error) {message.value=error.message;}
}
function placeCabinet() {cancelFurnitureInsertion();placementType.value=null;view.value='Plan';furniturePlacing.value=true;message.value='Click in the room to place a cabinet · Escape cancels';}
function applyCabinet() {
  try {
    const next={...furnitureDraft.value},position=snapPoint(next,gridSpacing.value,snapEnabled.value);next.x=position.x;next.z=position.z;
    applyRoom({...project.value.room,furniture:project.value.room.furniture.map(item=>item.id===next.id?next:item)});message.value='Cabinet updated';
  } catch(error) {message.value=error.message;}
}
function saveWorkshop(name) {
  try {
    const workshopProfiles=saveWorkshopProfile(project.value.workshopProfiles,{...selectedFurniture.value,id:crypto.randomUUID(),name});
    project.value=validateProject({...project.value,workshopProfiles});message.value='Workshop profile saved · save project to keep it';
  }catch(error){message.value=error.message;}
}
function useWorkshop(id) {
  try {
    const profile=project.value.workshopProfiles.find(p=>p.id===id);
    if(!profile)throw Error('Workshop profile not found');
    applyRoom(applyWorkshopProfile(project.value.room,selectedFurniture.value?.id,profile));message.value='Workshop profile applied';
  }catch(error){message.value=error.message;}
}
function exportWorkshops(){downloadText(exportWorkshopProfiles(project.value.workshopProfiles),'application/json','_workshops.json');message.value='Workshop profiles exported';}
async function importWorkshops(file) {
  if(!file)return;
  busy.value=true;
  try {
    if(file.size>MAX_WORKSHOP_BYTES)throw Error('Workshop profile file exceeds 32 KiB');
    const workshopProfiles=importWorkshopProfiles(project.value.workshopProfiles,await file.text());
    project.value=validateProject({...project.value,workshopProfiles});message.value='Workshop profiles imported · save project to keep them';
  }catch(error){message.value=error.message;}finally{busy.value=false;}
}
function useWorkshopBulk({profileId,cabinetIds}) {
  try {
    const profile=project.value.workshopProfiles.find(p=>p.id===profileId);
    if(!profile)throw Error('Workshop profile not found');
    applyRoom(applyWorkshopProfileToCabinets(project.value.room,cabinetIds,profile));message.value='Workshop profile applied to '+cabinetIds.length+' cabinets';
  }catch(error){message.value=error.message;}
}
function deleteWorkshop(id) {
  project.value=validateProject({...project.value,workshopProfiles:project.value.workshopProfiles.filter(p=>p.id!==id)});
  message.value='Workshop profile removed · cabinet settings retained';
}
function removeCabinet() {
  try {applyRoom({...project.value.room,furniture:project.value.room.furniture.filter(item=>item.id!==selectedFurniture.value.id)});selected.value=null;message.value='Cabinet removed';}
  catch(error) {message.value=error.message;}
}
watch(selected,()=>{furniturePlacing.value=false;});
watch(view,mode=>{if(mode!=='Plan')furniturePlacing.value=false;});

const sizePresets={};
const presetName=ref(''),presetId=ref(null),chainLabels=ref([]);
const savedPresets=computed(()=>project.value.presets.filter(p=>p.type===placementType.value));
let previewGroup,previewId;
const selectedOpeningId=ref(null), openingDraft=ref(null), wallLabels=ref([]);
const wallOpenings=computed(()=>project.value.room.openings.filter(o=>o.wall===selected.value));
watch([selected,selectedOpeningId,project],()=>{
  const current=wallOpenings.value.find(o=>o.id===selectedOpeningId.value);
  openingDraft.value=current?{...current}:null;
},{deep:true});
function addOpening(type) {
  try {
    const length=wallLength(project.value.room.outline,selected.value), height=project.value.room.height;
    const width=Math.min(type==='door'?.9:1.2,length-.2);
    const occupied=[...wallOpenings.value].sort((a,b)=>a.offset-b.offset);
    let offset=.1;
    for(const o of occupied) {
      if(offset+width<=o.offset-.05) break;
      offset=Math.max(offset,o.offset+o.width+.1);
    }
    const opening={id:crypto.randomUUID(),wall:selected.value,type,offset,width,
      height:type==='door'?Math.min(2.1,height-.05):Math.min(1.2,height*.4),sill:type==='door'?0:Math.max(.1,height*.3)};
    applyRoom({...project.value.room,openings:[...project.value.room.openings,opening]});
    selectedOpeningId.value=opening.id; message.value=type==='door'?'Door added':'Window added';
  } catch(error) { message.value=error.message; }
}
function beginPlacement(type) {
  cancelFurnitureInsertion();
  furniturePlacing.value=false;clearPreview(); previewId=crypto.randomUUID(); presetId.value=null;presetName.value='';
  const preset=openingPreset(project.value.room,selected.value,type,'size',0);
  placementSize.value={...(sizePresets[type]||{width:preset.width,height:preset.height,sill:preset.sill,hinge:'A',swing:'in'})};
  view.value='Plan'; placementType.value=type;
  message.value='Click near the selected wall · Escape cancels placement';
}
function saveOpeningPreset() {
  try {
    const presets=savePreset(project.value.presets,{id:crypto.randomUUID(),name:presetName.value,type:placementType.value,...placementSize.value});
    project.value=validateProject({...project.value,presets});
    presetId.value=presets.find(p=>p.type===placementType.value && p.name.toLowerCase()===presetName.value.trim().toLowerCase()).id;
    message.value='Preset saved · save project to keep it';
  } catch(error) {message.value=error.message;}
}
function useOpeningPreset() {
  const preset=savedPresets.value.find(p=>p.id===presetId.value);
  if(!preset) return;
  placementSize.value={width:preset.width,height:preset.height,sill:preset.sill,hinge:preset.hinge??'A',swing:preset.swing??'in'};
  presetName.value=preset.name;message.value='Preset applied';
}
function removeOpeningPreset() {
  try {
    project.value=validateProject({...project.value,presets:project.value.presets.filter(p=>p.id!==presetId.value)});
    presetId.value=null;message.value='Preset removed · save project to keep it';
  } catch(error) {message.value=error.message;}
}
function clearPreview() {
  if(previewGroup) {
    previewGroup.traverse(item=>{item.geometry?.dispose();item.material?.dispose();});
    scene?.remove(previewGroup);previewGroup=null;
  }
  placementPreview.value=null;
}
function updatePreview(event) {
  if(!placementType.value || view.value!=='Plan' || busy.value) return;
  const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  if(!point) {clearPreview();return;}
  const result=previewOpening(project.value.room,selected.value,placementType.value,previewId,point,gridSpacing.value,snapEnabled.value,
    Math.max(.15,(camera.top-camera.bottom)/camera.zoom/rect.height*18),placementSize.value);
  clearPreview();placementPreview.value=result;
  previewGroup=createPlacementPreview(project.value.room,result);scene.add(previewGroup);
}
watch(placementType,clearPreview);
watch(placementSize,size=>{
  if(size && placementType.value) sizePresets[placementType.value]={...size};
  clearPreview();
},{deep:true});
watch([gridSpacing,snapEnabled],clearPreview);
function placeOpening(point,tolerance) {
  try {
    const opening=openingAtPoint(project.value.room,selected.value,placementType.value,crypto.randomUUID(),point,gridSpacing.value,snapEnabled.value,tolerance,placementSize.value);
    applyRoom({...project.value.room,openings:[...project.value.room.openings,opening]});
    selectedOpeningId.value=opening.id; placementType.value=null;
    message.value='Opening placed';
  } catch(error) { message.value=error.message; }
}
watch(selected,()=>{placementType.value=null;});
watch(view,mode=>{if(mode!=='Plan') placementType.value=null;});
function saveOpening() {
  try {
    applyRoom({...project.value.room,openings:project.value.room.openings.map(o=>o.id===openingDraft.value.id?{...openingDraft.value}:o)});
    message.value='Opening updated';
  } catch(error) { message.value=error.message; }
}
function deleteOpening() {
  try {
    applyRoom({...project.value.room,openings:project.value.room.openings.filter(o=>o.id!==selectedOpeningId.value)});
    selectedOpeningId.value=null; message.value='Opening removed';
  } catch(error) { message.value=error.message; }
}

function syncEndpoints() {
  const i=selectedEdge.value, points=project.value.room.outline;
  endpointDraft.value=i<0?[]:[{...points[i]},{...points[(i+1)%4]}];
}
watch([selected,project],syncEndpoints,{deep:true,immediate:true});
function updateOutline(outline) {
  const next=validateOutline(outline), b=bounds(next);
  applyRoom({...project.value.room,outline:next,width:b.width,depth:b.depth});
}
function applyEndpoints() {
  try {
    const outline=project.value.room.outline.map(p=>({...p}));
    endpointDraft.value.forEach((p,n)=>{ outline[(selectedEdge.value+n)%4]=snapPoint(p,gridSpacing.value,snapEnabled.value); });
    updateOutline(outline); message.value='Wall endpoints updated';
  } catch(error) { message.value=error.message; }
}
function setDimension(key,event) {
  try {
    updateOutline(scaleOutline(project.value.room.outline,key==='width'?'x':'z',Number(event.target.value)));
  } catch(error) { message.value=error.message; }
  dimensionDraft.value[key]=project.value.room[key];
  event.target.value=project.value.room[key];
}
let scene, camera, renderer, controls, roomGroup, grid, observer, frame;
let furnitureGhost;
function syncFurnitureGhost(){disposeFurnitureGhost(furnitureGhost);furnitureGhost=null;if(scene&&furnitureInsertion.value){furnitureGhost=createFurnitureGhost(furnitureInsertion.value.candidate,furnitureInsertion.value.valid,view.value,furnitureInsertion.value.guides,furnitureInsertion.value.clearance);scene.add(furnitureGhost);}}
watch([furnitureInsertion,view],syncFurnitureGhost,{deep:true});
watch([project,selected,gridSpacing,snapEnabled],cancelFurnitureInsertion,{deep:true});
let pointerStart;
let revision = 0;
watch(project, () => { revision++; metrics.value = null; rebuild(); }, { deep: true });
watch(selected, () => { if (roomGroup) updateSurfaces(roomGroup, view.value, selected.value); });
async function request(path, method, body) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function refreshProjects() {
  listLoading.value=true;
  try {
    projectList.value=await request('/api/projects','GET');
    if(!projectChoice.value && projectList.value.length) projectChoice.value=projectList.value[0].id;
  } catch(error) {message.value=error.message;}
  finally {listLoading.value=false;}
}
function newProject() {
  captureDraft();
  furniturePlacing.value=false;placementType.value=null;project.value=blankProject();activeProjectId.value=null;projectChoice.value='';
  selected.value=null;selectedOpeningId.value=null;history.value=createHistory(project.value.room);
  baseline.value=fingerprint(project.value);draftKey.value='draft-'+crypto.randomUUID();recoveryOrigin.value=null;
  resetView();message.value='New project';
}
function duplicateWorkspace() {
  try {
    const copy=duplicateProject(project.value);captureDraft();project.value=copy;activeProjectId.value=null;projectChoice.value='';
    draftKey.value='draft-'+crypto.randomUUID();recoveryOrigin.value=null;baseline.value='';
    resetWorkspaceState();message.value='Project duplicated as an unsaved copy';
  } catch(error) {message.value=error.message;}
}
function downloadText(text,type,extension) {
  const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a');
  link.href=url;link.download=(project.value.name.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80)||'terratec')+extension;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportJson() {
  try {downloadText(serializeProjectJson(project.value),'application/json','.json');message.value='Project JSON exported';}
  catch(error) {message.value=error.message;}
}
async function importJson(event) {
  const file=event.target.files?.[0];if(!file)return;
  busy.value=true;
  try {
    if(file.size>65536) throw Error('Project JSON exceeds 64 KiB');
    const imported=parseProjectJson(await file.text());
    captureDraft();project.value=imported;activeProjectId.value=null;projectChoice.value='';draftKey.value='draft-'+crypto.randomUUID();
    baseline.value='';recoveryOrigin.value=null;resetWorkspaceState();message.value='Project JSON imported as an unsaved copy';
  } catch(error) {message.value='Import failed: '+error.message;}
  finally {event.target.value='';busy.value=false;}
}
function exportPlan() {
  try {
    const blob=new Blob([exportPlanSvg(project.value,{scale:printScale.value||null,paper:paperSize.value,orientation:paperOrientation.value})],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=(project.value.name.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80)||'terratec')+(paperSize.value!=='auto'?'_'+paperSize.value+'-'+paperOrientation.value:'')+(printScale.value?'_1-'+printScale.value:'')+'.svg';
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='SVG plan exported';
  } catch(error) {message.value=error.message;}
}
async function action(kind) {
  if(kind==='load') captureDraft();
  furniturePlacing.value=false;placementType.value=null;
  busy.value = true;
  const atRevision = revision;
  try {
    if(kind==='load') {
      if(projectChoice.value) {const record=await request('/api/projects/'+projectChoice.value,'GET');project.value=record.project;activeProjectId.value=record.id;}
      else {project.value=await request('/api/project','GET');activeProjectId.value=null;}
      baseline.value=fingerprint(project.value);recoveryOrigin.value=null;draftKey.value=activeProjectId.value||'draft-'+crypto.randomUUID();
      history.value=createHistory(project.value.room);selected.value=null;selectedOpeningId.value=null;resetView();message.value='Saved project opened';
    } else if(kind==='save') {
      const record=await request(activeProjectId.value?'/api/projects/'+activeProjectId.value:'/api/projects',activeProjectId.value?'PUT':'POST',project.value);
      baseline.value=fingerprint(record.project);clearCurrentDraft();draftKey.value=record.id;
      activeProjectId.value=record.id;projectChoice.value=record.id;await refreshProjects();message.value='Project saved';
    }
    else {
      const result = await request('/api/geometry', 'POST', project.value);
      if (atRevision === revision) { metrics.value = result; message.value = 'Geometry calculated'; }
    }
  } catch (error) { message.value = error.message; }
  finally { busy.value = false; }
}
function disposeRoom() {
  if (!roomGroup) return;
  roomGroup.traverse(item => { item.geometry?.dispose(); item.material?.dispose(); });
  scene.remove(roomGroup);
  if(grid) { grid.geometry.dispose(); grid.material.dispose(); scene.remove(grid); }
}
function rebuild() {
  if (!scene || !valid.value) return;
  disposeRoom();
  roomGroup = createRoom(project.value.room);
  updateSurfaces(roomGroup, view.value, selected.value);
  scene.add(roomGroup);
  grid=createGrid(project.value.room,gridSpacing.value); grid.visible=view.value==='Plan'; scene.add(grid);
}
function resetView() {
  if (!camera || !valid.value) return;
  // Consume residual damping before applying a deterministic fitted camera.
  controls.enableDamping = false; controls.update();
  const aspect = Math.max(viewport.value.clientWidth,1) / Math.max(viewport.value.clientHeight,1);
  fitCamera(camera, project.value.room, aspect, view.value);
  const b=bounds(project.value.room.outline);
  controls.target.set(b.x,0,b.z); controls.update();
  controls.enableDamping = true;
}
function setupCamera() {
  if (!renderer) return;
  cancelDrag();
  controls?.dispose();
  camera = view.value === 'Plan' ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera(45,1,.01,10000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = view.value !== 'Plan';
  controls.screenSpacePanning = true;
  controls.minZoom = .05; controls.maxZoom = 100;
  if (view.value === 'Plan') controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  resetView();
  if (roomGroup) updateSurfaces(roomGroup,view.value,selected.value);
  if(grid) grid.visible=view.value==='Plan';
}
function planPoint(event) {
  const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();camera.updateMatrixWorld();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
}
function pointerDown(event) {
  if(pointerFurniture.value&&view.value==='Plan'){
    if(!editingLocked.value&&event.button===0&&event.isPrimary){
      event.preventDefault();event.stopImmediatePropagation();
      controls.enableDamping=false;controls.update();controls.enableDamping=true;controls.enabled=false;
      pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false};insertionPointerId=event.pointerId;
      renderer.domElement.setPointerCapture(event.pointerId);updatePointerFurniture(event);
    }return;
  }
  if(view.value==='Plan' && !editingLocked.value && !placementType.value && !furniturePlacing.value && event.button===0 && event.isPrimary && roomGroup) {
    const rect=renderer.domElement.getBoundingClientRect();
    const id=pickSurface(roomGroup,camera,(event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    if(id?.startsWith('furniture:')) {
      event.preventDefault();event.stopImmediatePropagation();clearPointer();
      controls.enableDamping=false;controls.update();controls.enableDamping=true;controls.enabled=false;
      const hit=planPoint(event),item=project.value.room.furniture.find(item=>'furniture:'+item.id===id);
      dragState={kind:'furniture',itemId:item.id,id:event.pointerId,original:JSON.parse(JSON.stringify(project.value.room)),valid:true,target:renderer.domElement,start:hit,screen:{x:event.clientX,y:event.clientY},moved:false};
      dragging.value=true;selected.value=id;renderer.domElement.setPointerCapture(event.pointerId);message.value='Dragging cabinet · Escape cancels';return;
    }
  }
  if(editingLocked.value) { pointerStart=null; return; }
  pointerStart = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved:false } : null;
}
function pointerUp(event) {
  if(pointerFurniture.value){
    if(event.pointerId!==insertionPointerId)return;
    const start=pointerStart;clearPointer();insertionPointerId=null;controls.enabled=true;
    if(renderer.domElement.hasPointerCapture(event.pointerId))renderer.domElement.releasePointerCapture(event.pointerId);
    if(start&&!start.moved&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<=5&&insideCanvas(event)){updatePointerFurniture(event);confirmFurnitureInsertion();}
    return;
  }
  if(dragState?.kind==='furniture') {finishDrag(event);return;}
  const start = pointerStart; pointerStart = null;
  if (!start || event.pointerId !== start.id || !roomGroup || start.moved || Math.hypot(event.clientX-start.x,event.clientY-start.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x=(event.clientX-rect.left)/rect.width*2-1,y=-(event.clientY-rect.top)/rect.height*2+1;
  if(furniturePlacing.value && view.value==='Plan') {
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);
    const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
    if(point)addCabinet(point);return;
  }
  if(placementType.value && view.value==='Plan') {
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),camera);
    const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
    if(point) placeOpening(point,Math.max(.15,(camera.top-camera.bottom)/camera.zoom/rect.height*18));
    return;
  }
  const openingId=pickOpening(roomGroup,camera,x,y);
  selected.value=openingId?project.value.room.openings.find(o=>o.id===openingId).wall:pickSurface(roomGroup,camera,x,y);
  selectedOpeningId.value=openingId;
}
function pointerMove(event) {
  if(pointerFurniture.value){if(pointerStart&&event.pointerId===pointerStart.id&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5)pointerStart.moved=true;updatePointerFurniture(event);return;}
  if(dragState?.kind==='furniture') {dragCabinet(event);return;}
  if(pointerStart && Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>5) pointerStart.moved=true;
  if(pointerStart?.moved) clearPreview(); else updatePreview(event);
}
function clearPointer() { pointerStart = null; }
function cancelCanvasDrag() {if(insertionPointerId!==null){cancelFurnitureInsertion();return;}clearPointer();if(dragState?.kind==='furniture')cancelDrag();}
function dragCabinet(event) {
  if(!dragState || event.pointerId!==dragState.id)return;
  const state=dragState;
  if(!state.moved && Math.hypot(event.clientX-state.screen.x,event.clientY-state.screen.y)<=5)return;
  state.moved=true;
  const hit=planPoint(event),item=state.original.furniture.find(item=>item.id===state.itemId);if(!hit)return;
  try {
    applyRoom(moveFurniture(state.original,item.id,{x:item.x+hit.x-state.start.x,z:item.z+hit.z-state.start.z},gridSpacing.value,snapEnabled.value),false);
    state.valid=true;message.value='Dragging cabinet · Escape cancels';
  } catch(error){state.valid=false;message.value=error.message;}
}

function projectHandles() {
  if(!camera || !viewport.value || view.value!=='Plan') { if(cornerHandles.value.length) cornerHandles.value=[]; if(wallLabels.value.length) wallLabels.value=[]; if(chainLabels.value.length) chainLabels.value=[]; return; }
  const w=viewport.value.clientWidth,h=viewport.value.clientHeight;
  const next=project.value.room.outline.map((p,index)=>{
    const point=new THREE.Vector3(p.x,0,p.z).project(camera);
    return {index,x:(point.x+1)*w/2,y:(1-point.y)*h/2,visible:Math.abs(point.x)<1 && Math.abs(point.y)<1};
  });
  if(JSON.stringify(next)!==JSON.stringify(cornerHandles.value)) cornerHandles.value=next;
  const labels=dimensionLayout(project.value.room.outline,camera,w,h,id=>id===selected.value && wallOpenings.value.length?60:28);
  if(JSON.stringify(labels)!==JSON.stringify(wallLabels.value)) wallLabels.value=labels;
  const chains=openingChainLayout(project.value.room,selected.value,camera,w,h);
  if(JSON.stringify(chains)!==JSON.stringify(chainLabels.value)) chainLabels.value=chains;
}
function startDrag(index,event) {
  if(event.button!==0 || !event.isPrimary || editingLocked.value || !valid.value) return;
  event.preventDefault(); event.stopPropagation(); furniturePlacing.value=false;placementType.value=null; clearPointer();
  // Stop camera inertia before establishing the drag plane.
  controls.enableDamping=false; controls.update(); controls.enableDamping=true; controls.enabled=false;
  dragState={index,id:event.pointerId,original:JSON.parse(JSON.stringify(project.value.room)),valid:true,target:event.currentTarget};
  dragging.value=true; selected.value=edgeIds[index];
  event.currentTarget.setPointerCapture(event.pointerId);
  message.value='Dragging corner · Escape cancels';
}
function dragCorner(event) {
  if(!dragState || event.pointerId!==dragState.id) return;
  const rect=renderer.domElement.getBoundingClientRect();
  const ray=new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  if(!hit) return;
  try {
    const outline=moveCorner(dragState.original.outline,dragState.index,{x:hit.x,z:hit.z},gridSpacing.value,snapEnabled.value);
    applyRoom({...dragState.original,outline},false); dragState.valid=true;
    message.value='Dragging corner · Escape cancels';
  } catch(error) { dragState.valid=false; message.value=error.message; }
}
function finishDrag(event) {
  if(!dragState || event.pointerId!==dragState.id) return;
  const state=dragState;
  if(!state.valid) { cancelDrag(); message.value=state.kind==='furniture'?'Invalid cabinet move cancelled':'Invalid corner move cancelled'; return; }
  dragState=null; dragging.value=false; controls.enabled=true;
  if(state.target.hasPointerCapture(state.id)) state.target.releasePointerCapture(state.id);
  history.value=commitHistory(history.value,project.value.room);
  message.value=state.kind==='furniture'?(state.moved?'Cabinet moved':'Cabinet selected'):'Corner moved';
}
function cancelDrag() {
  if(!dragState) return;
  const state=dragState; dragState=null; dragging.value=false;
  applyRoom(state.original,false); controls.enabled=true;
  if(state.target.hasPointerCapture(state.id)) state.target.releasePointerCapture(state.id);
  message.value=state.kind==='furniture'?'Cabinet move cancelled':'Corner move cancelled';
}
function keyboard(event) {
  if(event.key==='Escape') { if(furnitureInsertion.value){cancelFurnitureInsertion();message.value='Furniture preview cancelled';return;} if(furniturePlacing.value) {furniturePlacing.value=false;message.value='Cabinet placement cancelled';return;} if(placementType.value) { placementType.value=null; message.value='Opening placement cancelled'; return; } cancelDrag(); selected.value=null; return; }
  const tag=event.target?.tagName;
  if(['INPUT','TEXTAREA','SELECT'].includes(tag) || event.target?.isContentEditable) return;
  if(furnitureInsertion.value&&event.key.toLowerCase()==='r'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();rotatePreview(event.shiftKey?-15:15);return;}
  if((event.ctrlKey || event.metaKey) && ['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    travel(event.key.toLowerCase()==='y' || event.shiftKey ? 'redo':'undo');
  }
}
watch(view,mode=>{if(pointerFurniture.value&&mode!=='Plan')cancelFurnitureInsertion();});
watch(view, setupCamera);
watch(gridSpacing,rebuild);
onMounted(() => {
  try {recoveryDrafts.value=readDrafts(localStorage.getItem(RECOVERY_KEY));refreshDraftChoice();}
  catch {recoveryNotice.value='Local recovery data could not be read.';}
  window.addEventListener('beforeunload',beforeUnload);
  refreshProjects();
  window.addEventListener('keydown',keyboard);
  window.addEventListener('blur',cancelDrag);window.addEventListener('blur',cancelPointerFurnitureOnBlur);
  try {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#152c2d');
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    viewport.value.appendChild(renderer.domElement);
    setupCamera();
    renderer.domElement.addEventListener('pointerdown',pointerDown,true);
    renderer.domElement.addEventListener('pointerup',pointerUp);
    renderer.domElement.addEventListener('pointermove',pointerMove);
    renderer.domElement.addEventListener('pointercancel',cancelCanvasDrag);
    renderer.domElement.addEventListener('lostpointercapture',cancelCanvasDrag);
    renderer.domElement.addEventListener('pointerleave',canvasLeave);
    scene.add(new THREE.HemisphereLight(0xffffff,0x365448,3));
    const sun = new THREE.DirectionalLight(0xffefcf,3); sun.position.set(8,12,6); scene.add(sun);
    observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = viewport.value;
      if (!w || !h) return;
      cancelDrag(); renderer.setSize(w,h); resetView();
    }); observer.observe(viewport.value);
    rebuild();
    const animate = () => { frame = requestAnimationFrame(animate); controls.update(); projectHandles(); renderer.render(scene,camera); }; animate();
  } catch { message.value = '3D view requires WebGL. Project save/load remains available.'; }
});
onBeforeUnmount(() => {
  captureDraft();window.removeEventListener('beforeunload',beforeUnload);
  clearPreview(); disposeFurnitureGhost(furnitureGhost); cancelDrag(); window.removeEventListener('keydown',keyboard); window.removeEventListener('blur',cancelDrag);window.removeEventListener('blur',cancelPointerFurnitureOnBlur);
  cancelAnimationFrame(frame); observer?.disconnect(); controls?.dispose(); disposeRoom();
  renderer?.domElement.removeEventListener('pointerdown',pointerDown,true);
  renderer?.domElement.removeEventListener('pointerup',pointerUp);
  renderer?.domElement.removeEventListener('pointermove',pointerMove);
  renderer?.domElement.removeEventListener('pointercancel',cancelCanvasDrag);
  renderer?.domElement.removeEventListener('lostpointercapture',cancelCanvasDrag);
  renderer?.domElement.removeEventListener('pointerleave',canvasLeave);
  renderer?.dispose();
});
</script>

<template>
  <div class="workspace">
    <header><a class="brand" href="/">terra<span>tec</span><small>DESIGN / BUILD / CONNECT</small></a><div class="actions"><select v-model="projectChoice" aria-label="Saved projects" :disabled="editingLocked || listLoading"><option value="">Choose project</option><option v-for="entry in projectList" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><button :disabled="editingLocked" @click="newProject">New</button><button :disabled="editingLocked || !valid" @click="duplicateWorkspace">Duplicate</button><button :disabled="editingLocked || !valid || (sheetFeedback && !sheetFeedback.fits)" @click="exportPlan">Export SVG</button><button :disabled="editingLocked || !valid" @click="exportJson">Export JSON</button><button :disabled="editingLocked" @click="jsonInput.click()">Import JSON</button><input ref="jsonInput" type="file" accept=".json,application/json" aria-label="Import project JSON" hidden @change="importJson"><button :disabled="editingLocked || listLoading" @click="action('load')">Open saved</button><button class="primary" :disabled="editingLocked || !valid" @click="action('save')">Save project</button></div></header>
    <aside><p class="eyebrow">{{ dirty ? 'UNSAVED CHANGES' : 'PROJECT WORKSPACE' }}</p><section v-if="recoveryDrafts.length" class="recovery-panel" aria-label="Local recovery"><label>Recovery draft<select v-model="recoveryChoice" aria-label="Recovery draft"><option v-for="draft in recoveryDrafts" :key="draft.key" :value="draft.key">{{ draft.project.name }} · {{ draft.updatedAt }}</option></select></label><button :disabled="editingLocked" @click="recoverDraft">Recover draft</button><button :disabled="editingLocked" @click="discardDraft">Discard draft</button></section><p v-if="recoveryNotice" class="hint" role="status">{{ recoveryNotice }}</p><h1>A space to<br>make your own.</h1><label>SVG print scale<select v-model.number="printScale" aria-label="SVG print scale"><option :value="0">Unscaled vector</option><option v-for="scale in [20,50,100,200]" :key="scale" :value="scale">1:{{ scale }}</option></select></label><p v-if="printScale" class="hint">SVG exports in physical millimetres. Print at 100% without fit-to-page.</p><label>SVG paper size<select v-model="paperSize" aria-label="SVG paper size"><option value="auto">Drawing bounds</option><option value="A4">A4</option><option value="A3">A3</option></select></label><label v-if="paperSize !== 'auto'">Sheet orientation<select v-model="paperOrientation" aria-label="Sheet orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><div v-if="sheetFeedback" class="sheet-feedback" :class="{invalid:!sheetFeedback.fits}" data-testid="sheet-fit" role="status"><template v-if="sheetFeedback.error">{{ sheetFeedback.error }}</template><template v-else>{{ sheetFeedback.fits ? 'Plan fits' : 'Plan does not fit' }} {{ paperSize }} {{ paperOrientation }} at 1:{{ printScale }}.<small>Drawing {{ sheetFeedback.requiredWidth.toFixed(1) }} × {{ sheetFeedback.requiredHeight.toFixed(1) }} mm; usable {{ sheetFeedback.availableWidth }} × {{ sheetFeedback.availableHeight }} mm.</small><button v-if="!sheetFeedback.fits && sheetFeedback.suggestedScale" @click="printScale=sheetFeedback.suggestedScale">Use suggested scale 1:{{ sheetFeedback.suggestedScale }}</button></template></div><label>Project name<input v-model="project.name" maxlength="120" :disabled="editingLocked"></label><div class="divider"></div><fieldset class="furniture-editor" :disabled="editingLocked"><legend>Furniture</legend><div class="opening-actions"><button @click="addCabinet()">Add cabinet</button><button :aria-pressed="furniturePlacing" @click="placeCabinet">Place cabinet</button></div><p v-if="furniturePlacing" class="placement-note">Click inside the room to place a cabinet.<button @click="furniturePlacing=false">Cancel cabinet placement</button></p><FurnitureClearance :report="selectedClearance" :settings="clearanceOptions" @change="updateClearance"/><FurnitureLibrary :item="selectedFurniture" :presets="project.furniturePresets??[]" :preview="furnitureInsertion" :guide-snapping="guideSnapping" @rotation="setPreviewRotation" @rotate="rotatePreview" @guide-snap="setGuideSnapping" @preview="previewFurniture" @pointer="startPointerFurniture" @confirm="confirmFurnitureInsertion" @cancel="cancelFurnitureInsertion" @duplicate="duplicateFurniture" @save="saveFurniture" @add="addFurniturePreset" @remove="deleteFurniturePreset"/><label v-if="project.room.furniture.length">Furniture item<select :value="selectedFurniture?.id || ''" aria-label="Furniture item" @change="selected=$event.target.value ? 'furniture:'+$event.target.value : null"><option value="">Choose furniture</option><option v-for="item in project.room.furniture" :key="item.id" :value="item.id">{{ item.name }}</option></select></label><template v-if="furnitureDraft"><label>Cabinet name<input v-model="furnitureDraft.name" maxlength="60"></label><label v-for="field in ['width','depth','height','x','z','rotation','thickness','shelves']" :key="field">Cabinet {{ field }}<input v-model.number="furnitureDraft[field]" type="number" :step="field === 'shelves' ? 1 : field === 'thickness' ? 0.001 : 0.01"></label><label>Cabinet material<select v-model="furnitureDraft.material" aria-label="Cabinet material"><option value="oak">Oak board</option><option value="birch">Birch plywood</option><option value="white">White board</option></select></label><label>Length allowance mm<input v-model.number="furnitureDraft.lengthAllowanceMm" type="number" min="0" max="50" step="0.1"></label><label>Width allowance mm<input v-model.number="furnitureDraft.widthAllowanceMm" type="number" min="0" max="50" step="0.1"></label><label>Stock length mm<input v-model.number="furnitureDraft.stockLengthMm" type="number" min="100" max="10000"></label><label>Stock width mm<input v-model.number="furnitureDraft.stockWidthMm" type="number" min="100" max="10000"></label><label>Stock edge trim mm<input v-model.number="furnitureDraft.stockTrimMm" type="number" min="0" max="100" step="0.1"></label><label>Stock kerf mm<input v-model.number="furnitureDraft.stockKerfMm" type="number" min="0" max="20" step="0.1"></label><label class="snap-toggle"><input v-model="furnitureDraft.stockAllowRotation" type="checkbox" aria-label="Allow panel rotation"> Allow panel rotation</label><button @click="applyCabinet">Apply cabinet</button><button @click="removeCabinet">Remove cabinet</button><CabinetArrange :item="selectedFurniture" :furniture="project.room.furniture" @arrange="arrangeSelected" @group="arrangeGroup"/><WorkshopProfiles :profiles="project.workshopProfiles" :furniture="project.room.furniture" @save="saveWorkshop" @apply="useWorkshop" @remove="deleteWorkshop" @export="exportWorkshops" @import="importWorkshops" @bulk="useWorkshopBulk"/><section v-if="furnitureBom" class="cabinet-bom" aria-label="Cabinet panel bill of materials"><p class="eyebrow">DESIGN PANEL LIST · MM</p><div v-for="row in furnitureBom.rows" :key="row.part" class="bom-row"><strong>{{ row.label }} × {{ row.quantity }}</strong><span>{{ (row.length*1000).toFixed(1) }} × {{ (row.width*1000).toFixed(1) }} × {{ (row.thickness*1000).toFixed(1) }}</span><small>{{ row.material }} · blank {{ (row.blankLength*1000).toFixed(1) }} × {{ (row.blankWidth*1000).toFixed(1) }} mm · {{ row.stockFit }}</small></div><p data-testid="stock-fit" role="status">{{ furnitureBom.allFit ? 'Each panel fits the usable stock sheet' : furnitureBom.oversizeCount+' panels exceed the usable stock sheet' }}</p><p>{{ furnitureBom.panelCount }} panels · {{ furnitureBom.handles }} handles<br>{{ furnitureBom.area.toFixed(3) }} m² · {{ furnitureBom.volume.toFixed(4) }} m³</p><button @click="exportCabinetBom">Export panel CSV</button><CabinetLayout v-if="furnitureLayout" :layout="furnitureLayout"/><button @click="exportNesting">Export layout CSV</button><p class="hint">Blank dimensions add the entered total allowance once per axis. Blank area {{ furnitureBom.blankArea.toFixed(3) }} m². Fit checks include edge trim on all four sides and optional 90° rotation. Layout uses a guillotine heuristic and is not guaranteed optimal. Kerf, edging, grain, joinery and machine instructions still need workshop review.</p></section></template><p class="hint">Dimensions and position are metres; rotation is degrees. Drag a cabinet body in Plan to move it. Body footprints must fit inside the room and cannot overlap.</p></fieldset><button :aria-expanded="showManufacturing" @click="showManufacturing=!showManufacturing">Project manufacturing</button><ManufacturingPanel v-if="showManufacturing" :furniture="project.room.furniture" @export="exportManufacturing" @handoff="exportWorkshop" @job="exportJob" @verify="verifyJob" :manifest-result="manifestResult"/><WorkshopJobs v-if="showManufacturing" :project="project" @export="exportSavedJob" @record="exportJobRecord" @quote="exportQuote" @quote-print="exportQuotePrint"/><p class="eyebrow">ROOM DIMENSIONS · METRES</p><label v-for="key in ['width','depth']" :key="key">{{ key }}<input v-model.number="dimensionDraft[key]" @change="setDimension(key,$event)" type="number" min="0.1" max="1000" step="0.1" :disabled="editingLocked"></label><label>Height<input v-model.number="dimensionDraft.height" @change="setHeight" type="number" min="0.1" max="1000" step="0.1" :disabled="editingLocked"></label><div class="divider"></div><label class="snap-toggle"><input v-model="snapEnabled" type="checkbox" :disabled="editingLocked"> Snap endpoints to grid</label><label>Grid spacing<select v-model.number="gridSpacing" :disabled="editingLocked"><option :value=".1">0.10 m</option><option :value=".25">0.25 m</option><option :value=".5">0.50 m</option><option :value="1">1.00 m</option></select></label><p class="hint">Large rooms show a coarser grid; snapping uses the selected spacing.</p><fieldset v-if="selectedEdge >= 0" class="endpoint-editor" :disabled="editingLocked"><legend>{{ selectedLabel }} endpoints</legend><div v-for="(point,n) in endpointDraft" :key="n" class="endpoint-row"><label v-for="axis in ['x','z']" :key="axis">{{ n === 0 ? 'A' : 'B' }} {{ axis.toUpperCase() }}<input v-model.number="point[axis]" type="number" min="-1000" max="1000" :step="gridSpacing"></label></div><button @click="applyEndpoints">Apply endpoints</button><p class="hint">Adjoining walls share each corner. Convex four-corner rooms only.</p></fieldset><fieldset v-if="selectedEdge >= 0" class="opening-editor" :disabled="editingLocked"><legend>Wall openings</legend><div class="opening-actions"><button @click="addOpening('door')">Add door</button><button @click="addOpening('window')">Add window</button></div><div class="opening-actions"><button :aria-pressed="placementType === 'door'" @click="beginPlacement('door')">Place door</button><button :aria-pressed="placementType === 'window'" @click="beginPlacement('window')">Place window</button></div><div v-if="placementType && placementSize" class="placement-size"><p class="eyebrow">PLACEMENT SIZE · METRES</p><label v-for="field in ['width','height','sill']" :key="field">Placement {{ field }}<input v-model.number="placementSize[field]" type="number" min="0" step="0.01" :disabled="field === 'sill' && placementType === 'door'"></label><template v-if="placementType === 'door'"><label>Placement hinge<select v-model="placementSize.hinge" aria-label="Placement hinge"><option value="A">A end</option><option value="B">B end</option></select></label><label>Placement swing<select v-model="placementSize.swing" aria-label="Placement swing"><option value="in">Inward</option><option value="out">Outward</option></select></label></template><label>Preset name<input v-model="presetName" maxlength="60"></label><button @click="saveOpeningPreset">Save opening preset</button><label v-if="savedPresets.length">Saved opening preset<select v-model="presetId" aria-label="Saved opening preset"><option :value="null">Choose preset</option><option v-for="preset in savedPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label><div v-if="savedPresets.length" class="opening-actions"><button :disabled="!presetId" @click="useOpeningPreset">Use preset</button><button :disabled="!presetId" @click="removeOpeningPreset">Delete preset</button></div></div><p v-if="placementType" class="placement-note">Click the selected wall to place a {{ placementType }}.<button @click="placementType=null">Cancel placement</button></p><label v-if="wallOpenings.length">Opening<select v-model="selectedOpeningId" aria-label="Opening"><option :value="null">Choose opening</option><option v-for="(opening,index) in wallOpenings" :key="opening.id" :value="opening.id">{{ opening.type }} {{ index+1 }}</option></select></label><template v-if="openingDraft"><label v-for="field in ['offset','width','height','sill']" :key="field">Opening {{ field }}<input v-model.number="openingDraft[field]" type="number" min="0" step="0.05" :disabled="field === 'sill' && openingDraft.type === 'door'"></label><template v-if="openingDraft.type === 'door'"><label>Door hinge<select v-model="openingDraft.hinge" aria-label="Door hinge"><option value="A">A end</option><option value="B">B end</option></select></label><label>Door swing<select v-model="openingDraft.swing" aria-label="Door swing"><option value="in">Inward</option><option value="out">Outward</option></select></label></template><button @click="saveOpening">Apply opening</button><button @click="deleteOpening">Remove opening</button></template><p class="hint">Place mode uses the entered size and snaps only the offset from A. Door hinge and swing settings apply in both views. Offset follows A → B. Keep 0.05 m at wall ends, above openings and between openings. Plan cuts walls at up to 1.2 m.</p></fieldset><p v-if="!valid" class="hint">Enter a name and dimensions from 0.1 to 1000 m.</p><button class="calculate" :disabled="editingLocked || !valid" @click="action('calculate')">Calculate geometry ↗</button><dl v-if="metrics"><div><dt>Floor area</dt><dd>{{ metrics.area.toFixed(2) }} m²</dd></div><div><dt>Volume</dt><dd>{{ metrics.volume.toFixed(2) }} m³</dd></div><div><dt>Perimeter</dt><dd>{{ metrics.perimeter.toFixed(2) }} m</dd></div></dl><p class="hint">Width and depth scale the outline. Select a wall to edit its endpoints. Two walls are hidden in 3D.</p></aside>
    <main :class="{placing:placementType || furniturePlacing || pointerFurniture}"><nav aria-label="View"><button v-for="mode in ['3D','Plan']" :aria-pressed="view === mode" :class="{ selected: view === mode }" @click="view = mode">{{ mode }}</button><button :disabled="dragging" @click="resetView">Fit room</button><button :disabled="editingLocked || !history.past.length" @click="travel('undo')">Undo</button><button :disabled="editingLocked || !history.future.length" @click="travel('redo')">Redo</button></nav><div ref="viewport" class="viewport" aria-label="Interactive room preview"></div><div v-if="furnitureInsertion" data-testid="furniture-insertion-preview" class="preview-status" :class="{invalid:!furnitureInsertion.valid}" role="status">{{ furnitureInsertion.valid ? (pointerFurniture ? 'Furniture placement valid · click in Plan to place' : 'Furniture placement valid · confirm in Furniture library') : furnitureInsertion.error }}</div><div v-if="placementPreview" data-testid="placement-preview" class="preview-status" :class="{invalid:!placementPreview.valid}" role="status">{{ placementPreview.valid ? 'Placement valid · offset '+placementPreview.opening.offset.toFixed(2)+' m · '+placementPreview.opening.width.toFixed(2)+' × '+placementPreview.opening.height.toFixed(2)+' m' : placementPreview.error }}</div><div v-if="view === 'Plan'" class="dimension-layer"><svg class="dimension-lines" aria-label="Wall dimension lines"><g v-for="label in wallLabels" :key="label.id" v-show="label.visible" :data-wall-dimension="label.id"><line v-for="(segment,n) in label.segments" :key="n" v-bind="segment" /></g><g v-for="label in chainLabels" :key="label.id" v-show="label.visible" :data-chain-dimension="label.id"><line v-for="(segment,n) in label.segments" :key="n" v-bind="segment" /></g></svg><span v-for="label in chainLabels" :key="label.id" v-show="label.visible" class="wall-dimension chain-dimension" :class="{aperture:label.kind === 'opening'}" :data-chain-kind="label.kind" :title="label.kind === 'opening' ? 'Opening width' : 'Wall gap'" :style="{left:label.x+'px',top:label.y+'px'}">{{ label.length }} m</span><span v-for="label in wallLabels" :key="label.id" v-show="label.visible" class="wall-dimension" :data-wall="label.id" :style="{left:label.x+'px',top:label.y+'px'}">{{ label.length }} m</span></div><div v-if="view === 'Plan'" class="corner-layer"><button v-for="handle in cornerHandles" :key="handle.index" v-show="handle.visible" class="corner-handle" :class="{ dragging }" :style="{left:handle.x+'px',top:handle.y+'px'}" :aria-label="'Corner '+(handle.index+1)+' drag handle'" :disabled="busy || !valid" @pointerdown="startDrag(handle.index,$event)" @pointermove="dragCorner" @pointerup="finishDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag"></button></div><section class="surface-panel" aria-label="Room surfaces"><p class="eyebrow">ROOM SURFACES</p><button v-for="surface in surfaces" :key="surface.id" :aria-pressed="selected === surface.id" :class="{ selected: selected === surface.id }" @click="selected = surface.id">{{ surface.label }}</button><p role="status">{{ selectedLabel }}</p><small v-if="hiddenSelection">Hidden in cutaway · switch to Plan</small><button :disabled="!selected" @click="selected = null">Clear selection</button></section><div class="canvas-note">{{ view === '3D' ? 'ORBIT TO EXPLORE' : 'ORTHOGRAPHIC PLAN · NORTH UP' }}<span>{{ view === '3D' ? 'Click to select · Drag to orbit · Scroll to zoom' : 'Drag a corner to edit · Drag elsewhere to pan · Scroll to zoom' }}</span></div></main>
    <footer role="status" aria-live="polite"><span class="dot"></span><span>{{ busy ? 'Working…' : message }}</span><span class="version">FOUNDATION 01 · METRES</span></footer>
  </div>
</template>
