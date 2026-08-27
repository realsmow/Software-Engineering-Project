import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });

    super({
      adapter,
      /**
       * Warnings and errors always; every SQL statement only when
       * LOG_SQL=true in .env. Query logging is invaluable when a procedure
       * returns the wrong rows, but far too noisy to leave on by default.
       */
      log:
        process.env.LOG_SQL === 'true'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    /**
     * The driver adapter connects lazily, so without this an unreachable
     * database wouldn't surface until the first query — i.e. as a confusing
     * error inside a procedure rather than at startup.
     */
    try {
      await this.$connect();
      this.logger.log('Connected to the database');
    } catch (error) {
      this.logger.error(
        `Could not connect to the database — check DATABASE_URL and that Postgres is running. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }
}