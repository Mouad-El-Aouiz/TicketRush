import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type Actor, Public, Roles } from '../auth/auth.module.js';
import { BodySchema, uuid } from '../common/http.js';
import { Database } from '../database/database.module.js';
import { EventsModule, EventsService } from '../events/events.module.js';
import type { Prisma } from '../generated/prisma/client.js';
import { Runtime } from '../runtime/runtime.module.js';

const holdSchema = z
  .object({ categoryId: z.uuid(), quantity: z.number().int().min(1).max(20) })
  .strict();

@Injectable()
export class ReservationsService {
  constructor(
    private readonly db: Database,
    private readonly events: EventsService,
  ) {}
  async stock(tx: Prisma.TransactionClient, categoryId: string) {
    const result = await tx.hold.aggregate({
      where: {
        categoryId,
        OR: [
          { status: 'PAID' },
          { status: 'ACTIVE', expiresAt: { gt: new Date() } },
        ],
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }
  async reserve(userId: string, body: z.infer<typeof holdSchema>) {
    return this.db.$transaction(
      async (tx) => {
        const category = await this.events.lockCategory(tx, body.categoryId);
        if (
          category.event.status !== 'PUBLISHED' ||
          category.event.startsAt <= new Date()
        )
          throw new ConflictException('Sale is not open');
        if (
          category.capacity - (await this.stock(tx, category.id)) <
          body.quantity
        )
          throw new ConflictException({
            code: 'SOLD_OUT',
            message: 'Not enough available tickets',
          });
        return tx.hold.create({
          data: {
            userId,
            categoryId: category.id,
            quantity: body.quantity,
            unitPriceCents: category.priceCents,
            expiresAt: new Date(Date.now() + 600000),
          },
        });
      },
      { maxWait: 30000, timeout: 30000 },
    );
  }
  async lock(tx: Prisma.TransactionClient, id: string) {
    const reference = await tx.hold.findUnique({ where: { id } });
    if (!reference) throw new NotFoundException('Reservation not found');
    await this.events.lockCategory(tx, reference.categoryId);
    await tx.$queryRaw`SELECT id FROM holds WHERE id = ${id}::uuid FOR UPDATE`;
    return await tx.hold.findUniqueOrThrow({ where: { id } });
  }
  async paid(tx: Prisma.TransactionClient, id: string) {
    return tx.hold.update({ where: { id }, data: { status: 'PAID' } });
  }
  async expire() {
    // Payment transitions lock the hold and recheck expiry; updateMany uses row locks.
    const result = await this.db.hold.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }
  async availability(categoryId: string) {
    const category = await this.db.category.findUnique({
      where: { id: categoryId },
      include: { event: true },
    });
    if (!category || category.event.status !== 'PUBLISHED')
      throw new NotFoundException('Category not found');
    return this.db.$transaction(async (tx) => ({
      categoryId,
      capacity: category.capacity,
      available: Math.max(
        0,
        category.capacity - (await this.stock(tx, categoryId)),
      ),
    }));
  }
}

@ApiTags('Reservations')
@ApiBearerAuth()
@Controller('reservations')
class ReservationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly db: Database,
    private readonly runtime: Runtime,
  ) {}
  @Roles('CLIENT')
  @Post()
  create(
    @CurrentUser() user: Actor,
    @Body(new BodySchema(holdSchema)) body: z.infer<typeof holdSchema>,
  ) {
    return this.reserveProtected(user, body);
  }
  private async reserveProtected(
    user: Actor,
    body: z.infer<typeof holdSchema>,
  ) {
    await this.runtime.limit(`reserve:${user.id}`, 60);
    return this.reservations.reserve(user.id, body);
  }
  @Get() list(@CurrentUser() user: Actor) {
    return this.db.hold.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  @Get(':id') async detail(
    @CurrentUser() user: Actor,
    @Param('id', uuid) id: string,
  ) {
    const hold = await this.db.hold.findFirst({
      where: { id, userId: user.id },
    });
    if (!hold) throw new NotFoundException('Reservation not found');
    return {
      ...hold,
      status:
        hold.status === 'ACTIVE' && hold.expiresAt <= new Date()
          ? 'EXPIRED'
          : hold.status,
    };
  }
  @Public() @Get('availability/:id') availability(
    @Param('id', uuid) id: string,
  ) {
    return this.reservations.availability(id);
  }
}
@Module({
  imports: [EventsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
