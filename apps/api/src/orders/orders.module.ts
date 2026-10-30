import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  createHmac,
  timingSafeEqual,
  createHash,
  randomUUID,
} from 'node:crypto';
import { z } from 'zod';
import { messageContext } from '../common/context.js';
import { CurrentUser, type Actor, Public, Roles } from '../auth/auth.module.js';
import { BodySchema, uuid } from '../common/http.js';
import { Database } from '../database/database.module.js';
import { environment } from '../config/environment.js';
import { ResilientHttp } from '../common/resilient-http.js';
import {
  ReservationsModule,
  ReservationsService,
} from '../reservations/reservations.module.js';

const webhookSchema = z
  .object({
    id: z.uuid(),
    orderId: z.uuid(),
    providerRef: z.string().min(1).max(100),
    amountCents: z.number().int().min(0),
    status: z.enum(['SUCCEEDED', 'FAILED']),
    timestamp: z.number().int(),
  })
  .strict();

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: Database,
    private readonly reservations: ReservationsService,
  ) {}
  async create(userId: string, holdId: string, key: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ':' + key}, 0))::text`;
      const previous = await tx.order.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      if (previous) {
        if (previous.holdId !== holdId)
          throw new ConflictException(
            'Idempotency key has a different payload',
          );
        return previous;
      }
      const hold = await this.reservations.lock(tx, holdId);
      if (hold.userId !== userId)
        throw new NotFoundException('Reservation not found');
      const order = await tx.order.findUnique({ where: { holdId } });
      if (order) return order;
      if (hold.status !== 'ACTIVE' || hold.expiresAt <= new Date())
        throw new ConflictException('Reservation expired');
      return tx.order.create({
        data: {
          userId,
          holdId,
          idempotencyKey: key,
          totalCents: hold.quantity * hold.unitPriceCents,
        },
      });
    });
  }
  async owned(id: string, userId: string) {
    const order = await this.db.order.findFirst({
      where: { id, userId },
      include: {
        hold: { include: { category: { include: { event: true } } } },
        payment: true,
        tickets: { orderBy: { seatIndex: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
  async initiate(id: string, userId: string) {
    const order = await this.owned(id, userId);
    if (
      order.status !== 'PENDING' ||
      order.hold.status !== 'ACTIVE' ||
      order.hold.expiresAt <= new Date()
    )
      throw new ConflictException('Order is not payable');
    return this.db.payment.upsert({
      where: { orderId: id },
      create: {
        orderId: id,
        providerRef: randomUUID(),
        amountCents: order.totalCents,
      },
      update: {},
    });
  }
  async fulfillment(id: string) {
    const order = await this.db.order.findUnique({
      where: { id },
      include: {
        hold: { include: { category: { include: { event: true } } } },
      },
    });
    if (!order || order.status !== 'PAID')
      throw new ConflictException('Order is not paid');
    return order;
  }
  async receive(raw: Buffer, signature: string | undefined) {
    if (!signature || !/^[a-f0-9]{64}$/.test(signature))
      throw new UnauthorizedException('Invalid webhook signature');
    const expected = createHmac('sha256', environment().PAYMENT_SECRET)
      .update(raw)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new UnauthorizedException('Invalid webhook signature');
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw.toString()) as unknown;
    } catch {
      throw new BadRequestException('Invalid webhook');
    }
    const parsed = webhookSchema.safeParse(decoded);
    if (
      !parsed.success ||
      Math.abs(Date.now() - parsed.data.timestamp) > 300000
    )
      throw new BadRequestException('Invalid or stale webhook');
    const body = parsed.data;
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    const ref = await this.db.order.findUnique({ where: { id: body.orderId } });
    if (!ref) throw new NotFoundException('Order not found');
    return this.db.$transaction(
      async (tx) => {
        const hold = await this.reservations.lock(tx, ref.holdId);
        const previous = await tx.webhookReceipt.findUnique({
          where: { id: body.id },
        });
        if (previous) {
          if (previous.payloadHash !== payloadHash)
            throw new ConflictException('Webhook ID was reused');
          return { received: true, duplicate: true };
        }
        const payment = await tx.payment.findUnique({
          where: { orderId: body.orderId },
        });
        const order = await tx.order.findUniqueOrThrow({
          where: { id: body.orderId },
        });
        if (
          !payment ||
          payment.providerRef !== body.providerRef ||
          payment.amountCents !== body.amountCents ||
          order.totalCents !== body.amountCents
        )
          throw new BadRequestException('Payment does not match order');
        await tx.webhookReceipt.create({ data: { id: body.id, payloadHash } });
        if (order.status === 'PAID' || payment.status === 'REFUNDED')
          return { received: true };
        if (body.status === 'FAILED') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED' },
          });
          await tx.hold.update({
            where: { id: hold.id },
            data: { status: 'EXPIRED' },
          });
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'EXPIRED' },
          });
          return { received: true };
        }
        if (hold.status !== 'ACTIVE' || hold.expiresAt <= new Date()) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'REFUNDED' },
          });
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'EXPIRED' },
          });
          return { received: true, refunded: true };
        }
        await this.reservations.paid(tx, hold.id);
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'SUCCEEDED' },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID' },
        });
        await tx.outbox.create({
          data: {
            aggregateId: order.id,
            type: 'ORDER_PAID',
            payload: { orderId: order.id, ...messageContext() },
          },
        });
        return { received: true };
      },
      { maxWait: 15000, timeout: 15000 },
    );
  }
}

@ApiTags('Orders and payments')
@ApiBearerAuth()
@Controller()
class OrdersController {
  private readonly provider = new ResilientHttp();
  constructor(
    private readonly orders: OrdersService,
    private readonly db: Database,
  ) {}
  @Roles('CLIENT')
  @Post('orders')
  create(
    @CurrentUser() user: Actor,
    @Body(new BodySchema(z.object({ holdId: z.uuid() }).strict()))
    body: { holdId: string },
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const parsed = z
      .string()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .safeParse(key);
    if (!parsed.success)
      throw new BadRequestException(
        'A valid Idempotency-Key header is required',
      );
    return this.orders.create(user.id, body.holdId, parsed.data);
  }
  @Get('orders') list(@CurrentUser() user: Actor) {
    return this.db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        hold: { include: { category: { include: { event: true } } } },
        tickets: true,
        payment: true,
      },
    });
  }
  @Get('orders/:id') detail(
    @CurrentUser() user: Actor,
    @Param('id', uuid) id: string,
  ) {
    return this.orders.owned(id, user.id);
  }
  @Roles('CLIENT') @Post('orders/:id/payment') initiate(
    @CurrentUser() user: Actor,
    @Param('id', uuid) id: string,
  ) {
    return this.orders.initiate(id, user.id);
  }
  @Public() @Post('payments/webhook') webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payment-signature') signature: string | undefined,
  ) {
    if (!req.rawBody) throw new BadRequestException('Raw body is required');
    return this.orders.receive(req.rawBody, signature);
  }
  @Roles('CLIENT')
  @Post('orders/:id/simulate-payment')
  async simulate(
    @CurrentUser() user: Actor,
    @Param('id', uuid) id: string,
    @Body(
      new BodySchema(
        z.object({ status: z.enum(['SUCCEEDED', 'FAILED']) }).strict(),
      ),
    )
    body: { status: 'SUCCEEDED' | 'FAILED' },
  ) {
    const payment = await this.orders.initiate(id, user.id);
    const response = await this.provider.request(
      `${environment().PAYMENT_PROVIDER_URL}/simulate`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-provider-key': environment().PAYMENT_SECRET,
          'x-correlation-id': messageContext().correlationId,
        },
        body: JSON.stringify({
          orderId: id,
          providerRef: payment.providerRef,
          amountCents: payment.amountCents,
          status: body.status,
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new ConflictException(
        'Payment provider is unavailable; check the order before retrying',
      );
    return this.orders.owned(id, user.id);
  }
}
@Module({
  imports: [ReservationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
