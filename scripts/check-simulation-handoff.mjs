import {readFile,stat} from 'node:fs/promises';
import {verifySimulationHandoff,MAX_SIMULATION_HANDOFF_BYTES} from '../shared/simulation-handoff.mjs';
try {
 const args=process.argv.slice(2);if(args.length<1||args.length>2||args[0].startsWith('--')||args.length===2&&args[1]!=='--require-checksum')throw Error('Usage: npm run check:handoff -- handoff.json [--require-checksum]');
 if((await stat(args[0])).size>MAX_SIMULATION_HANDOFF_BYTES)throw Error('Simulation handoff exceeds 8 MiB');
 const {handoff,integrity}=await verifySimulationHandoff(await readFile(args[0],'utf8'),{requireChecksum:args.includes('--require-checksum')});
 console.log(JSON.stringify({status:'verified-reference',integrity,source:handoff.source,materials:handoff.mapping.materials.length,bindings:handoff.bindings.length,triangles:handoff.scene.summary.triangles,simulationConnected:false},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
