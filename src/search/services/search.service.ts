import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TagAttachment } from '../../schemas/tag-attachment.schema';
import { SearchDto } from '../dto/search.dto';
import { TagExpansionService } from './tag-expansion.service';
import { EntityHydrationService } from './entity-hydration.service';
import { PaginationService } from './pagination.service';
import { TagNormalizationService } from '../../tags/services/tag-normalization.service';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(TagAttachment.name) private attachmentModel: Model<TagAttachment>,
    private expansionService: TagExpansionService,
    private hydrationService: EntityHydrationService,
    private paginationService: PaginationService,
    private normalizationService: TagNormalizationService,
  ) {}

  async search(dto: SearchDto) {
    // Phase 1: Resolve tags
    const tagLabels = dto.tags.split(',').map(t => this.normalizationService.normalize(t.trim()));
    const resolvedTags = dto.expandRelated
      ? await this.expansionService.expandTags(tagLabels)
      : tagLabels;

    // Phase 2: Aggregate attachments
    const attachments = await this.aggregateAttachments(
      resolvedTags,
      dto.mode,
      dto.entityType,
      dto.limit || 20,
      dto.offset || 0,
    );

    // Get total count
    const total = await this.getTotalCount(resolvedTags, dto.mode, dto.entityType);

    // Phase 3: Hydrate entities
    const entities = await this.hydrationService.hydrate(attachments);

    return {
      entities,
      pagination: {
        total,
        limit: dto.limit || 20,
        offset: dto.offset || 0,
      },
      expandedTags: dto.expandRelated ? resolvedTags : undefined,
    };
  }

  private async aggregateAttachments(
    tags: string[],
    mode: 'OR' | 'AND',
    entityType: string | undefined,
    limit: number,
    offset: number,
  ): Promise<any[]> {
    const matchStage: any = {
      tagLabel: { $in: tags },
      isDeleted: false,
    };

    if (entityType) {
      matchStage.entityType = entityType;
    }

    if (mode === 'OR') {
      return this.attachmentModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { entityId: '$entityId', entityType: '$entityType' },
            tags: { $addToSet: '$tagLabel' },
          },
        },
        {
          $project: {
            _id: 0,
            entityId: '$_id.entityId',
            entityType: '$_id.entityType',
            tags: 1,
          },
        },
        { $skip: offset },
        { $limit: limit },
      ]);
    } else {
      // AND mode
      return this.attachmentModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { entityId: '$entityId', entityType: '$entityType' },
            tags: { $addToSet: '$tagLabel' },
            tagCount: { $sum: 1 },
          },
        },
        {
          $match: {
            tagCount: tags.length,
          },
        },
        {
          $project: {
            _id: 0,
            entityId: '$_id.entityId',
            entityType: '$_id.entityType',
            tags: 1,
          },
        },
        { $skip: offset },
        { $limit: limit },
      ]);
    }
  }

  private async getTotalCount(
    tags: string[],
    mode: 'OR' | 'AND',
    entityType: string | undefined,
  ): Promise<number> {
    const matchStage: any = {
      tagLabel: { $in: tags },
      isDeleted: false,
    };

    if (entityType) {
      matchStage.entityType = entityType;
    }

    if (mode === 'OR') {
      const result = await this.attachmentModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { entityId: '$entityId', entityType: '$entityType' },
          },
        },
        { $count: 'total' },
      ]);
      
      return result[0]?.total || 0;
    } else {
      const result = await this.attachmentModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { entityId: '$entityId', entityType: '$entityType' },
            tagCount: { $sum: 1 },
          },
        },
        {
          $match: {
            tagCount: tags.length,
          },
        },
        { $count: 'total' },
      ]);
      
      return result[0]?.total || 0;
    }
  }
}
