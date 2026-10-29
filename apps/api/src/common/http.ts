import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  PipeTransform,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';

export class BodySchema<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    return result.data;
  }
}

@Catch()
export class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const response =
      error instanceof HttpException ? error.getResponse() : undefined;
    const data =
      typeof response === 'object' && response !== null
        ? (response as Record<string, unknown>)
        : {};
    const correlationId =
      typeof res.getHeader('x-correlation-id') === 'string'
        ? res.getHeader('x-correlation-id')
        : randomUUID();
    if (status === 500)
      console.error(
        JSON.stringify({
          level: 'error',
          correlationId,
          method: req.method,
          path: req.path,
          message: 'Request failed',
        }),
      );
    res.status(status).json({
      code: typeof data.code === 'string' ? data.code : `HTTP_${status}`,
      message:
        status === 500
          ? 'Internal server error'
          : (data.message ?? response ?? 'Request failed'),
      ...(data.details ? { details: data.details } : {}),
      correlationId,
    });
  }
}

export const uuid = new BodySchema(z.uuid());
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['startsAt', 'title']).default('startsAt'),
});
