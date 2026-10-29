import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Errors } from './http.js';
import { environment } from '../config/environment.js';

export function configure<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: environment().WEB_ORIGIN, credentials: true });
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('x-correlation-id', randomUUID());
    next();
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  return app;
}
