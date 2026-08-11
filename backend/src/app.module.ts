import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { PrismaModule } from './prisma.module'
import { ConfigModule } from '@nestjs/config';
import { TRPCModule } from 'nestjs-trpc';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    TRPCModule.forRoot(),
  ],
})
export class AppModule {}