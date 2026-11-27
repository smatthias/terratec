import {readFile,stat} from 'node:fs/promises';
import {receiveTerraFluxModel} from '../shared/terraflux-receiver.mjs';
import {MAX_TERRAFLUX_MODEL_BYTES} from '../shared/terraflux-model.mjs';
try {
 const args=process.argv.slice(2),allowed=['--allow-overlaps','--scene'];if(args.filter(a=>!a.startsWith('--')).length!==1||args.some(a=>a.startsWith('--')&&!allowed.includes(a)))throw Error('Usage: npm run check:terraflux -- model.json [--allow-overlaps] [--scene]');
 const file=args.find(a=>!a.startsWith('--'));if((await stat(file)).size>MAX_TERRAFLUX_MODEL_BYTES)throw Error('TerraFlux model exceeds 2 MiB');
 const scene=await receiveTerraFluxModel(await readFile(file,'utf8'),{allowOverlaps:args.includes('--allow-overlaps')});
 console.log(JSON.stringify(args.includes('--scene')?scene:{status:'compatible',source:scene.source,...scene.summary,simulationConnected:scene.simulationConnected,warnings:scene.warnings},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
