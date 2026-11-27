<script setup>
import {ref,shallowRef,watch,onBeforeUnmount,computed} from 'vue';
import {prepareSimulationHandoff,exportSimulationHandoff} from '../shared/simulation-handoff.mjs';
const props=defineProps({text:{type:String,required:true},allowOverlaps:Boolean});
let disposed=false;onBeforeUnmount(()=>{disposed=true;});
const contextKey=()=>JSON.stringify([props.text,props.allowOverlaps,mappingText.value]);
const inventory=computed(()=>{try{return JSON.parse(props.text).rooms.flatMap(r=>r.furniture.map(f=>({roomId:r.id,furnitureId:f.id,sourceMaterialId:f.materialId})));}catch{return [];}});
const mappingText=ref(''),report=shallowRef(null),message=ref(''),busy=ref(false);
watch([mappingText,()=>props.text,()=>props.allowOverlaps],()=>{report.value=null;message.value='';});
function example(){mappingText.value=JSON.stringify({version:1,materials:[{id:'user-material',name:'Enter target material',densityKgM3:null,friction:null,restitution:null,sourceNote:'Enter the source of your values'}],sourceMaterials:{},bodyOverrides:[],surfaceMaterialId:'user-material',acceptBoundingBoxes:false,acceptZeroThickness:false},null,2);}
function mapping(){if(new TextEncoder().encode(mappingText.value).length>32768)throw Error('Material mapping exceeds 32 KiB');try{return JSON.parse(mappingText.value);}catch{throw Error('Enter valid material mapping JSON');}}
async function validate(){if(busy.value)return;busy.value=true;report.value=null;try{const snapshot=contextKey(),result=await prepareSimulationHandoff(props.text,mapping(),{allowOverlaps:props.allowOverlaps});if(disposed||snapshot!==contextKey())return;report.value=result;message.value='Handoff validation: '+result.validation.status;}catch(error){message.value=error.message;}finally{busy.value=false;}}
async function download(){if(busy.value)return;busy.value=true;try{const snapshot=contextKey(),text=await exportSimulationHandoff(props.text,mapping(),{allowOverlaps:props.allowOverlaps});if(disposed||snapshot!==contextKey())throw Error('Model or mapping changed; validate again');const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='terratec-simulation-handoff.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='Reference simulation handoff exported';}catch(error){message.value=error.message;}finally{busy.value=false;}}
</script>
<template>
  <section aria-label="Simulation material mapping"><h4>Material mapping and handoff</h4><p class="hint">Supply target material IDs, density (kg/m³), friction, restitution and a source note. No catalogue values are copied automatically. Source material IDs map furniture; unknown/mixed materials need a room/furniture override. All static surfaces use the chosen surface material. No mass is inferred from bounding boxes.</p>
    <p class="hint">Handoff uses file coordinates with zero receiver placement; preview transforms are not carried over.</p><ul><li v-for="item in inventory" :key="item.roomId+item.furnitureId">{{ item.roomId }} / {{ item.furnitureId }} · source material {{ item.sourceMaterialId??'unknown/mixed' }}</li></ul>
    <fieldset :disabled="busy"><button @click="example">Load material mapping template</button><label>Simulation material mapping JSON<textarea v-model="mappingText" rows="12" spellcheck="false"></textarea></label><button @click="validate">Validate simulation handoff</button><button :disabled="report?.validation.status!=='validated-reference'" @click="download">Export simulation handoff JSON</button></fieldset>
    <p data-testid="handoff-message" role="status">{{ message }}</p><ul v-if="report" data-testid="handoff-issues"><li v-for="(issue,index) in report.validation.issues" :key="index">{{ issue.severity }} · {{ issue.code }} · {{ issue.message }}</li></ul><p v-if="report" data-testid="handoff-bindings">{{ report.bindings.length }} element bindings · {{ report.mapping.materials.length }} target materials</p><p class="hint">This validates a reference handoff only. The physics engine, solver-specific properties and engine acceptance remain unconnected.</p>
  </section>
</template>
