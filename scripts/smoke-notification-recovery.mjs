import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
const files=['compose.yaml','compose.app.yaml','compose.observability.yaml'];
const compose=files.flatMap(file=>['-f',file]);
function docker(...args){const result=spawnSync('docker',['compose',...compose,...args],{stdio:'inherit',windowsHide:true,timeout:30000});assert.equal(result.status,0,'Docker operation failed');}
function purchase(skip=false){const result=spawnSync(process.execPath,['--env-file=.env','scripts/smoke-local.mjs',...(skip?['--skip-notifications']:[])],{encoding:'utf8',windowsHide:true,timeout:60000});if(result.status!==0)throw new Error(result.stderr||'Purchase scenario failed');return JSON.parse(result.stdout);}
async function until(check){const stop=Date.now()+20000;while(!await check()){if(Date.now()>stop)throw new Error('Recovery timed out');await new Promise(resolve=>setTimeout(resolve,500));}}
const first=purchase();
let during,queued;
docker('stop','notifications');
try{
  during=purchase(true);
  assert.equal((await fetch('http://127.0.0.1:8080/api/events')).status,200);
  assert.equal((await fetch('http://127.0.0.1:8080/api/ops/ready')).status,200);
  const authorization='Basic '+Buffer.from(`${process.env.RABBITMQ_USER??'ticketrush'}:${process.env.RABBITMQ_PASSWORD}`).toString('base64');
  await until(async()=>{const response=await fetch('http://127.0.0.1:15672/api/queues/%2F/ticketrush.notifications.v1',{headers:{authorization},signal:AbortSignal.timeout(5000)});assert.equal(response.status,200);queued=await response.json();return queued.messages_ready>=1&&queued.consumers===0;});
}finally{docker('start','notifications');}
const resumed=Date.now();
await until(async()=>{try{return(await fetch('http://127.0.0.1:4100/ready',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}});
const login=await fetch('http://127.0.0.1:8080/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'client@ticketrush.local',password:process.env.DEMO_PASSWORD})});assert.equal(login.status,201);const {accessToken}=await login.json();
await until(async()=>{const response=await fetch('http://127.0.0.1:8080/api/notifications',{headers:{authorization:`Bearer ${accessToken}`},signal:AbortSignal.timeout(5000)});if(!response.ok)return false;const inbox=await response.json();return[first.orderId,during.orderId].every(id=>inbox.filter(item=>item.orderId===id).length===1);});
const report={status:'passed',scenario:'notification consumer stopped during purchase',coreCatalogAndReadiness:200,purchaseAndPdfWhileStopped:during.status,queuedMessages:queued.messages_ready,consumersWhileStopped:queued.consumers,notificationsAfterRestart:'one per order, including order created before restart',recoveryMs:Date.now()-resumed,recordedAt:new Date().toISOString()};
await writeFile('docs/notification-recovery.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
