import {NATIVE_VIEWER_PROFILE} from './native-viewer-adapter.mjs';
import {nativeResourceCheck} from './native-resource-budget.mjs';
export const MAX_NATIVE_CHECK_REPORT_BYTES=65536;
const normalized=value=>Array.isArray(value)?value.map(normalized):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalized(value[k])])):value;
const equal=(a,b)=>JSON.stringify(normalized(a))===JSON.stringify(normalized(b));
const positive=n=>Number.isSafeInteger(n)&&n>0;
export async function nativeArchiveIdentity(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return {archiveSha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''),archiveBytes:bytes.length};}
export function matchNativeCheckReport(text,context){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_NATIVE_CHECK_REPORT_BYTES)throw Error('Native check report exceeds 64 KiB');
 let report;try{report=JSON.parse(text);}catch{throw Error('Invalid native check report JSON');}
 const parser=report?.format==='terratec-native-parser-check',render=report?.format==='terratec-native-render-check';
 if((!parser&&!render)||report.version!==1||report.engineCommit!==NATIVE_VIEWER_PROFILE.commit||report.simulationConnected!==false)throw Error('Unsupported native check report profile');
 const {manifest,archiveSha256,archiveBytes}=context??{};
 if(!manifest||!/^[a-f0-9]{64}$/.test(archiveSha256)||!positive(archiveBytes)||report.bundle?.status!=='verified'||!['supplied-archive','generated-fixture'].includes(report.bundle.input)||report.bundle.archiveSha256!==archiveSha256||report.bundle.archiveBytes!==archiveBytes||!equal(report.source,manifest.source))throw Error('Native check report does not match the selected bundle');
 const admission=nativeResourceCheck(manifest.summary.triangles,report.bundle.admission?.limits);if(admission.status!=='within-budget'||!equal(report.bundle.admission,admission))throw Error('Native check report resource claims disagree with the bundle');
 if(parser){
  const log='Native logical CPU mesh bytes: '+admission.usage.logicalCpuMeshBytes+'; exact-fit accepted, one-byte-short rejected\nNative scene-v2 and OBJ parsers accepted '+manifest.summary.triangles+' triangles; bounds and normals match\n';
  if(!equal(report.summary,manifest.summary)||report.nativeLog!==log)throw Error('Native parser report lacks matching successful parser evidence');
  return {kind:'parser',status:'matching-imported-report',triangles:manifest.summary.triangles,logicalCpuMeshBytes:admission.usage.logicalCpuMeshBytes,archiveSha256};
 }
 if(!['xvfb','osmesa'].includes(report.backend)||report.softwareRenderingRequested!==true||!Array.isArray(report.modes)||report.modes.length!==2)throw Error('Invalid native rendering report');
 for(let i=0;i<2;i++){
  const m=report.modes[i];if(!m||m.mode!==(i?'offscreen':'direct')||m.importedTriangles!==manifest.summary.triangles||!positive(m.frames)||m.frames>1000000||!positive(m.visibleObjPixels)||!Array.isArray(m.offscreenTargets)||m.offscreenTargets.length>16)throw Error('Native rendering report lacks successful matching modes');
  if(i===0&&m.offscreenTargets.length||i===1&&(!m.offscreenTargets.length||m.offscreenTargets.some(t=>!t||!positive(t.width)||t.width>16384||!positive(t.height)||t.height>16384||t.fallback!==false||t.resize_failures!==0)))throw Error('Native rendering report contains invalid offscreen targets');
  if(report.backend==='osmesa'){const v=typeof m.version==='string'&&m.version.match(/^(\d+)\.(\d+)/);if(typeof m.renderer!=='string'||!m.renderer.length||m.renderer.length>256||!v||m.version.length>256||+v[1]<4||+v[1]===4&&+v[2]<3)throw Error('Native rendering report requires an OpenGL 4.3+ context');}
 }
 if(report.modes[0].visibleObjPixels!==report.modes[1].visibleObjPixels)throw Error('Native rendering report direct/offscreen coverage disagrees');
 if(report.modes[1].offscreenTargets.some(t=>report.modes[1].visibleObjPixels>t.width*t.height)||report.backend==='osmesa'&&(report.modes[0].renderer!==report.modes[1].renderer||report.modes[0].version!==report.modes[1].version))throw Error('Native rendering report context or pixel bounds disagree');
 return {kind:'render',status:'matching-imported-report',triangles:manifest.summary.triangles,backend:report.backend,visibleObjPixels:report.modes[0].visibleObjPixels,renderer:report.backend==='osmesa'?report.modes[0].renderer:null,archiveSha256};
}
