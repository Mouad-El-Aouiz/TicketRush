import { environment } from '../src/config/environment.js';
import { Database } from '../src/database/database.module.js';
import { hash } from 'argon2';
import { randomBytes } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

environment();
let password=process.env.DEMO_PASSWORD;
if(!password){password=randomBytes(18).toString('base64url');await appendFile(fileURLToPath(new URL('../../../.env',import.meta.url)),`\nDEMO_PASSWORD=${password}\n`);}
const db=new Database();
try{
  const passwordHash=await hash(password);
  const roles=['ADMIN','ORGANISATEUR','CLIENT','CONTROLEUR'];
  for(const role of roles)await db.user.upsert({where:{email:`${role.toLowerCase()}@ticketrush.local`},create:{email:`${role.toLowerCase()}@ticketrush.local`,role,passwordHash},update:{passwordHash}});
  const organizer=await db.user.findUniqueOrThrow({where:{email:'organisateur@ticketrush.local'}});const controller=await db.user.findUniqueOrThrow({where:{email:'controleur@ticketrush.local'}});
  const samples=[{title:'Concert — Midnight Sessions',description:'Une soirée de musique live et de découvertes, du premier accord au dernier rappel.',venue:'Le Studio · Casablanca',day:10,price:3500},{title:'Conférence — Build Tomorrow',description:'Une journée de rencontres autour des idées, du numérique et des projets qui font avancer.',venue:'La Fabrique · Rabat',day:18,price:2500},{title:'Festival — Open Air Club',description:'Des artistes, de la lumière et une scène ouverte pour vivre un week-end hors du quotidien.',venue:'Les Jardins · Marrakech',day:25,price:4900}];
  for(const [index,sample]of samples.entries()){
    const id=`00000000-0000-4000-8000-00000000000${index+1}`;
    await db.event.upsert({where:{id},create:{id,organizerId:organizer.id,title:sample.title,description:sample.description,venue:sample.venue,startsAt:new Date(Date.now()+sample.day*86400000),status:'PUBLISHED',categories:{create:[{name:'Standard',capacity:200,priceCents:sample.price},{name:'Premium',capacity:40,priceCents:sample.price*2}]}},update:{}});
    await db.assignment.upsert({where:{eventId_userId:{eventId:id,userId:controller.id}},create:{eventId:id,userId:controller.id},update:{}});
  }
  console.log('Demo accounts and events are ready. Read DEMO_PASSWORD from your local .env; no password was displayed.');
}finally{await db.$disconnect();}
