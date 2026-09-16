import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import express from 'express';
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
import { AuditService } from './common/audit/audit.service';
import { StaffScopeService } from './common/authority/staff-scope.service';
import { PenaltyService } from './common/penalty/penalty.service';

import { AuthRouter } from './auth/auth.router';
import { AuthService } from './auth/auth.service';
import { SessionService } from './auth/session.service';
import { LoginThrottleService } from './auth/login-throttle.service';

import { AdminRouter } from './admin/admin.router';
import { AdminService } from './admin/admin.service';

import { ItemRouter } from './item/item.router';
import { ItemService } from './item/item.service';
import { ItemManagementService } from './item/item.management.service';

import { CreditRouter } from './credit/credit.router';
import { CreditService } from './credit/credit.service';

import { LoanRouter } from './loan/loan.router';
import { LoanService } from './loan/loan.service';

import { InspectionRouter } from './inspection/inspection.router';
import { InspectionService } from './inspection/inspection.service';

import { ImageRouter } from './image/image.router';
import { ImageService } from './image/image.service';
import { ImageController } from './image/image.controller';
import {
  MAX_UPLOAD_BYTES,
  uploadContentType,
} from './common/schemas/image.schema';

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
  // ImageController is the one REST route: tRPC cannot carry file bytes (CONTRACT.md §3)
  controllers: [AppController, ImageController],
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
    AuditService,
    StaffScopeService,
    PenaltyService,
    ImageService,

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
    ItemManagementService,

    CreditRouter,
    CreditService,

    LoanRouter,
    LoanService,

    InspectionRouter,
    InspectionService,

    ImageRouter,
  ],
})
export class AppModule implements NestModule {
  /**
   * Raw body for the upload route, and nowhere else (CONTRACT.md §3).
   *
   * It lives here rather than in `main.ts` so it travels with the controller it
   * exists for — a body parser configured in bootstrap is invisible to every
   * test, which is exactly how an upload route ends up passing its unit tests
   * and receiving `{}` in production.
   *
   * Scoped twice over: to this one path, and to the two image types. A global
   * raw parser would swallow the JSON every tRPC call needs, and an
   * unrestricted `type` would buffer whatever anyone sent.
   *
   * A Content-Type outside the list leaves `req.body` an empty object rather
   * than a Buffer, and ImageController treats that as the rejection.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        express.raw({
          type: [...uploadContentType.options],
          limit: MAX_UPLOAD_BYTES,
        }),
      )
      .forRoutes({ path: 'uploads/*path', method: RequestMethod.PUT });
  }
}
