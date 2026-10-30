import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder,                    } from '@nestjs/swagger';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AppModule } from '../dist/app.module.js';
import { configure } from '../dist/common/application.js';

process.env.NODE_ENV='test';
const app=configure(await NestFactory.create(AppModule,{logger:false}));
try {
  const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('TicketRush API').setVersion('1.0').addBearerAuth().build());
  const id=z.uuid();const date=z.string();
  const Category=z.object({id,name:z.string(),capacity:z.number().int(),priceCents:z.number().int()});
  const Event=z.object({id,title:z.string(),description:z.string(),venue:z.string(),startsAt:date,status:z.string(),categories:z.array(Category)});
  const Hold=z.object({id,quantity:z.number().int(),expiresAt:date,status:z.string()});
  const Ticket=z.object({id,code:id,pdfReady:z.boolean(),scannedAt:date.nullable()});
  const Order=z.object({id,totalCents:z.number().int(),status:z.string(),createdAt:date,tickets:z.array(Ticket),hold:Hold.extend({category:Category.extend({event:Event.omit({categories:true})})})});
  const definitions={User:z.object({id,email:z.email(),role:z.enum(['CLIENT','ORGANISATEUR','CONTROLEUR','ADMIN'])}),Category,Event,Hold,Ticket,Order,EventPage:z.object({data:z.array(Event),total:z.number().int(),page:z.number().int(),limit:z.number().int()}),Credentials:z.object({email:z.email(),password:z.string().min(12).max(128)}),Tokens:z.object({accessToken:z.string(),expiresIn:z.number()})};
  const schemas=Object.fromEntries(Object.entries(definitions).map(([name,schema])=>{const {$schema: _schema,...value}=z.toJSONSchema(schema);return [name,value];}));
  document.components={...document.components,schemas:schemas                                                                  };
  const responses                                          ={'/api/events':{get:'EventPage'},'/api/events/{id}':{get:'Event'},'/api/auth/me':{get:'User'},'/api/auth/login':{post:'Tokens'},'/api/auth/register':{post:'Tokens'},'/api/auth/refresh':{post:'Tokens'},'/api/orders/{id}':{get:'Order'}};
  for(const [path,methods] of Object.entries(responses))for(const [method,name]of Object.entries(methods)){const operation=document.paths[path]?.[method                ];if(operation)operation.responses[method==='post'?'201':'200']={description:'Successful response',content:{'application/json':{schema:{$ref:`#/components/schemas/${name}`}}}};}
  for(const path of ['/api/auth/login','/api/auth/register']){const operation=document.paths[path]?.post;if(operation)operation.requestBody={required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/Credentials'}}}};}
  const directory=fileURLToPath(new URL('../../../packages/api-client/',import.meta.url));await mkdir(directory,{recursive:true});await writeFile(directory+'openapi.json',JSON.stringify(document,null,2)+'\n');
  console.log('OpenAPI contract exported.');
} finally {await app.close();}
