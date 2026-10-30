import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  PayloadTooLargeException,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import { z } from 'zod';
import { CurrentUser, Roles, type Actor } from '../auth/auth.module.js';
import { Database } from '../database/database.module.js';
import { Runtime } from '../runtime/runtime.module.js';

const columns = [
  'title',
  'description',
  'venue',
  'startsAt',
  'category',
  'capacity',
  'priceCents',
];
const rowSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(10000),
    venue: z.string().trim().min(2).max(200),
    startsAt: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .refine((v) => v > new Date(), 'Event must be in the future'),
    category: z.string().trim().min(1).max(80),
    capacity: z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100000)),
    priceCents: z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(0).max(10000000)),
  })
  .strict();
type Row = z.infer<typeof rowSchema>;
@Injectable()
export class ImportsService {
  constructor(
    private readonly db: Database,
    private readonly runtime: Runtime,
  ) {}
  async events(req: Request, organizerId: string) {
    await this.runtime.limit(`import:${organizerId}`, 3);
    if (!req.is('text/csv'))
      throw new BadRequestException('Content-Type must be text/csv');
    const maxBytes = 20 * 1024 * 1024;
    if (Number(req.headers['content-length']) > maxBytes) {
      req.resume();
      throw new PayloadTooLargeException('CSV exceeds 20 MiB');
    }
    const errors: { line: number; message: string }[] = [];
    let bytes = 0,
      rows = 0,
      imported = 0,
      rejected = 0;
    let batch: Row[] = [];
    const flush = async () => {
      if (!batch.length) return;
      await this.db.$transaction(
        batch.map(({ category, capacity, priceCents, ...event }) =>
          this.db.event.create({
            data: {
              ...event,
              organizerId,
              categories: { create: { name: category, capacity, priceCents } },
            },
          }),
        ),
        { timeout: 15000 },
      );
      imported += batch.length;
      batch = [];
    };
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > maxBytes
            ? new PayloadTooLargeException('CSV exceeds 20 MiB')
            : null,
          chunk,
        );
      },
    });
    let headerSeen = false;
    const parser = parse({
      bom: true,
      skip_empty_lines: true,
      max_record_size: 65536,
      info: true,
      columns: (header: string[]) => {
        headerSeen = true;
        if (header.join(',') !== columns.join(','))
          throw new Error('CSV columns do not match');
        return header;
      },
    });
    try {
      await pipeline(
        Readable.from(req.iterator({ destroyOnReturn: false })),
        limiter,
        parser,
        async (source: AsyncIterable<unknown>) => {
          for await (const item of source) {
            rows++;
            if (rows > 100000)
              throw new PayloadTooLargeException('CSV exceeds 100000 rows');
            const entry = z
              .object({
                record: z.unknown(),
                info: z.object({ lines: z.number() }),
              })
              .parse(item);
            const row = rowSchema.safeParse(entry.record);
            if (!row.success) {
              rejected++;
              if (errors.length < 1000)
                errors.push({
                  line: entry.info.lines,
                  message: row.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; '),
                });
              continue;
            }
            batch.push(row.data);
            if (batch.length === 200) await flush();
          }
          await flush();
          if (!headerSeen) throw new Error('CSV header required');
        },
        { signal: AbortSignal.timeout(120000) },
      );
    } catch (error) {
      req.resume();
      const response = {
        code: 'CSV_INCOMPLETE',
        message: 'Import interrupted; committed batches remain drafts',
        details: { imported, rejected, errors },
      };
      if (error instanceof PayloadTooLargeException)
        throw new PayloadTooLargeException(response);
      throw new BadRequestException(response);
    }
    return {
      rows,
      imported,
      rejected,
      errors,
      errorsTruncated: rejected > errors.length,
    };
  }
}
@ApiTags('CSV imports')
@Controller('imports')
class ImportsController {
  constructor(private readonly imports: ImportsService) {}
  @Roles('ORGANISATEUR')
  @Post('events')
  @ApiConsumes('text/csv')
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary',
      description: columns.join(','),
    },
  })
  events(@Req() req: Request, @CurrentUser() actor: Actor) {
    return this.imports.events(req, actor.id);
  }
}
@Module({ controllers: [ImportsController], providers: [ImportsService] })
export class ImportsModule {}
