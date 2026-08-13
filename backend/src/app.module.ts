import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module'
import { ConfigModule } from '@nestjs/config';
import { TRPCModule } from 'nestjs-trpc';

import { AppContext } from './trpc/context';
import {
  AuthMiddleware,
  StaffMiddleware,
  SupervisorMiddleware,
  AdminMiddleware,
} from './trpc/auth.middleware';

import { AuthRouter } from './auth/auth.router';
import { AuthService } from './auth/auth.service';
import { SessionService } from './auth/session';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TRPCModule.forRoot({
      // Builds ctx.user per request — see trpc/context.ts
      context: AppContext,

      // Must match VITE_API_URL + '/trpc' on the frontend once it's wired up
      basePath: '/trpc',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // session signing/verification - injected into AppContext and AuthRouter
    SessionService,

    // context + middleware
    AppContext,
    AuthMiddleware,
    StaffMiddleware,
    SupervisorMiddleware,
    AdminMiddleware,

    // router + service, one pair per domain
    AuthRouter,
    AuthService,
  ],
})
export class AppModule {}