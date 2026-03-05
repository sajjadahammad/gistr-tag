import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { Source, SourceSchema } from '../schemas/source.schema';
import { Snippet, SnippetSchema } from '../schemas/snippet.schema';
import { AIResponse, AIResponseSchema } from '../schemas/airesponse.schema';
import { Tag, TagSchema } from '../schemas/tag.schema';
import { TagAttachment, TagAttachmentSchema } from '../schemas/tag-attachment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Source.name, schema: SourceSchema },
      { name: Snippet.name, schema: SnippetSchema },
      { name: AIResponse.name, schema: AIResponseSchema },
      { name: Tag.name, schema: TagSchema },
      { name: TagAttachment.name, schema: TagAttachmentSchema },
    ]),
  ],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
