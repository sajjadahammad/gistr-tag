import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchController } from './search.controller';
import { SearchService } from './services/search.service';
import { TagExpansionService } from './services/tag-expansion.service';
import { EntityHydrationService } from './services/entity-hydration.service';
import { PaginationService } from './services/pagination.service';
import { Tag, TagSchema } from '../schemas/tag.schema';
import { TagAttachment, TagAttachmentSchema } from '../schemas/tag-attachment.schema';
import { Source, SourceSchema } from '../schemas/source.schema';
import { Snippet, SnippetSchema } from '../schemas/snippet.schema';
import { AIResponse, AIResponseSchema } from '../schemas/airesponse.schema';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Tag.name, schema: TagSchema },
      { name: TagAttachment.name, schema: TagAttachmentSchema },
      { name: Source.name, schema: SourceSchema },
      { name: Snippet.name, schema: SnippetSchema },
      { name: AIResponse.name, schema: AIResponseSchema },
    ]),
    TagsModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    TagExpansionService,
    EntityHydrationService,
    PaginationService,
  ],
})
export class SearchModule {}
