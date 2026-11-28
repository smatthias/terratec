import {readStoredZip} from './stored-zip.mjs';
import {nativeViewerBundle} from './native-viewer-adapter.mjs';
import {nativeResourceCheck,traceNativeTriangle} from './native-resource-budget.mjs';
export async function verifyNativeBundle(bytes,resourceBudget){
 const files=readStoredZip(bytes),expectedNames=['scene.json','assets/model.obj','handoff.json','adapter.json'];
 if(files.length!==4||files.some((f,i)=>f.name!==expectedNames[i]))throw Error('Native bundle must contain exactly the four adapter files in export order');
 let manifest;try{manifest=JSON.parse(files[3].content);}catch{throw Error('Invalid native adapter manifest JSON');}
 // Rebuild from the checksummed source rather than trusting geometry or sidecar claims.
 const rebuilt=await nativeViewerBundle(files[2].content,{requiredFeatures:manifest?.capabilityCheck?.requiredFeatures,resourceBudget:manifest?.resources?.limits});
 for(let i=0;i<files.length;i++)if(files[i].content!==rebuilt.files[i].content)throw Error('Native bundle content disagrees with verified source: '+files[i].name);
 traceNativeTriangle(rebuilt.manifest,0);
 const admission=nativeResourceCheck(rebuilt.manifest.summary.triangles,resourceBudget);if(admission.status==='blocked')throw Error('Native receiving resource budget exceeded: '+admission.exceeded.join(', '));
 return {status:'verified',manifest:rebuilt.manifest,admission,files:expectedNames,simulationConnected:false};
}
