import {verifyNativeBundle} from './native-bundle-verifier.mjs';
import {nativeArchiveIdentity} from './native-check-report.mjs';
import {nativeMeasurementReport} from './native-measurement-export.mjs';
export const NATIVE_COMPARISON_TOLERANCE=1e-9;
export async function compareNativeZip(beforeContext,bytes){
 const accepted=await verifyNativeBundle(bytes),identity=await nativeArchiveIdentity(bytes),before=nativeMeasurementReport(beforeContext.scene,beforeContext.manifest,beforeContext.identity),after=nativeMeasurementReport(accepted.receiverScene,accepted.manifest,identity),left=new Map(before.elements.map(e=>[e.elementId,e])),right=new Map(after.elements.map(e=>[e.elementId,e])),summary={added:0,removed:0,changed:0,unchanged:0};
 const elements=[...new Set([...left.keys(),...right.keys()])].map(elementId=>{
  const a=left.get(elementId)??null,b=right.get(elementId)??null,changedFields=[];let delta=null,status;
  if(!a){status='added';summary.added++;}else if(!b){status='removed';summary.removed++;}else{
   const difference=(x,y)=>{const d=y-x;return Math.abs(d)<=NATIVE_COMPARISON_TOLERANCE?0:d;},vector=(x,y,label)=>Object.fromEntries(['x','y','z'].map(axis=>{const d=difference(x[axis],y[axis]);if(d)changedFields.push(label+'.'+axis);return [axis,d];}));
   delta={triangulatedArea:difference(a.triangulatedArea,b.triangulatedArea),axisAlignedSpans:vector(a.axisAlignedSpans,b.axisAlignedSpans,'span'),centre:vector(a.centre,b.centre,'centre')};if(delta.triangulatedArea)changedFields.push('area');vector(a.bounds.min,b.bounds.min,'minimum');vector(a.bounds.max,b.bounds.max,'maximum');
   for(const key of ['materialRef','approximation','kind'])if(a[key]!==b[key])changedFields.push(key);if(a.triangleRange.count!==b.triangleRange.count)changedFields.push('triangleCount');
   status=changedFields.length?'changed-measurements':'unchanged-measurements';summary[changedFields.length?'changed':'unchanged']++;
  }
  return {elementId,status,changedFields,before:a,after:b,delta};
 });
 const provenance=r=>({archive:r.archive,source:r.source,engineCommit:r.engineCommit,frame:r.frame});
 return {format:'terratec-native-measurement-comparison',version:1,direction:'candidate minus current bundle',units:{length:'m',area:'m2'},absoluteTolerance:NATIVE_COMPARISON_TOLERANCE,before:provenance(before),after:provenance(after),summary,elements,notes:['Matching uses exact scoped source IDs; renamed IDs appear as removed and added.','Coordinates include receiver placement; no spatial alignment or georeferencing is inferred.','Unchanged measurements do not establish identical geometry, topology or physical properties.','Source ranges are retained for tracing; range offset changes alone do not count as changed measurements.','Areas and furniture bounds retain the source approximation limitations; no deduplicated totals or mass.']};
}
