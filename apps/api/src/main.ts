import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parsePort } from './config/port.js';
import { configure } from './common/application.js';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { environment } from './config/environment.js';

async function bootstrap() {
  const port = parsePort(process.env.PORT);
  const app = configure(await NestFactory.create(AppModule, { rawBody: true }));
  const swagger = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('TicketRush API')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, swagger);
  await app.listen(port, environment().API_HOST);
}
await bootstrap();
