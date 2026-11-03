import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { AdminModule } from './admin/admin.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { RuntimeModule } from './runtime/runtime.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';

@Module({
  imports: [
    NotificationsModule,
    ImportsModule,
    RuntimeModule,
    OperationsModule,
    DatabaseModule,
    AuthModule,
    EventsModule,
    AdminModule,
    OrdersModule,
    TicketsModule,
    DeliveryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
