<script setup>
import {ref,onMounted} from 'vue';
const props=defineProps({snapshot:{type:Object,required:true}});
const emit=defineEmits(['close']);
const frame=ref(null),ready=ref(false),error=ref(''),closeButton=ref(null);
onMounted(()=>closeButton.value?.focus());
function printSheet() {
  if(!ready.value)return;
  try {frame.value.contentWindow.focus();frame.value.contentWindow.print();error.value='';}
  catch {error.value='The print dialog could not open. Download the HTML sheet, open it in your browser and print there.';}
}
function download() {
  const snapshot=props.snapshot,url=URL.createObjectURL(new Blob([snapshot.html],{type:'text/html;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download=(snapshot.projectName.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70)||'terratec')+'_building-sheet-'+snapshot.paper+'-'+snapshot.orientation+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
</script>
<template>
  <section class="building-sheet-preview" role="dialog" aria-labelledby="building-sheet-preview-title" aria-modal="false" @keydown.esc.stop.prevent="emit('close')">
    <div class="building-sheet-preview-toolbar"><h3 id="building-sheet-preview-title">Printable sheet · {{ snapshot.paper }} {{ snapshot.orientation }} · 1:{{ snapshot.scale }} · {{ snapshot.pageCount }} page(s)</h3><button :disabled="!ready" @click="printSheet">Print / Save PDF</button><button @click="download">Download HTML sheet</button><button ref="closeButton" @click="emit('close')">Close sheet preview</button></div>
    <p>This is a snapshot of {{ snapshot.projectName }}. Close and reopen to include later edits. Print at 100% without fit-to-page or extra margins.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <iframe ref="frame" :srcdoc="snapshot.html" title="Printable building sheet" sandbox="allow-same-origin allow-modals" @load="ready=true"></iframe>
  </section>
</template>
<style>.building-sheet-preview{position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;min-height:0;padding:10px;background:#edf1e8;color:#263e3c;overflow:hidden}.building-sheet-preview-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.building-sheet-preview-toolbar h3{font-size:14px;flex:1}.building-sheet-preview-toolbar button{font-size:12px;padding:7px}.building-sheet-preview p{font-size:12px;line-height:1.5}.building-sheet-preview iframe{width:100%;flex:1;min-height:0;border:1px solid #bbc7bd;background:#dce3dc}.floor-plan-overview.sheet-preview-open{overflow:hidden}</style>
