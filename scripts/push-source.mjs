// Supported native Sites source credential; kept in stdin and child process memory.
// Fallback when the installed Sites workflow helper is unavailable on this host.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
const input=createInterface({input:process.stdin,terminal:false});
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for Sites source credential on stdin (input is hidden).');
const line=await new Promise(resolve=>input.once('line',resolve));input.close();
if(process.stdin.isTTY)process.stdin.setRawMode(false);
const {credential,project_id}=JSON.parse(line);
if(credential.auth_mode!=='http_extra_header')throw Error('Unsupported credential mode.');
const authEnv={...process.env,GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:`Authorization: Bearer ${credential.token}`,GIT_TERMINAL_PROMPT:'0'};
const root=process.cwd().replaceAll('\\','/');
async function git(args,auth=false,allowFailure=false){
  const result=await new Promise((resolve,reject)=>{
    const child=spawn('git',['-c',`safe.directory=${root}`,...args],{env:auth?authEnv:process.env,windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));
  });
  if(result.code!==0&&!allowFailure)throw Error(result.stderr.replaceAll(credential.token,'[redacted]'));
  return result;
}
const remotes=(await git(['remote'])).stdout.trim().split(/\s+/);
if(!remotes.includes('sites'))await git(['remote','add','sites',credential.remote_url]);
else if((await git(['remote','get-url','sites'])).stdout.trim()!==credential.remote_url)throw Error('Sites remote belongs to another project.');
await git(['config','user.name','Dot board builder']);await git(['config','user.email','dot-builder@users.noreply.local']);
await git(['add','.gitignore','package.json','package-lock.json','.env.example','.openai','db','drizzle','drizzle.config.ts','src','web','scripts','tests','skills','README.md','docs']);
const staged=await git(['diff','--cached','--quiet'],false,true);
if(staged.code!==0)await git(['commit','-m','Build private agent board and hosted MCP service']);
const sha=(await git(['rev-parse','HEAD'])).stdout.trim();
await git(['push','sites',`HEAD:refs/heads/${credential.branch}`],true);
const pushed=await git(['ls-remote','sites',`refs/heads/${credential.branch}`],true);
if(!pushed.stdout.startsWith(sha))throw Error('Pushed source could not be verified.');
console.log(JSON.stringify({project_id,commit_sha:sha,checkout_path:process.cwd()}));
