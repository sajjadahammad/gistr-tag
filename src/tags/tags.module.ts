import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TagsController } from './tags.controller';
import { TagsService } from './services/tags.service';
import { TagNormalizationService } from './services/tag-normalization.service';
import { SimilarityDetectionService } from './services/similarity-detection.service';
import { Tag, TagSchema } from '../schemas/tag.schema';
import { TagAttachment, TagAttachmentSchema } from '../schemas/tag-attachment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tag.name, schema: TagSchema },
      { name: TagAttachment.name, schema: TagAttachmentSchema },
    ]),
  ],
  controllers: [TagsController],
  providers: [TagsService, TagNormalizationService, SimilarityDetectionService],
  exports: [TagsService, TagNormalizationService],
})
export class TagsModule {}
