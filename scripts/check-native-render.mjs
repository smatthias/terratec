import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {NATIVE_VIEWER_PROFILE} from '../shared/native-viewer-adapter.mjs';import {nativeCheckOptions,nativeCheckInput} from './native-check-input.mjs';import {nativeRenderEvidence} from '../shared/native-render-report.mjs';
let temporary;
try{
 const opts=nativeCheckOptions(process.argv.slice(2),{render:true}),backend=opts.get('--backend')||'xvfb',bundle=await nativeCheckInput(opts.get('--bundle'));console.error('Verified native bundle: '+bundle.verification.archiveSha256);
 temporary=await mkdtemp(join(tmpdir(),'terratec-native-render-'));const source=join(temporary,'engine'),output=join(temporary,'bundle'),build=join(temporary,'build');await mkdir(source);await mkdir(output);
 const archive=execFileSync('git',['-C',opts.get('--engine-repo'),'archive',NATIVE_VIEWER_PROFILE.commit,'native-compute'],{maxBuffer:33554432});execFileSync('tar',['-xf','-','-C',source],{input:archive});
 for(const file of bundle.files){const path=join(output,file.name);await mkdir(dirname(path),{recursive:true});await writeFile(path,file.content);}
 const cmake=process.env.TERRATEC_CMAKE||'cmake',prefix=process.env.TERRATEC_RENDER_PREFIX,env={...process.env,LIBGL_ALWAYS_SOFTWARE:'1'};if(prefix){env.PATH=join(prefix,'bin')+':'+env.PATH;env.LD_LIBRARY_PATH=join(prefix,'lib/x86_64-linux-gnu')+(env.LD_LIBRARY_PATH?':'+env.LD_LIBRARY_PATH:'');}
 console.error('Building pinned native OpenGL viewer '+NATIVE_VIEWER_PROFILE.commit);
 execFileSync(cmake,['-S',join(source,'native-compute'),'-B',build,'-DTERRAFLUX_WITH_OPENGL=ON','-DBUILD_TESTING=OFF','-DCMAKE_BUILD_TYPE=Release',...(prefix?['-DCMAKE_PREFIX_PATH='+prefix]:[]),...(process.env.TERRATEC_RENDER_CXX_FLAGS?['-DCMAKE_CXX_FLAGS='+process.env.TERRATEC_RENDER_CXX_FLAGS]:[])],{env,stdio:'inherit',timeout:60000});
 execFileSync(cmake,['--build',build,'--target','terraflux-terrain-viewer','--parallel','2'],{env,stdio:'inherit',timeout:300000});
 let runEnv={...env};if(backend==='osmesa'){
  const shim=join(temporary,'osmesa-context.so');execFileSync('g++',['-std=c++20','-shared','-fPIC',...(prefix?['-I'+join(prefix,'include')]:[]),fileURLToPath(new URL('../tools/native-osmesa-context.cpp',import.meta.url)),'-ldl','-o',shim],{timeout:60000,stdio:['ignore','pipe','pipe']});runEnv.LD_PRELOAD=shim+(env.LD_PRELOAD?':'+env.LD_PRELOAD:'');
 }
 const modes=[];for(const offscreen of [false,true]){
  console.error('Running '+(offscreen?'offscreen':'direct')+' '+backend+' render smoke');const viewerArgs=['--scene',join(output,'scene.json'),'--smoke-test','--hide-terrain','--hide-fire',...(offscreen?['--offscreen']:[])],binary=join(build,'terraflux-terrain-viewer');
  const log=backend==='osmesa'?execFileSync(binary,viewerArgs,{env:runEnv,encoding:'utf8',maxBuffer:1048576,timeout:60000}):execFileSync('xvfb-run',['-a','-s','-screen 0 1280x800x24',binary,...viewerArgs],{env:runEnv,encoding:'utf8',maxBuffer:1048576,timeout:60000});
  const evidence=nativeRenderEvidence(log,{offscreen,backend});if(evidence.importedTriangles!==bundle.manifest.summary.triangles)throw Error('Rendered scene triangle count differs from the exported bundle');modes.push(evidence);
 }
 if(modes[0].visibleObjPixels!==modes[1].visibleObjPixels)throw Error('Direct and offscreen OBJ pixel coverage differs');
 const report={format:'terratec-native-render-check',version:1,engineCommit:NATIVE_VIEWER_PROFILE.commit,source:bundle.manifest.source,bundle:bundle.verification,backend,softwareRenderingRequested:true,modes,simulationConnected:false};const reportPath=opts.get('--report');if(reportPath){await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.stderr?.toString()||error.message);process.exitCode=1;}finally{if(temporary){if(process.env.TERRATEC_KEEP_RENDER_TMP==='1')console.error('Retained render test files: '+temporary);else await rm(temporary,{recursive:true,force:true});}}
