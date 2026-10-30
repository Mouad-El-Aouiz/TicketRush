import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser, type Actor, Roles } from '../auth/auth.module.js';
import { BodySchema, pageSchema, uuid } from '../common/http.js';
import { Database } from '../database/database.module.js';
import { Runtime } from '../runtime/runtime.module.js';

@ApiTags('Administration')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
class AdminController {
  constructor(
    private readonly db: Database,
    private readonly runtime: Runtime,
  ) {}
  @Get('users') users(
    @Query(new BodySchema(pageSchema)) q: z.infer<typeof pageSchema>,
  ) {
    return this.db.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      skip: (q.page - 1) * q.limit,
    });
  }
  @Post('users/:id/role')
  async role(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: Actor,
    @Body(
      new BodySchema(
        z
          .object({ role: z.enum(['CLIENT', 'ORGANISATEUR', 'CONTROLEUR']) })
          .strict(),
      ),
    )
    body: { role: string },
  ) {
    if (actor.id === id)
      throw new BadRequestException('Self role changes are forbidden');
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { role: body.role },
        select: { id: true, email: true, role: true },
      });
      await tx.session.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });
      await tx.audit.create({
        data: {
          actorId: actor.id,
          action: 'ROLE_CHANGED',
          targetId: id,
          reason: body.role,
        },
      });
      return user;
    });
  }
  @Post('events/:id/withdraw')
  async withdraw(
    @Param('id', uuid) id: string,
    @CurrentUser() actor: Actor,
    @Body(
      new BodySchema(
        z.object({ reason: z.string().trim().min(5).max(500) }).strict(),
      ),
    )
    body: { reason: string },
  ) {
    const withdrawn = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${id}::uuid FOR UPDATE`;
      const event = await tx.event.update({
        where: { id },
        data: { status: 'WITHDRAWN' },
      });
      await tx.audit.create({
        data: {
          actorId: actor.id,
          action: 'EVENT_WITHDRAWN',
          targetId: id,
          reason: body.reason,
        },
      });
      return event;
    });
    await this.runtime.invalidate();
    return withdrawn;
  }
}
@Module({ controllers: [AdminController] })
export class AdminModule {}
