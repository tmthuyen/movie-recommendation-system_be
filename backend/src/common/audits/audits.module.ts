import { AuditFieldsSubscriber } from './audits-field.subscriber';
import { Module } from '@nestjs/common';

@Module({
  providers: [AuditFieldsSubscriber],
})
export class AuditsModule {}
