import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { environment } from '../config/environment.js';

@Injectable()
export class Database extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: environment().DATABASE_URL,
        max: 12,
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
