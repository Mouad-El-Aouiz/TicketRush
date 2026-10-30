import { readFile,writeFile,access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const file=new URL('../.env',import.meta.url);
try{await access(file);console.log('Existing local .env retained.');}catch{
 let text=await readFile(new URL('../.env.example',import.meta.url),'utf8');
 text=text.replace(/^POSTGRES_PASSWORD=.*$/m,`POSTGRES_PASSWORD=${process.env.POSTGRES_PASSWORD??randomBytes(32).toString('hex')}`).replace(/^REDIS_PASSWORD=.*$/m,`REDIS_PASSWORD=${randomBytes(32).toString('hex')}`);
 await writeFile(file,text,{flag:'wx'});console.log('Local .env initialized without displaying secrets.');
}
