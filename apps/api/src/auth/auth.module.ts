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
  Query,
  Req,
  Res,
  SetMetadata,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import * as oidc from 'openid-client';
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
    if (
      !user?.passwordHash ||
      !(await verify(user.passwordHash, input.password))
    )
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

export function sessionCookie(
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

const googleStateSchema = z.object({
  state: z.string().min(32),
  nonce: z.string().min(32),
  verifier: z.string().min(43),
  expiresAt: z.number().int().positive(),
});
type GoogleState = z.infer<typeof googleStateSchema>;

export function signGoogleState(state: GoogleState, secret: string) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyGoogleState(value: unknown, secret: string): GoogleState {
  if (typeof value !== 'string' || value.length > 2048)
    throw new UnauthorizedException('Google sign-in state is missing');
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra)
    throw new UnauthorizedException('Google sign-in state is invalid');
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch {
    throw new UnauthorizedException('Google sign-in state is invalid');
  }
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    throw new UnauthorizedException('Google sign-in state is invalid');
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new UnauthorizedException('Google sign-in state is invalid');
  }
  const state = googleStateSchema.safeParse(parsed);
  if (!state.success || state.data.expiresAt <= Date.now())
    throw new UnauthorizedException('Google sign-in state has expired');
  return state.data;
}

@Injectable()
class GoogleOidcService {
  private configuration?: ReturnType<typeof oidc.discovery>;

  constructor(
    private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  isEnabled() {
    const env = environment();
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  private getConfiguration() {
    const env = environment();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      throw new ServiceUnavailableException('Google sign-in is not configured');
    this.configuration ??= oidc.discovery(
      new URL('https://accounts.google.com'),
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    return this.configuration;
  }

  async begin() {
    const env = environment();
    const configuration = await this.getConfiguration();
    const verifier = oidc.randomPKCECodeVerifier();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const redirectUri =
      env.GOOGLE_REDIRECT_URI ?? `${env.WEB_ORIGIN}/api/auth/google/callback`;
    const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: redirectUri,
      scope: 'openid email',
      response_type: 'code',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return {
      authorizationUrl,
      stateCookie: signGoogleState(
        { state, nonce, verifier, expiresAt: Date.now() + 10 * 60 * 1000 },
        env.JWT_SECRET,
      ),
    };
  }

  async complete(callbackUrl: URL, rawState: unknown) {
    const env = environment();
    const state = verifyGoogleState(rawState, env.JWT_SECRET);
    const configuration = await this.getConfiguration();
    const tokens = await oidc.authorizationCodeGrant(
      configuration,
      callbackUrl,
      {
        pkceCodeVerifier: state.verifier,
        expectedState: state.state,
        expectedNonce: state.nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    const identity = z
      .object({
        sub: z.string().min(1),
        email: z.email().max(254),
        email_verified: z.literal(true),
      })
      .safeParse(claims);
    if (!identity.success)
      throw new UnauthorizedException('Google account email is not verified');

    let user = await this.db.user.findUnique({
      where: { googleSubject: identity.data.sub },
      select: { id: true },
    });
    if (!user) {
      const email = identity.data.email.toLowerCase();
      if (
        await this.db.user.findUnique({
          where: { email },
          select: { id: true },
        })
      )
        throw new ConflictException(
          'This email already has a password account. Sign in with that account first.',
        );
      try {
        user = await this.db.user.create({
          data: { email, googleSubject: identity.data.sub },
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          user = await this.db.user.findUnique({
            where: { googleSubject: identity.data.sub },
            select: { id: true },
          });
        }
        if (!user) throw error;
      }
    }
    return this.auth.issue(user.id);
  }
}

@ApiTags('Authentication')
@Controller('auth/google')
class GoogleAuthController {
  constructor(private readonly google: GoogleOidcService) {}

  @Public()
  @Get('status')
  status() {
    return { enabled: this.google.isEnabled() };
  }

  @Public()
  @Get()
  async begin(@Res() res: Response) {
    const env = environment();
    const result = await this.google.begin();
    res.cookie('googleOAuthState', result.stateCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/api/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(302, result.authorizationUrl.href);
  }

  @Public()
  @Get('callback')
  async callback(
    @Req() req: Request,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const env = environment();
    res.clearCookie('googleOAuthState', { path: '/api/auth/google' });
    try {
      if (error || !code)
        throw new UnauthorizedException('Google sign-in failed');
      const redirectUri =
        env.GOOGLE_REDIRECT_URI ?? `${env.WEB_ORIGIN}/api/auth/google/callback`;
      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = new URL(
        req.originalUrl,
        'http://ticketrush.local',
      ).search;
      const tokens = await this.google.complete(
        callbackUrl,
        req.cookies?.googleOAuthState,
      );
      sessionCookie(res, tokens);
      return res.redirect(302, env.WEB_ORIGIN);
    } catch {
      return res.redirect(302, `${env.WEB_ORIGIN}/?authError=google`);
    }
  }
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
    return sessionCookie(res, await this.auth.register(body));
  }
  @Public()
  @Post('login')
  async login(
    @Body(new BodySchema(credentials)) body: z.infer<typeof credentials>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sessionCookie(res, await this.auth.login(body));
  }
  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return sessionCookie(res, await this.auth.refresh(refreshCookie(req)));
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
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService,
    GoogleOidcService,
    { provide: APP_GUARD, useClass: Authentication },
  ],
  exports: [AuthService],
})
export class AuthModule {}
