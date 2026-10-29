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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, access } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { CurrentUser, type Actor, Roles } from '../auth/auth.module.js';
import { BodySchema, uuid } from '../common/http.js';
import { Database } from '../database/database.module.js';
import { OrdersModule, OrdersService } from '../orders/orders.module.js';
import { EventsModule, EventsService } from '../events/events.module.js';

export const ticketDirectory = fileURLToPath(
  new URL('../../storage/tickets', import.meta.url),
);

@Injectable()
export class TicketsService {
  constructor(
    private readonly db: Database,
    private readonly orders: OrdersService,
    private readonly events: EventsService,
  ) {}
  async fulfill(orderId: string) {
    const order = await this.orders.fulfillment(orderId);
    await this.db.ticket.createMany({
      data: Array.from({ length: order.hold.quantity }, (_, seatIndex) => ({
        orderId,
        categoryId: order.hold.categoryId,
        seatIndex,
      })),
      skipDuplicates: true,
    });
    const tickets = await this.db.ticket.findMany({ where: { orderId } });
    await mkdir(ticketDirectory, { recursive: true });
    for (const ticket of tickets) {
      const path = join(ticketDirectory, `${ticket.id}.pdf`);
      if (ticket.pdfReady) {
        try {
          await access(path);
          continue;
        } catch {
          /* Regenerate a missing local file. */
        }
      }
      const qr = await QRCode.toBuffer(ticket.code, { width: 260, margin: 2 });
      const doc = new PDFDocument({ size: 'A4', margin: 54 });
      const file = createWriteStream(`${path}.tmp`);
      doc.pipe(file);
      doc.fontSize(28).text('TicketRush');
      doc.moveDown().fontSize(22).text(order.hold.category.event.title);
      doc.moveDown().fontSize(12).text(order.hold.category.event.venue);
      doc.text(order.hold.category.event.startsAt.toISOString());
      doc.text(`${order.hold.category.name} / Ticket ${ticket.seatIndex + 1}`);
      doc.image(qr, { width: 230 });
      doc
        .fontSize(9)
        .text(ticket.code)
        .text('Valid for one admission. Keep this ticket private.');
      doc.end();
      await finished(file);
      await rename(`${path}.tmp`, path);
      await this.db.ticket.update({
        where: { id: ticket.id },
        data: { pdfReady: true },
      });
    }
    await this.db.notification.upsert({
      where: { orderId },
      create: {
        orderId,
        userId: order.userId,
        message: 'Your tickets are ready. Download them from your orders.',
      },
      update: {},
    });
    return { count: tickets.length };
  }
  async owned(id: string, userId: string) {
    const ticket = await this.db.ticket.findFirst({
      where: { id, order: { userId } },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }
  async scan(eventId: string, code: string, userId: string) {
    if (!(await this.events.assignment(eventId, userId)))
      throw new NotFoundException('Event assignment not found');
    const result = await this.db.ticket.updateMany({
      where: {
        code,
        category: { eventId },
        order: { status: 'PAID' },
        scannedAt: null,
      },
      data: { scannedAt: new Date() },
    });
    if (result.count !== 1)
      throw new ConflictException({
        code: 'TICKET_REJECTED',
        message:
          'Ticket is unknown, already scanned or belongs to another event',
      });
    return { accepted: true, scannedAt: new Date() };
  }
}

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller()
class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly db: Database,
  ) {}
  @Get('tickets/:id/pdf')
  async pdf(
    @Param('id', uuid) id: string,
    @CurrentUser() user: Actor,
    @Res() res: Response,
  ) {
    const ticket = await this.tickets.owned(id, user.id);
    if (!ticket.pdfReady)
      throw new ConflictException('Ticket is still being generated');
    res.setHeader('Cache-Control', 'private, no-store');
    res
      .type('application/pdf')
      .download(join(ticketDirectory, `${id}.pdf`), `ticket-${id}.pdf`);
  }
  @Roles('CONTROLEUR')
  @Post('tickets/scan')
  scan(
    @CurrentUser() user: Actor,
    @Body(
      new BodySchema(z.object({ eventId: z.uuid(), code: z.uuid() }).strict()),
    )
    body: { eventId: string; code: string },
  ) {
    return this.tickets.scan(body.eventId, body.code, user.id);
  }
  @Get('notifications') notifications(@CurrentUser() user: Actor) {
    return this.db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  @Roles('CONTROLEUR') @Get('controller/events') assignments(
    @CurrentUser() user: Actor,
  ) {
    return this.db.assignment.findMany({
      where: { userId: user.id },
      include: { event: true },
    });
  }
}
@Module({
  imports: [OrdersModule, EventsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
