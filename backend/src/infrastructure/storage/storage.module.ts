import { Global, Module } from '@nestjs/common';
import { S3StorageService, STORAGE_SERVICE } from './storage.service';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: S3StorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
