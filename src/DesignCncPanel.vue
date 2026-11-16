<script setup>
defineProps({plan:{type:Object,required:true}});
const emit=defineEmits(['export','select']);
</script>
<template>
  <section class="design-cnc" aria-label="CNC plan">
    <p class="eyebrow">CNC PLAN · MACHINE-NEUTRAL</p>
    <p v-if="plan.error" class="hint">{{ plan.error }}</p>
    <template v-else>
      <p data-testid="cnc-status" role="status" :class="plan.ready?'cnc-ready':'cnc-blocked'">{{ plan.ready ? 'Ready for CAM' : 'Resolve errors before CAM' }} · {{ plan.parts.length }} sheet parts · {{ plan.parts.reduce((n,p)=>n+p.operations.length,0) }} operations</p>
      <table class="cnc-layers"><thead><tr><th>#</th><th>Layer</th><th>Operation</th><th>Ops</th><th>Max depth</th></tr></thead>
        <tbody><tr v-for="layer in plan.layers" :key="layer.id"><td>{{ layer.order }}</td><td>{{ layer.name }}</td><td>{{ layer.operation }}</td><td>{{ layer.operations }}</td><td>{{ layer.maxDepthMm }} mm</td></tr></tbody></table>
      <ul v-if="plan.issues.length" class="cnc-issues" data-testid="cnc-issues">
        <li v-for="(issue,n) in plan.issues" :key="n" :class="issue.severity"><button @click="emit('select',issue)">{{ issue.severity }} · {{ issue.message }}</button></li>
      </ul>
      <button @click="emit('export')">Export CNC plan JSON</button>
      <p class="hint">Operations per panel in layer order, in sheet millimetres, face A up. This is the structure G-code will be generated from; tools, feeds, tabs and machine post-processing are not included yet.</p>
    </template>
  </section>
</template>
