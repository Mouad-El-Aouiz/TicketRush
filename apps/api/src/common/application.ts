import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { Errors } from './http.js';
import { environment } from '../config/environment.js';
import { Metrics } from '../operations/operations.module.js';
import { Runtime } from '../runtime/runtime.module.js';
import { pinoHttp } from 'pino-http';
import { context, trace } from '@opentelemetry/api';

export function configure<T extends INestApplication>(app: T): T {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: environment().WEB_ORIGIN, credentials: true });
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('x-correlation-id', randomUUID());
    next();
  });
  const metrics = app.get(Metrics);
  const runtime = app.get(Runtime);
  app.use(
    pinoHttp({
      enabled: environment().NODE_ENV !== 'test',
      serializers: {
        req: (req: Request) => ({
          method: req.method,
          path: req.url?.split('?')[0],
        }),
        res: (res: Response) => ({ statusCode: res.statusCode }),
      },
      customProps: (_req, res) => ({
        correlationId: res.getHeader('x-correlation-id'),
        traceId: trace.getSpan(context.active())?.spanContext().traceId,
      }),
    }),
  );
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    res.on('finish', () => {
      const path = (req.route as { path?: unknown } | undefined)?.path;
      const route = typeof path === 'string' ? path : 'unmatched';
      metrics.requests.inc({
        method: req.method,
        route,
        status: res.statusCode,
      });
      metrics.duration.observe(
        { method: req.method, route },
        (performance.now() - start) / 1000,
      );
    });
    if (
      req.method === 'POST' &&
      /^\/api\/auth\/(login|register|refresh)$/.test(req.path)
    ) {
      void runtime
        .limit(`auth:${req.socket.remoteAddress ?? 'local'}`, 30)
        .then(() => next())
        .catch(next);
    } else next();
  });
  app.useGlobalFilters(new Errors());
  app.enableShutdownHooks();
  return app;
}
