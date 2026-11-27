// Runs before `npm test` (npm's pretest): checks that the tests can run on this
// machine, and says what to do instead of letting dozens of tests fail with
// import or spawn errors.
//   - the npm packages are installed (`npm ci`): the 3D tests import three;
//   - the native geometry core (build/terratec-core) exists and runs here. A
//     core compiled on another machine may need a newer C++ runtime or C library
//     than this one has (e.g. "GLIBCXX_3.4.32 not found"): rebuild it here.
import {execFileSync} from 'node:child_process';
import {existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('..',import.meta.url)),core=fileURLToPath(new URL('../build/terratec-core',import.meta.url));
const BUILD=['cmake -S . -B build -DCMAKE_BUILD_TYPE=Release','cmake --build build --parallel 2'];
const problems=[];

try {await import('three');}
catch {problems.push(['The npm packages are not installed (three cannot be loaded).',['npm ci']]);}

// Cores compiled before the build always wrote to build/ (an in-source build, an IDE's build folder).
const strays=()=>['terratec-core',...readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^(cmake-build-|out$|build-)/.test(d.name)).flatMap(d=>[d.name+'/terratec-core',d.name+'/Release/terratec-core',d.name+'/Debug/terratec-core'])].filter(f=>existsSync(root+f));
if(!existsSync(core)) {
  const found=strays();
  problems.push([`The native geometry core has not been built (build/terratec-core is missing).${found.length?`\n    Found ${found.join(', ')} from an earlier build: the build now always writes build/terratec-core, so build again.`:''}`,BUILD]);
}
else {
  try {
    const out=execFileSync(core,['6','4','2.8'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});
    if(!out.includes('"area":24')) problems.push([`build/terratec-core runs but answers unexpectedly: ${out.trim().slice(0,120)}`,['rm -rf build',...BUILD]]);
  } catch(error) {
    const detail=String(error.stderr||error.message).trim().split('\n')[0];
    const foreign=/GLIBC|not found|Exec format error|cannot execute|ENOEXEC|error while loading shared libraries/i.test(detail);
    problems.push([foreign?`build/terratec-core was built for another system and cannot run here:\n    ${detail}`:`build/terratec-core cannot run: ${detail}`,['rm -rf build',...BUILD]]);
  }
}

if(problems.length) {
  console.error('\nThe tests cannot run on this machine yet:\n');
  for(const [what,commands] of problems) console.error(`  • ${what}\n    Fix (in ${root}):\n${commands.map(c=>'      '+c).join('\n')}\n`);
  console.error('See "Run locally" in README.md (Node.js 22.12+, CMake 3.16+ and a C++17 compiler).\n');
  process.exit(1);
}
