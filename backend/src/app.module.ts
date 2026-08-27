import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module'
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TRPCModule } from 'nestjs-trpc';

import { AppContext } from './trpc/context';
import { TrpcErrorLogger } from './trpc/error-handler';
import {
  AuthMiddleware,
  StaffMiddleware,
  SupervisorMiddleware,
  AdminMiddleware,
} from './trpc/auth.middleware';

import { AuthRouter } from './auth/auth.router';
import { AuthService } from './auth/auth.service';
import { PasswordService } from './auth/password.service';
import { SessionService, SESSION_TTL_SECONDS } from './auth/session.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,

    /**
     * Session signing key. Read through ConfigService and asserted at
     * startup: a missing JWT_SECRET must crash the boot, because falling
     * back to a default would sign every session with a key an attacker
     * could read off GitHub.
     */
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not set — add it to backend/.env (see .env.example).');
        }
        return {
          secret,
          signOptions: { expiresIn: SESSION_TTL_SECONDS },
        };
      },
    }),

    TRPCModule.forRoot({
      // Builds ctx.user per request — see trpc/context.ts
      context: AppContext,

      /**
       * Without this, a procedure that throws logs NOTHING server-side —
       * tRPC serialises the error to the client and moves on. Keep it wired.
       */
      onError: TrpcErrorLogger,

      // Must match the frontend's tRPC URL (VITE_TRPC_URL, default /trpc)
      basePath: '/trpc',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // context + middleware
    AppContext,
    TrpcErrorLogger,
    AuthMiddleware,
    StaffMiddleware,
    SupervisorMiddleware,
    AdminMiddleware,

    // auth primitives — shared by the router and the tRPC context
    PasswordService,
    SessionService,

    // router + service, one pair per domain
    AuthRouter,
    AuthService,
  ],
})
export class AppModule {}
