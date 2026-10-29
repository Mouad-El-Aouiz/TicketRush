import {
  Body,
  CanActivate,
  Controller,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Get,
  Global,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  SetMetadata,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from 'argon2';
import { z } from 'zod';
import { Database } from '../database/database.module.js';
import { environment } from '../config/environment.js';
import { BodySchema } from '../common/http.js';

export type Actor = {
  id: string;
  email: string;
  role: string;
  sessionId: string;
};
type AuthRequest = Request & { actor?: Actor };
const credentials = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor =>
    context.switchToHttp().getRequest<AuthRequest>().actor!,
);

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}

  async register(input: z.infer<typeof credentials>) {
    const passwordHash = await hash(input.password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    try {
      const user = await this.db.user.create({
        data: { email: input.email, passwordHash },
        select: { id: true },
      });
      return this.issue(user.id);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002')
        throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  async login(input: z.infer<typeof credentials>) {
    const user = await this.db.user.findUnique({
      where: { email: input.email },
    });
    if (!user || !(await verify(user.passwordHash, input.password)))
      throw new UnauthorizedException('Invalid credentials');
    return this.issue(user.id);
  }

  async issue(userId: string) {
    const token = randomBytes(48).toString('base64url');
    const session = await this.db.session.create({
      data: {
        userId,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      sid: session.id,
    });
    return { accessToken, refreshToken: token };
  }

  async refresh(token: string) {
    const freshToken = randomBytes(48).toString('base64url');
    const session = await this.db.$transaction(async (tx) => {
      const old = await tx.session.findUnique({
        where: { tokenHash: tokenHash(token) },
      });
      if (!old) throw new UnauthorizedException('Invalid session');
      const result = await tx.session.updateMany({
        where: { id: old.id, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { revokedAt: new Date() },
      });
      if (result.count !== 1)
        throw new UnauthorizedException('Invalid session');
      return tx.session.create({
        data: {
          userId: old.userId,
          tokenHash: tokenHash(freshToken),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
    });
    return {
      accessToken: await this.jwt.signAsync({
        sub: session.userId,
        sid: session.id,
      }),
      refreshToken: freshToken,
    };
  }

  async logout(token: string) {
    await this.db.session.updateMany({
      where: { tokenHash: tokenHash(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

@Injectable()
class Authentication implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: Database,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Authentication required');
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; sid: string }>(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    if (
      !z.uuid().safeParse(payload.sid).success ||
      !z.uuid().safeParse(payload.sub).success
    )
      throw new UnauthorizedException('Invalid access token');
    const session = await this.db.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Session expired');
    req.actor = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    };
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(session.user.role))
      throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}

function cookie(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: environment().NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 7 * 86400000,
  });
  return { accessToken: tokens.accessToken, expiresIn: 900 };
}
function refreshCookie(req: Request) {
  if (req.headers.origin && req.headers.origin !== environment().WEB_ORIGIN)
    throw new ForbiddenException('Origin is not allowed');
  const cookies: unknown = req.cookies;
  const parsed = z
    .object({ refreshToken: z.string().min(32).max(128) })
    .safeParse(cookies);
  if (!parsed.success)
    throw new UnauthorizedException('Session cookie required');
  return parsed.data.refreshToken;
}

@ApiTags('Authentication')
@ApiBearerAuth()
@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('register')
  async register(
    @Body(new BodySchema(credentials)) body: z.infer<typeof credentials>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return cookie(res, await this.auth.register(body));
  }
  @Public()
  @Post('login')
  async login(
    @Body(new BodySchema(credentials)) body: z.infer<typeof credentials>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return cookie(res, await this.auth.login(body));
  }
  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return cookie(res, await this.auth.refresh(refreshCookie(req)));
  }
  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(refreshCookie(req));
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return { success: true };
  }
  @Get('me') me(@CurrentUser() actor: Actor) {
    return { id: actor.id, email: actor.email, role: actor.role };
  }
}

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: environment().JWT_SECRET,
        signOptions: {
          expiresIn: '15m',
          issuer: 'ticketrush',
          audience: 'ticketrush-api',
        },
        verifyOptions: {
          issuer: 'ticketrush',
          audience: 'ticketrush-api',
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: Authentication }],
  exports: [AuthService],
})
export class AuthModule {}
