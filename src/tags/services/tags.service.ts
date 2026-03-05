import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag } from '../../schemas/tag.schema';
import { TagAttachment } from '../../schemas/tag-attachment.schema';
import { AttachTagsDto } from '../dto/attach-tags.dto';
import { TagNormalizationService } from './tag-normalization.service';
import { SimilarityDetectionService } from './similarity-detection.service';

const MAX_TAGS_PER_ENTITY = 20;
const TAG_APPROVAL_THRESHOLD = 3;

@Injectable()
export class TagsService {
  constructor(
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
    @InjectModel(TagAttachment.name) private attachmentModel: Model<TagAttachment>,
    private normalizationService: TagNormalizationService,
    private similarityService: SimilarityDetectionService,
  ) {}

  async attachTags(dto: AttachTagsDto) {
    // Normalize and deduplicate tags
    const normalizedTags = [...new Set(dto.tags.map(tag => {
      const normalized = this.normalizationService.normalize(tag);
      this.normalizationService.validate(normalized);
      return normalized;
    }))];

    // Check current tag count for entity
    const currentCount = await this.attachmentModel.countDocuments({
      entityId: dto.entityId,
      entityType: dto.entityType,
      isDeleted: false,
    });

    if (currentCount + normalizedTags.length > MAX_TAGS_PER_ENTITY) {
      throw new BadRequestException(
        `Maximum of ${MAX_TAGS_PER_ENTITY} tags per entity. Current: ${currentCount}, Attempting to add: ${normalizedTags.length}`
      );
    }

    const attached: string[] = [];
    const skipped: string[] = [];
    const warnings: Array<{ submitted: string; similar: string[] }> = [];

    for (const tagLabel of normalizedTags) {
      // Check for similar tags
      const similarTags = await this.similarityService.findSimilarTags(tagLabel);
      if (similarTags.length > 0) {
        warnings.push({ submitted: tagLabel, similar: similarTags });
      }

      // Upsert tag
      await this.upsertTag(tagLabel);

      // Try to create attachment
      try {
        await this.attachmentModel.create({
          entityId: dto.entityId,
          entityType: dto.entityType,
          tagLabel,
          source: dto.source,
          isDeleted: false,
        });

        // Increment counts
        await this.incrementTagCounts(tagLabel, dto.entityType);
        await this.checkAndPromoteTag(tagLabel);
        
        attached.push(tagLabel);
      } catch (error: any) {
        if (error.code === 11000) {
          // Duplicate key - already attached
          skipped.push(tagLabel);
        } else {
          throw error;
        }
      }
    }

    return {
      attached,
      skipped,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  async detachTag(entityType: string, entityId: string, tagLabel: string) {
    const normalizedLabel = this.normalizationService.normalize(tagLabel);

    const attachment = await this.attachmentModel.findOne({
      entityId,
      entityType,
      tagLabel: normalizedLabel,
      isDeleted: false,
    });

    if (!attachment) {
      throw new NotFoundException('Tag attachment not found');
    }

    attachment.isDeleted = true;
    await attachment.save();

    await this.decrementTagCounts(normalizedLabel, entityType);
  }

  private async upsertTag(normalizedLabel: string): Promise<Tag> {
    const result = await this.tagModel.findOneAndUpdate(
      { label: normalizedLabel },
      {
        $setOnInsert: {
          label: normalizedLabel,
          usageCount: 0,
          entityTypeCounts: { source: 0, snippet: 0, airesponse: 0 },
          isApproved: false,
        },
        $set: {
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    return result;
  }

  async incrementTagCounts(tagLabel: string, entityType: string): Promise<void> {
    await this.tagModel.updateOne(
      { label: tagLabel },
      {
        $inc: {
          usageCount: 1,
          [`entityTypeCounts.${entityType}`]: 1,
        },
        $set: {
          lastUsedAt: new Date(),
        },
      },
    );
  }

  async decrementTagCounts(tagLabel: string, entityType: string): Promise<void> {
    await this.tagModel.updateOne(
      { label: tagLabel },
      {
        $inc: {
          usageCount: -1,
          [`entityTypeCounts.${entityType}`]: -1,
        },
      },
    );
  }

  async checkAndPromoteTag(tagLabel: string): Promise<void> {
    const tag = await this.tagModel.findOne({ label: tagLabel });
    
    if (tag && tag.usageCount >= TAG_APPROVAL_THRESHOLD && !tag.isApproved) {
      tag.isApproved = true;
      await tag.save();
    }
  }

  async setParentTag(childLabel: string, parentLabel: string): Promise<void> {
    const normalizedChild = this.normalizationService.normalize(childLabel);
    const normalizedParent = this.normalizationService.normalize(parentLabel);

    const parentTag = await this.tagModel.findOne({ label: normalizedParent });
    if (!parentTag) {
      throw new BadRequestException('Parent tag does not exist');
    }

    await this.tagModel.updateOne(
      { label: normalizedChild },
      { $set: { parentLabel: normalizedParent } },
    );
  }

  async getRelatedTags(label: string) {
    const normalizedLabel = this.normalizationService.normalize(label);
    const tag = await this.tagModel.findOne({ label: normalizedLabel });

    if (!tag) {
      return { label: normalizedLabel, children: [] };
    }

    const children = await this.tagModel
      .find({ parentLabel: normalizedLabel })
      .sort({ usageCount: -1 })
      .select('label usageCount')
      .lean();

    let parent = null;
    if (tag.parentLabel) {
      const parentTag = await this.tagModel
        .findOne({ label: tag.parentLabel })
        .select('label usageCount')
        .lean();
      if (parentTag) {
        parent = { label: parentTag.label, usageCount: parentTag.usageCount };
      }
    }

    return {
      label: normalizedLabel,
      parent,
      children: children.map(c => ({ label: c.label, usageCount: c.usageCount })),
    };
  }

  async listTags() {
    return this.tagModel
      .find({ usageCount: { $gt: 0 } })
      .sort({ usageCount: -1 })
      .select('label usageCount entityTypeCounts isApproved parentLabel')
      .lean();
  }

  async getAnalytics(days: number = 30) {
    if (days < 1 || days > 365) {
      throw new BadRequestException('Days parameter must be between 1 and 365');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const tags = await this.tagModel
      .find({
        lastUsedAt: { $gte: startDate },
      })
      .sort({ usageCount: -1 })
      .select('label usageCount entityTypeCounts isApproved lastUsedAt')
      .lean();

    return {
      tags,
      timeWindow: {
        startDate,
        endDate: new Date(),
        days,
      },
    };
  }
}
