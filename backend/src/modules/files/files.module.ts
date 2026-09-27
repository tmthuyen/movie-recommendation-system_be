import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { StorageModule } from '@/infrastructure/storage/storage.module';

@Module({
  controllers: [FilesController],
  imports: [StorageModule],
})
export class FilesModule {}
