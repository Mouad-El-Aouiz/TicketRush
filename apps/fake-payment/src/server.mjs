import { createServer } from 'node:http';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const secret = process.env.PAYMENT_SECRET;
if (!secret || secret.length < 48) throw new Error('PAYMENT_SECRET is required');
const callback = process.env.PAYMENT_CALLBACK_URL ?? 'http://127.0.0.1:3000/api/payments/webhook';
const server = createServer(async (req, res) => {
  res.setHeader('content-type','application/json');
  const reply=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  if (req.url === '/health' && req.method === 'GET') return reply(200,{status:'ok',mode:'simulated'});
  if(req.url !== '/simulate' || req.method !== 'POST') return reply(404,{message:'Not found'});
  const key=req.headers['x-provider-key'];
  if(typeof key !== 'string' || Buffer.byteLength(key)!==Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(key),Buffer.from(secret))) return reply(401,{message:'Unauthorized'});
  try {
    let raw='';
    for await(const chunk of req){raw+=chunk.toString();if(raw.length>10000)return reply(413,{message:'Payload too large'});}
    const input=JSON.parse(raw);
    if(!['SUCCEEDED','FAILED'].includes(input.status) || !Number.isSafeInteger(input.amountCents) || input.amountCents<0 || !/^[0-9a-f-]{36}$/.test(input.orderId) || typeof input.providerRef!=='string')return reply(400,{message:'Invalid payment'});
    const body=JSON.stringify({id:randomUUID(),orderId:input.orderId,providerRef:input.providerRef,amountCents:input.amountCents,status:input.status,timestamp:Date.now()});
    const signature=createHmac('sha256',secret).update(body).digest('hex');
    let delivered=false;
    for(let attempt=0;attempt<3;attempt++){
      try { const result=await fetch(callback,{method:'POST',headers:{'content-type':'application/json','x-payment-signature':signature},body,signal:AbortSignal.timeout(5000)}); if(result.ok){delivered=true;break;} if(result.status<500)return reply(502,{message:'Callback rejected'}); } catch { /* Bounded retry on transient provider callback failure. */ }
      await new Promise(resolve=>setTimeout(resolve,100*(2**attempt)+Math.random()*100));
    }
    return reply(delivered?200:503,{delivered,mode:'simulated'});
  }catch{return reply(400,{message:'Invalid request'});}
});
server.listen(Number(process.env.FAKE_PAYMENT_PORT??4000),process.env.FAKE_PAYMENT_HOST??'127.0.0.1',()=>console.log('Fake payment provider listening'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
