import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
      // node-postgres defaults to 10 connections; under 200 concurrent users
      // (NFR-PRF-03) requests then queue for a connection until transactions
      // time out. Postgres allows 100, so 20 leaves room for the backup job.
      max: Number(process.env.DB_POOL_MAX ?? 20),
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
