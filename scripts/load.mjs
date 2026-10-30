import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
const target=process.env.API_URL??'http://127.0.0.1:3000';
const count=Number(process.env.REQUESTS??100);const concurrency=Number(process.env.CONCURRENCY??10);
const durations=[];let errors=0;let next=0;const start=performance.now();
await Promise.all(Array.from({length:concurrency},async()=>{while(next++<count){const began=performance.now();try{const response=await fetch(`${target}/api/events?limit=9`,{signal:AbortSignal.timeout(10000)});await response.arrayBuffer();if(!response.ok)errors++;}catch{errors++;}durations.push(performance.now()-began);}}));
durations.sort((a,b)=>a-b);const elapsed=performance.now()-start;
const result={requests:count,concurrency,errors,errorRate:errors/count,p95Ms:Math.round(durations[Math.ceil(durations.length*.95)-1]*100)/100,requestsPerSecond:Math.round(count*1000/elapsed*100)/100,elapsedMs:Math.round(elapsed)};
console.log(JSON.stringify(result));if(process.env.REPORT_FILE)await writeFile(process.env.REPORT_FILE,JSON.stringify(result,null,2)+'\n');if(errors)process.exitCode=1;
