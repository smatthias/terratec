<script setup>
// Office-style editing toolbar for the furniture selection. The parent owns the
// model; this component only reports commands.
defineProps({selectionCount:{type:Number,required:true},clipboardCount:{type:Number,required:true},furnitureCount:{type:Number,required:true},
  pastePlacing:Boolean,inspecting:Boolean,disabled:Boolean});
const emit=defineEmits(['cut','copy','paste','pastePlace','duplicate','remove','selectAll','rotate','zoom','inspect']);
const mod=/Mac|iPhone|iPad/.test(globalThis.navigator?.platform??'')?'⌘':'Ctrl+';
</script>
<template>
  <div class="furniture-toolbar" role="toolbar" aria-label="Furniture tools">
    <div class="tool-group" aria-label="Clipboard">
      <button :disabled="disabled||!selectionCount" :title="'Cut ('+mod+'X)'" @click="emit('cut')">Cut furniture</button>
      <button :disabled="disabled||!selectionCount" :title="'Copy ('+mod+'C)'" @click="emit('copy')">Copy furniture</button>
      <button :disabled="disabled||!clipboardCount" :title="'Paste next to the original or nearest free space ('+mod+'V)'" @click="emit('paste')">Paste furniture</button>
      <button :disabled="disabled||!clipboardCount" :aria-pressed="pastePlacing" title="Click in Plan to paste there" @click="emit('pastePlace')">Paste in Plan</button>
      <button :disabled="disabled||!selectionCount" :title="'Duplicate ('+mod+'D)'" @click="emit('duplicate')">Duplicate furniture</button>
      <button :disabled="disabled||!selectionCount" title="Delete (Delete)" @click="emit('remove')">Delete furniture</button>
      <button :disabled="disabled||!furnitureCount" :title="'Select all furniture ('+mod+'A)'" @click="emit('selectAll')">Select all furniture</button>
    </div>
    <div class="tool-group" aria-label="Rotate">
      <button v-for="step in [-90,-15,15,90]" :key="step" :disabled="disabled||!selectionCount" :title="Math.abs(step)===15?(step<0?'Shift+R':'R'):''" @click="emit('rotate',step)">Rotate {{ step>0?'+':'−' }}{{ Math.abs(step) }}°</button>
    </div>
    <div class="tool-group" aria-label="View">
      <button :disabled="!selectionCount" title="Zoom to selection (F)" @click="emit('zoom')">Zoom to selection</button>
      <button :disabled="disabled||selectionCount!==1&&!inspecting" :aria-pressed="inspecting" title="Inspect the active item in 3D (I)" @click="emit('inspect')">{{ inspecting ? 'Exit inspection' : 'Inspect furniture' }}</button>
    </div>
    <span class="tool-status" data-testid="furniture-selection" role="status">{{ selectionCount }} selected · clipboard {{ clipboardCount }}</span>
  </div>
</template>
