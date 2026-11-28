<script setup>
import {ref,onBeforeUnmount} from 'vue';
import {nativeViewerZip,NATIVE_VIEWER_PROFILE} from '../shared/native-viewer-adapter.mjs';
import {MAX_SIMULATION_HANDOFF_BYTES} from '../shared/simulation-handoff.mjs';
let disposed=false;onBeforeUnmount(()=>{disposed=true;});
const busy=ref(false),message=ref('');
async function fileSelected(event){const file=event.target.files?.[0];event.target.value='';if(!file||busy.value)return;busy.value=true;try{if(file.size>MAX_SIMULATION_HANDOFF_BYTES)throw Error('Simulation handoff exceeds 8 MiB');const {bytes,manifest}=await nativeViewerZip(await file.text());if(disposed)return;const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),link=document.createElement('a');link.href=url;link.download='terratec-native-viewer.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='Native viewer bundle exported: '+manifest.summary.triangles+' triangles. Geometry supported; physical-material execution unsupported.';}catch(error){message.value=error.message;}finally{busy.value=false;}}
</script>
<template><section aria-label="Native viewer adapter"><h4>TerraFlux native viewer adapter</h4><p class="hint">Target: {{ NATIVE_VIEWER_PROFILE.id }} at {{ NATIVE_VIEWER_PROFILE.commit.slice(0,7) }}. Choose a checksummed simulation handoff to download scene.json, OBJ geometry and provenance sidecars in one ZIP. This is native-viewer geometry ingestion; physical materials and live simulation are not executed.</p><label>Export native viewer bundle from handoff<input :disabled="busy" type="file" accept=".json,application/json" @change="fileSelected"></label><p data-testid="native-adapter-message" role="status">{{ message }}</p></section></template>
