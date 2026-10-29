import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type Actor, Public, Roles } from '../auth/auth.module.js';
import { BodySchema, pageSchema, uuid } from '../common/http.js';
import { Database } from '../database/database.module.js';
import type { Prisma } from '../generated/prisma/client.js';

const eventSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().min(10).max(10000),
    venue: z.string().trim().min(2).max(200),
    startsAt: z.iso
      .datetime()
      .transform((s) => new Date(s))
      .refine((d) => d > new Date(), 'Event must be in the future'),
  })
  .strict();
const categorySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    priceCents: z.number().int().min(0).max(10000000),
    capacity: z.number().int().min(1).max(100000),
  })
  .strict();

@Injectable()
export class EventsService {
  constructor(private readonly db: Database) {}
  async owned(eventId: string, organizerId: string) {
    const event = await this.db.event.findFirst({
      where: { id: eventId, organizerId },
      include: { categories: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }
  async list(query: z.infer<typeof pageSchema>, owner?: string) {
    const where: Prisma.EventWhereInput = {
      ...(owner
        ? { organizerId: owner }
        : { status: 'PUBLISHED', startsAt: { gt: new Date() } }),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { venue: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.db.event.findMany({
        where,
        include: { categories: true },
        orderBy: [{ [query.sort]: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.event.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }
  async detail(id: string) {
    const event = await this.db.event.findFirst({
      where: { id, status: 'PUBLISHED' },
      include: { categories: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }
  async lockCategory(tx: Prisma.TransactionClient, categoryId: string) {
    const ref = await tx.category.findUnique({
      where: { id: categoryId },
      select: { eventId: true },
    });
    if (!ref) throw new NotFoundException('Category not found');
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${ref.eventId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM categories WHERE id = ${categoryId}::uuid FOR UPDATE`;
    const category = await tx.category.findUnique({
      where: { id: categoryId },
      include: { event: true },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
  async assignment(eventId: string, userId: string) {
    return this.db.assignment.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }
}

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
class EventsController {
  constructor(
    private readonly db: Database,
    private readonly events: EventsService,
  ) {}
  @Public() @Get() list(
    @Query(new BodySchema(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.events.list(query);
  }
  @Roles('ORGANISATEUR') @Get('mine') mine(
    @CurrentUser() actor: Actor,
    @Query(new BodySchema(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.events.list(query, actor.id);
  }
  @Public() @Get(':id') detail(@Param('id', uuid) id: string) {
    return this.events.detail(id);
  }
  @Roles('ORGANISATEUR')
  @Post()
  create(
    @CurrentUser() actor: Actor,
    @Body(new BodySchema(eventSchema)) body: z.infer<typeof eventSchema>,
  ) {
    return this.db.event.create({ data: { ...body, organizerId: actor.id } });
  }
  @Roles('ORGANISATEUR')
  @Patch(':id')
  async update(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: Actor,
    @Body(new BodySchema(eventSchema.partial().strict()))
    body: Partial<z.infer<typeof eventSchema>>,
  ) {
    const event = await this.events.owned(id, actor.id);
    if (event.status !== 'DRAFT')
      throw new BadRequestException('Published events cannot be edited');
    return this.db.event.update({ where: { id }, data: body });
  }
  @Roles('ORGANISATEUR')
  @Post(':id/categories')
  async category(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: Actor,
    @Body(new BodySchema(categorySchema)) body: z.infer<typeof categorySchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${id}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({
        where: { id, organizerId: actor.id, status: 'DRAFT' },
      });
      if (!event) throw new NotFoundException('Draft event not found');
      return tx.category.create({ data: { ...body, eventId: id } });
    });
  }
  @Roles('ORGANISATEUR')
  @Post(':id/publish')
  async publish(@Param('id', uuid) id: string, @CurrentUser() actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${id}::uuid FOR UPDATE`;
      const event = await tx.event.findFirst({
        where: { id, organizerId: actor.id },
        include: { categories: true },
      });
      if (!event) throw new NotFoundException('Event not found');
      if (
        event.status !== 'DRAFT' ||
        event.categories.length === 0 ||
        event.startsAt <= new Date()
      )
        throw new BadRequestException('Event is not publishable');
      return tx.event.update({ where: { id }, data: { status: 'PUBLISHED' } });
    });
  }
  @Roles('ORGANISATEUR')
  @Post(':id/controllers')
  async assign(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: Actor,
    @Body(new BodySchema(z.object({ userId: z.uuid() }).strict()))
    body: { userId: string },
  ) {
    await this.events.owned(id, actor.id);
    const user = await this.db.user.findFirst({
      where: { id: body.userId, role: 'CONTROLEUR' },
    });
    if (!user) throw new BadRequestException('User must be a controller');
    return this.db.assignment.upsert({
      where: { eventId_userId: { eventId: id, userId: body.userId } },
      create: { eventId: id, userId: body.userId },
      update: {},
    });
  }
}

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
