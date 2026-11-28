<script setup>
import {computed,ref,shallowRef,watch} from 'vue';
import {previewConstraintRepair,constraintRepairRoom} from '../shared/constraint-repair.mjs';
import {constraintRows,removeConstraint} from '../shared/constraint-display.mjs';
import {wallIds,wallCorners,wallSegment,cornerLabel,wallLabel} from '../shared/room-topology.mjs';
import {togglePointConstraint,setLengthConstraint,setAngleConstraint} from '../shared/room-constraints.mjs';
const props=defineProps({room:{type:Object,required:true},wall:String,disabled:Boolean,failure:Object,project:{type:Object,required:true}});
const emit=defineEmits(['change','select','diagnostic']);
const rows=computed(()=>constraintRows(props.room)),error=ref('');
const diagnosticRows=computed(()=>{if(!props.failure)return [];const labels=constraintRows({...props.room,constraints:props.failure.rows.map(row=>row.constraint)});return props.failure.rows.map((row,i)=>({...row,label:labels[i].label}));});
watch(()=>props.room,()=>{error.value='';},{deep:true});
const localDiagnostic=shallowRef(null),attempted=shallowRef(null),repair=shallowRef(null),relaxed=ref([]),repairError=ref('');
function clearRepair(){localDiagnostic.value=null;attempted.value=null;repair.value=null;relaxed.value=[];repairError.value='';}
watch(()=>props.project,()=>{clearRepair();error.value='';},{deep:true});watch(()=>props.failure,value=>{if(!value||value!==localDiagnostic.value){clearRepair();error.value='';if(['endpoints','wall-move'].includes(value?.request?.type)){localDiagnostic.value=value;attempted.value={...value.request,...(value.request.type==='endpoints'?{points:value.request.points.map(p=>({...p}))}:{})};}}});watch(relaxed,()=>{repair.value=null;repairError.value='';},{deep:true});
const repairChoices=rows;
const repairDrawing=computed(()=>{if(!repair.value)return null;const all=[...props.room.outline,...repair.value.room.outline],minX=Math.min(...all.map(p=>p.x)),minZ=Math.min(...all.map(p=>p.z)),spanX=Math.max(...all.map(p=>p.x))-minX,spanZ=Math.max(...all.map(p=>p.z))-minZ,scale=Math.min(220/Math.max(spanX,.1),120/Math.max(spanZ,.1)),path=points=>points.map(p=>(10+(p.x-minX)*scale)+','+(10+(p.z-minZ)*scale)).join(' ');return {before:path(props.room.outline),after:path(repair.value.room.outline)};});
function previewRepair(){repair.value=null;repairError.value='';try{repair.value=previewConstraintRepair(props.project,attempted.value,relaxed.value);}catch(e){repairError.value=e.message;}}
function applyRepair(){if(!repair.value)return;edit(()=>constraintRepairRoom(props.project,repair.value));}
function setFixed(){const request={type:'length',wall:props.wall,length:Number(length.value)};edit(()=>setLengthConstraint(props.room,request.wall,request.length),request);}
function setRelationship(relationship){const request={type:'angle',wall:props.wall,other:reference.value,relationship};edit(()=>setAngleConstraint(props.room,request.wall,request.other,relationship),request);}
const length=ref(1),reference=ref('');
const corners=computed(()=>props.wall?Object.values(wallCorners(props.room,props.wall)):[]);
const references=computed(()=>wallIds(props.room).filter(id=>id!==props.wall));
watch(()=>[props.room,props.wall],()=>{
  if(props.wall) length.value=(props.room.constraints??[]).find(c=>c.type==='length'&&c.wall===props.wall)?.length??wallSegment(props.room,props.wall).length;
  if(!references.value.includes(reference.value)) reference.value=references.value[0]??'';
},{deep:true,immediate:true});
const relationship=computed(()=>(props.room.constraints??[]).find(c=>c.other&&[c.wall,c.other].includes(props.wall)&&[c.wall,c.other].includes(reference.value))?.type??'none');
const fixed=corner=>(props.room.constraints??[]).some(c=>c.type==='point'&&c.corner===corner);
function edit(change,request=null) {
  if(props.disabled||props.room.locked) return;
  try {emit('change',change());error.value='';clearRepair();}
  catch(e) {clearRepair();localDiagnostic.value=e.constraintDiagnostic??null;attempted.value=request;error.value=e.message;emit('diagnostic',e.constraintDiagnostic??null);}
}
function remove(key) {edit(()=>removeConstraint(props.room,key));}
</script>
<template>
  <section class="constraint-list" aria-label="Saved room constraints">
    <h3>Saved constraints · {{ rows.length }}</h3>
    <p class="hint">Plan markers use these C numbers. Removing a rule keeps the current shape.</p>
    <p v-if="room.locked" class="hint">Unlock walls to remove rules.</p>
    <fieldset v-if="wall && !room.locked" :disabled="disabled"><legend>{{ wallLabel(wall) }} rules</legend>
      <button v-for="corner in corners" :key="corner" :aria-pressed="fixed(corner)" @click="edit(()=>togglePointConstraint(room,corner))">{{ fixed(corner)?'Unlock':'Lock' }} {{ cornerLabel(corner) }}</button>
      <label>Fixed wall length (m)<input v-model.number="length" type="number" min="0.1" step="0.01"></label>
      <div class="opening-actions"><button @click="setFixed">Set fixed length</button><button @click="edit(()=>setLengthConstraint(room,wall,null))">Remove fixed length</button></div>
      <label>Reference wall<select v-model="reference"><option v-for="id in references" :key="id" :value="id">{{ wallLabel(id) }}</option></select></label>
      <p role="status">Saved relationship: {{ relationship }}</p>
      <div class="opening-actions"><button @click="setRelationship('parallel')">Make parallel</button><button @click="setRelationship('perpendicular')">Make perpendicular</button><button @click="edit(()=>setAngleConstraint(room,wall,reference,null))">Remove relationship</button></div>
    </fieldset>
    <p v-if="!rows.length" class="hint">No saved constraints.</p>
    <ul><li v-for="row in rows" :key="row.key">
      <button :aria-label="'Select '+row.id+': '+row.label" @click="emit('select',row.wall)"><strong>{{ row.id }}</strong> · {{ row.label }}</button>
      <button :disabled="disabled || room.locked" :aria-label="'Remove '+row.id+': '+row.label" @click="remove(row.key)">Remove</button>
    </li></ul>
    <section v-if="failure" aria-label="Constraint conflict diagnostics" data-testid="constraint-diagnostics"><h4>Failed attempt · room unchanged</h4><p>Rules involved in the failed attempt and saved point locks; this is not a minimal conflict proof. Residuals describe the attempted shape, not the saved room.</p><p>Solver iterations: {{ failure.iterations }} · tolerance {{ failure.tolerance }} (metres for lengths/points; normalized for angles)</p><p v-if="failure.pinnedCorners.length">Edited points: {{ failure.pinnedCorners.map(cornerLabel).join(', ') }}</p><ul><li v-for="row in diagnosticRows" :key="row.key"><button @click="emit('select',row.walls[0])">{{ row.label }} · {{ Number.isFinite(row.residual)?row.residual.toExponential(3):'unbounded' }} {{ row.unit }} · {{ row.satisfied?'satisfied / locked':'unsatisfied' }}</button></li></ul><fieldset v-if="attempted" :disabled="disabled||room.locked" aria-label="Constraint repair preview"><legend>Preview relaxing saved rules and retry</legend><p v-if="attempted.type==='wall-move'" data-testid="constraint-repair-wall-request">Wall move request · {{ wallLabel(attempted.wall) }} · {{ Math.abs(attempted.distance).toFixed(3) }} m {{ attempted.distance<0?'inward':'outward' }}</p><p v-if="attempted.type==='endpoints'" data-testid="constraint-repair-endpoint-request">Endpoint request · {{ wallLabel(attempted.wall) }} · captured coordinates: {{ attempted.points.map(p=>cornerLabel(p.corner)+' '+p.x.toFixed(3)+', '+p.z.toFixed(3)+' m').join(' / ') }}</p><p>Only the chosen saved rules are removed. The original failed edit is retried and the whole room is validated. Nothing changes until Apply. Choose from all saved rules, including currently satisfied ones.</p><label v-for="row in repairChoices" :key="row.key"><input v-model="relaxed" :value="row.key" type="checkbox" :aria-label="'Relax '+row.id+': '+row.label">{{ row.id }} · {{ row.label }}</label><button :disabled="!relaxed.length" @click="previewRepair">Preview constraint repair</button><p v-if="repairError" role="alert">Repair blocked: {{ repairError }}</p><div v-if="repair" data-testid="constraint-repair-preview"><p>Repair preview ready · not applied · {{ repair.relaxedKeys.length }} saved rules relaxed</p><p>Width {{ room.width.toFixed(3) }} → {{ repair.room.width.toFixed(3) }} m · Depth {{ room.depth.toFixed(3) }} → {{ repair.room.depth.toFixed(3) }} m</p><svg v-if="repairDrawing" viewBox="0 0 240 140" aria-label="Constraint repair geometry preview" class="repair-shape"><polygon :points="repairDrawing.before" fill="none" stroke="#94aca3" stroke-width="2" stroke-dasharray="4 3"/><polygon :points="repairDrawing.after" fill="none" stroke="#ffd176" stroke-width="2"/></svg><p>Dashed: saved outline · Gold: proposed outline · schematic</p><p v-for="change in repair.changes" :key="change.corner">{{ cornerLabel(change.corner) }}: {{ change.before.x.toFixed(3) }}, {{ change.before.z.toFixed(3) }} → {{ change.after.x.toFixed(3) }}, {{ change.after.z.toFixed(3) }} m</p><button @click="applyRepair">Apply constraint repair</button><button @click="repair=null">Discard repair preview</button></div></fieldset><div class="opening-actions"><button v-for="wallId in failure.affectedWalls" :key="wallId" @click="emit('select',wallId)">Inspect {{ wallLabel(wallId) }}</button><button @click="emit('diagnostic',null);error=''">Dismiss constraint diagnostics</button></div></section><p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style>
.constraint-list{border-top:1px solid #45665d;padding-top:10px}.constraint-list h3{font-size:13px}.constraint-list ul{list-style:none;padding:0}.constraint-list li{display:flex;gap:6px;align-items:start;margin:8px 0}.constraint-list li button:first-child{flex:1;text-align:left;white-space:normal}.repair-shape{display:block;width:100%;max-width:280px;height:140px}.constraint-list fieldset[aria-label="Constraint repair preview"] label{display:flex;gap:6px;align-items:start;font-size:12px}.constraint-list strong{color:#f0cd7b}
</style>
