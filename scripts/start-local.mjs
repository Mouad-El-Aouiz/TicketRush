import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
await access(new URL('apps/api/dist/main.js',root));
await access(new URL('apps/web/.next/standalone/apps/web/server.js',root));
const definitions=[['api',['--import','./telemetry.mjs','dist/main.js']],['fake-payment',['--env-file=../../.env','src/server.mjs']],['web',['scripts/start.mjs']]];
const children=definitions.map(([name,args])=>spawn(process.execPath,args,{cwd:fileURLToPath(new URL(`apps/${name}/`,root)),stdio:'inherit',windowsHide:true,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}}));
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
for(const child of children){child.on('error',()=>{process.exitCode=1;stop();});child.on('exit',code=>{if(!stopping){process.exitCode=code??1;stop();}});}
