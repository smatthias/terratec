<script setup>
import {computed,ref,shallowRef,watch,defineAsyncComponent} from 'vue';
import {openingConnectionSegments} from '../shared/opening-connections.mjs';
const OpeningConnections=defineAsyncComponent(()=>import('./OpeningConnections.vue'));
const BuildingQuantities=defineAsyncComponent(()=>import('./BuildingQuantities.vue'));
import {roomAdjacencies} from '../shared/room-adjacency.mjs';
import {roomEntries,activeRoomId,switchProjectRoom} from '../shared/project-rooms.mjs';
import {floorPlanLayout} from '../shared/room-placement.mjs';
const props=defineProps({project:{type:Object,required:true},disabled:Boolean});
const emit=defineEmits(['change','close']);
const layout=computed(()=>floorPlanLayout(roomEntries(props.project))),active=computed(()=>activeRoomId(props.project));
const adjacencies=computed(()=>roomAdjacencies(roomEntries(props.project))),focused=ref(null);
const connected=computed(()=>openingConnectionSegments(roomEntries(props.project),props.project.openingLinks));
const exportScale=ref(0),exporting=ref(false),exportError=ref(''),paperSize=ref('auto'),paperOrientation=ref('landscape'),svgTools=shallowRef(null);
let svgToolsPromise;
function loadSvgTools() {
  if(!svgToolsPromise) svgToolsPromise=import('../shared/building-plan-svg.mjs').then(module=>{svgTools.value=module;return module;}).catch(error=>{svgToolsPromise=null;throw error;});
  return svgToolsPromise;
}
watch(paperSize,paper=>{if(paper!=='auto')loadSvgTools().catch(error=>{exportError.value=error.message;});});
const sheetFeedback=computed(()=>{
  if(paperSize.value==='auto') return null;
  if(!svgTools.value) return {pending:true};
  try {return svgTools.value.buildingPlanSheetLayout(props.project,{scale:exportScale.value||null,paper:paperSize.value,orientation:paperOrientation.value});}
  catch(error) {return {fits:false,error:error.message};}
});
async function exportSvg() {
  const source=JSON.parse(JSON.stringify(props.project)),options={scale:exportScale.value||null,paper:paperSize.value,orientation:paperOrientation.value};
  exporting.value=true;
  try {
    const {exportBuildingPlanSvg}=await loadSvgTools();
    const url=URL.createObjectURL(new Blob([exportBuildingPlanSvg(source,options)],{type:'image/svg+xml;charset=utf-8'})),link=document.createElement('a');
    link.href=url;link.download=(source.name.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70)||'terratec')+'_building-plan.svg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);exportError.value='';
  }catch(error){exportError.value=error.message;}finally{exporting.value=false;}
}
const metres=value=>Number(value.toFixed(6))+' m';
function inspect(link,side) {if(props.disabled)return;focused.value=link.id;emit('change',{project:switchProjectRoom(props.project,side.roomId),label:'Adjacent wall selected',wall:side.wallId});}
const conflicts=computed(()=>new Set(layout.value.overlaps.flatMap(pair=>[pair.a,pair.b])));
function select(id) {if(!props.disabled) emit('change',{project:switchProjectRoom(props.project,id),label:'Room selected in floor plan'});}
</script>
<template>
  <section class="floor-plan-overview" aria-label="Building floor plan">
    <div class="floor-plan-toolbar"><strong>Floor plan · {{ layout.rooms.length }} rooms</strong><label>SVG print scale<select v-model.number="exportScale" aria-label="Building SVG print scale"><option :value="0">Unscaled</option><option v-for="scale in [20,50,100,200]" :key="scale" :value="scale">1:{{ scale }}</option></select></label><label>Paper size<select v-model="paperSize" aria-label="Building SVG paper size"><option value="auto">Drawing bounds</option><option value="A4">A4</option><option value="A3">A3</option></select></label><label v-if="paperSize!=='auto'">Orientation<select v-model="paperOrientation" aria-label="Building SVG orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label><button :disabled="exporting || (sheetFeedback && (sheetFeedback.pending || !sheetFeedback.fits))" @click="exportSvg">Export building plan SVG</button><button @click="emit('close')">Back to room</button></div>
    <div v-if="sheetFeedback" class="building-sheet-fit" data-testid="building-sheet-fit" role="status"><span v-if="sheetFeedback.pending">Checking building sheet…</span><span v-else-if="sheetFeedback.error">{{ sheetFeedback.error }}</span><template v-else><strong>{{ sheetFeedback.fits?'Building plan fits':'Building plan does not fit' }} {{ paperSize }} {{ paperOrientation }} at 1:{{ exportScale }}.</strong><span>Drawing {{ sheetFeedback.requiredWidth.toFixed(1) }} × {{ sheetFeedback.requiredHeight.toFixed(1) }} mm; usable {{ sheetFeedback.usableWidth }} × {{ sheetFeedback.usableHeight }} mm.</span><button v-if="!sheetFeedback.fits && sheetFeedback.suggestedScale" @click="exportScale=sheetFeedback.suggestedScale">Use suggested scale 1:{{ sheetFeedback.suggestedScale }}</button></template></div>
    <p v-if="exportError" role="alert">{{ exportError }}</p>
    <p class="floor-plan-note">Room footprints · metres · select a room, then edit its placement in Room &amp; walls. Overlaps are advisory. Cyan: candidate walls. Green: linked openings. Wall meshes remain independent.</p>
    <svg :viewBox="layout.viewBox" class="floor-plan-map" role="group" aria-label="Room footprints">
      <g v-for="room in layout.rooms" :key="room.id" role="button" :tabindex="disabled?-1:0" :aria-disabled="disabled" :aria-pressed="active===room.id" :aria-label="'Select room '+room.name" :class="{active:active===room.id,overlap:conflicts.has(room.id)}" @click="select(room.id)" @keydown.enter="select(room.id)" @keydown.space.prevent="select(room.id)">
        <title>{{ room.name }}{{ conflicts.has(room.id)?' · overlapping room footprint':'' }}</title>
        <polygon :points="room.points" :stroke-width="layout.strokeWidth"/>
        <text :x="room.centre.x" :y="room.centre.z" :font-size="layout.fontSize">{{ room.name }}</text>
      </g>
      <g class="shared-wall-spans" aria-label="Adjacent wall spans" role="img"><line v-for="link in adjacencies" :key="link.id" :data-adjacency="link.id" :x1="link.start.x" :y1="link.start.z" :x2="link.end.x" :y2="link.end.z" :class="{focused:focused===link.id}"><title>{{ link.a.roomName }} / {{ link.b.roomName }} · {{ metres(link.length) }} candidate shared span</title></line></g>
      <g class="connected-opening-spans" aria-label="Linked opening spans" role="img"><line v-for="link in connected" :key="link.id" :x1="link.start.x" :y1="link.start.z" :x2="link.end.x" :y2="link.end.z"><title>{{ link.label }}</title></line></g>
    </svg>
    <section class="adjacency-register" aria-label="Shared-wall candidates"><h3>Shared-wall candidates · {{ adjacencies.length }}</h3><p v-if="!adjacencies.length">No coincident, oppositely facing wall spans detected.</p><ul v-else><li v-for="link in adjacencies" :key="link.id" :class="{focused:focused===link.id}"><strong>{{ link.a.roomName }} · {{ link.a.wallName }} ↔ {{ link.b.roomName }} · {{ link.b.wallName }}</strong><span>{{ metres(link.length) }} shared span · {{ metres(link.height) }} common height{{ link.heightMismatch?' · room heights differ':'' }}</span><button :disabled="disabled" @click="inspect(link,link.a)">Inspect {{ link.a.roomName }} wall</button><button :disabled="disabled" @click="inspect(link,link.b)">Inspect {{ link.b.roomName }} wall</button></li></ul><p>Wall meshes remain independent. Manage explicit opening links below; thickness and structural compatibility are not verified.</p></section>
    <OpeningConnections v-if="adjacencies.length||project.openingLinks?.length" :project="project" :adjacencies="adjacencies" :disabled="disabled" @change="emit('change',$event)"/>
    <BuildingQuantities :project="project"/>
    <div class="floor-plan-feedback" role="status"><template v-if="layout.overlaps.length"><strong>{{ layout.overlaps.length }} overlapping pairs</strong><ul><li v-for="pair in layout.overlaps" :key="pair.a+':'+pair.b">{{ pair.names.join(' / ') }}</li></ul></template><span v-else>No overlapping room interiors. Wall thickness and structural compatibility are not checked.</span></div>
  </section>
</template>
<style>
.floor-plan-overview{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:#edf1e8;color:#263e3c;padding:12px;overflow:auto}.floor-plan-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}.floor-plan-note,.floor-plan-feedback{font-size:12px;line-height:1.5}.floor-plan-map{flex:1;min-height:240px;width:100%;background:#f9faf5}.floor-plan-map polygon{fill:#dbe5d4;stroke:#607d70}.floor-plan-map g{cursor:pointer}.floor-plan-map g.overlap polygon{fill:#edcfc3;stroke:#a04430}.floor-plan-map g.active polygon,.floor-plan-map g:focus polygon{stroke:#126e83;stroke-width:3px;vector-effect:non-scaling-stroke}.floor-plan-map text{text-anchor:middle;dominant-baseline:middle;fill:#263e3c;pointer-events:none}.floor-plan-feedback ul{margin:4px 0;padding-left:20px;max-height:80px;overflow:auto}
 .shared-wall-spans{pointer-events:none}.shared-wall-spans line{stroke:#087e94;stroke-width:3px;vector-effect:non-scaling-stroke}.shared-wall-spans line.focused{stroke:#b56500;stroke-width:5px}.adjacency-register{font-size:12px}.adjacency-register h3{font-size:13px;margin:8px 0}.adjacency-register ul{padding:0;list-style:none;max-height:140px;overflow:auto}.adjacency-register li{padding:8px;border:1px solid #bbc7bd;margin:4px 0}.adjacency-register li.focused{border-color:#b56500}.adjacency-register span{display:block;margin:4px 0}.adjacency-register button{font-size:11px;padding:5px;margin-right:6px}
.connected-opening-spans{pointer-events:none}.connected-opening-spans line{stroke:#278130;stroke-width:7px;vector-effect:non-scaling-stroke}
.building-sheet-fit{font-size:12px;padding:8px;border:1px solid #bbc7bd}.building-sheet-fit span{display:block;margin-top:4px}
</style>
