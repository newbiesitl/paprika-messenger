import { mkdir, cp, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=resolve('artifacts');await mkdir(root,{recursive:true});
const stage=await mkdtemp(resolve(root,'deploy-stage-'));
// Same archive topology as the Sites packager; native tar keeps this portable
// on Windows hosts that have no Bash. Migrations belong under dist/.openai.
await cp('dist',resolve(stage,'dist'),{recursive:true});
await cp('.openai',resolve(stage,'dist/.openai'),{recursive:true});
await cp('drizzle',resolve(stage,'dist/.openai/drizzle'),{recursive:true});
const archive=resolve(root,'dot-board.tar.gz');
const result=spawnSync('tar',['-czf',archive,'-C',stage,'dist'],{encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr || 'Could not package build.');
console.log(JSON.stringify({archive}));
