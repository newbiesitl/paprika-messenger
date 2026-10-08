import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { SqliteD1 } from '../tests/d1-adapter.mjs';
import { migrateDevelopmentDatabase } from '../tests/migrations.mjs';
await import('./build.mjs');
const {handle}=await import('../dist/_worker.js');
await mkdir('.dev-data',{recursive:true});
const db=new SqliteD1('.dev-data/board.sqlite');
await migrateDevelopmentDatabase(db.connection);
const port=Number(process.env.DOT_DEV_PORT || 8787);
if(!Number.isSafeInteger(port) || port<1 || port>65535)throw Error('DOT_DEV_PORT must be a port from 1 to 65535.');
const env={PAPRIKA_SERVICE_TYPE:process.env.PAPRIKA_SERVICE_TYPE ?? 'chatgpt-codex',DB:db,OWNER_USER_ID:'local-development-owner',COORDINATOR_USER_ID:'local-development-owner',SITE_ORIGIN:`http://127.0.0.1:${port}`};
// Development adapter binds loopback only and simulates Sites' verified edge identity.
// This adapter is NEVER included in the Worker build or production package.
createServer(async(req,res)=>{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>32768){res.writeHead(413).end();return;}chunks.push(chunk);}
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  headers.set('oai-authenticated-user-id',env.OWNER_USER_ID);
  const request=new Request(new URL(req.url,env.SITE_ORIGIN),{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  const response=await handle(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port,'127.0.0.1',()=>console.log(`Development board: ${env.SITE_ORIGIN} (loopback only; simulated owner, local SQLite)`));
