import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { ConfigModule } from '@nestjs/config';
import { TRPCModule } from 'nestjs-trpc';

import { AppContext } from './trpc/context';
import { formatTrpcError } from './trpc/error-formatter';
import { TrpcErrorLogger } from './trpc/error-handler';
import {
  AuthMiddleware,
  StaffMiddleware,
  SupervisorMiddleware,
  AdminMiddleware,
} from './trpc/auth.middleware';

import { CreditTierService } from './common/credit/credit-tier.service';

import { AuthRouter } from './auth/auth.router';
import { AuthService } from './auth/auth.service';
import { SessionService } from './auth/session.service';
import { LoginThrottleService } from './auth/login-throttle.service';

import { AdminRouter } from './admin/admin.router';
import { AdminService } from './admin/admin.service';

import { ItemRouter } from './item/item.router';
import { ItemService } from './item/item.service';

import { CreditRouter } from './credit/credit.router';
import { CreditService } from './credit/credit.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TRPCModule.forRoot({
      // Builds ctx.user per request - see trpc/context.ts
      context: AppContext,

      // Must match VITE_API_URL + '/trpc' on the frontend once it's wired up
      basePath: '/trpc',

      // Without this, BusinessError's `cause` never reaches the client and
      // stack traces ship to production. See trpc/error-formatter.ts.
      errorFormatter: formatTrpcError,

      // errorFormatter shapes what the client receives; this logs the same
      // error server-side. Without it a crash inside a procedure never
      // reaches the console. Adapted from feat/trpc-auth-connect.
      onError: TrpcErrorLogger,
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // context + middleware
    AppContext,
    AuthMiddleware,
    StaffMiddleware,
    SupervisorMiddleware,
    AdminMiddleware,

    // shared business rules, used by more than one domain
    CreditTierService,

    // session - issued by auth, read by AppContext on every request
    SessionService,
    LoginThrottleService,
    TrpcErrorLogger,

    // router + service, one pair per domain
    AuthRouter,
    AuthService,

    AdminRouter,
    AdminService,

    ItemRouter,
    ItemService,

    CreditRouter,
    CreditService,
  ],
})
export class AppModule {}
