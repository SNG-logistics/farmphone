import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [ContentController],
  providers: [ContentService, StorageService],
  exports: [ContentService, StorageService],
})
export class ContentModule {}
