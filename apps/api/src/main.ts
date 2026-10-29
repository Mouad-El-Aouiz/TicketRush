import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parsePort } from './config/port.js';

async function bootstrap() {
  const port = parsePort(process.env.PORT);
  const app = await NestFactory.create(AppModule);
  await app.listen(port, '127.0.0.1');
}
await bootstrap();
