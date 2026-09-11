import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { ClsService } from 'nestjs-cls';

@Injectable()
@EventSubscriber()
export class AuditFieldsSubscriber
  implements EntitySubscriberInterface, OnModuleInit
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  onModuleInit() {
    // Manually register subscriber to preserve NestJS Dependency Injection scope
    this.dataSource.subscribers.push(this);
  }

  // Intercepts entity right before it is inserted into the database
  beforeInsert(event: InsertEvent<any>) {
    const userId = this.cls.get('userId');
    if (userId && 'createdBy' in event.entity) {
      event.entity.createdBy = userId;
      event.entity.updatedBy = userId;
    }
  }

  // Intercepts entity right before it is updated in the database
  beforeUpdate(event: UpdateEvent<any>) {
    const userId = this.cls.get('userId');
    if (userId && event.entity && 'updatedBy' in event.entity) {
      event.entity.updatedBy = userId;
    }
  }
}
