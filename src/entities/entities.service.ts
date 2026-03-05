import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Source } from '../schemas/source.schema';
import { Snippet } from '../schemas/snippet.schema';
import { AIResponse } from '../schemas/airesponse.schema';
import { TagAttachment } from '../schemas/tag-attachment.schema';
import { Tag } from '../schemas/tag.schema';

@Injectable()
export class EntitiesService {
  constructor(
    @InjectModel(Source.name) private sourceModel: Model<Source>,
    @InjectModel(Snippet.name) private snippetModel: Model<Snippet>,
    @InjectModel(AIResponse.name) private aiResponseModel: Model<AIResponse>,
    @InjectModel(TagAttachment.name) private attachmentModel: Model<TagAttachment>,
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
    @InjectConnection() private connection: Connection,
  ) {}

  async softDelete(entityType: string, entityId: string) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Step 1: Mark entity as deleted
      const collection = this.getCollectionForType(entityType);
      const entity = await collection.findOneAndUpdate(
        { _id: entityId, isDeleted: false },
        { $set: { isDeleted: true, updatedAt: new Date() } },
        { session, new: true },
      );

      if (!entity) {
        throw new NotFoundException('Entity not found');
      }

      // Step 2: Find all active attachments
      const attachments = await this.attachmentModel.find({
        entityId,
        entityType,
        isDeleted: false,
      }).session(session);

      // Step 3: Mark attachments as deleted
      await this.attachmentModel.updateMany(
        { entityId, entityType, isDeleted: false },
        { $set: { isDeleted: true, updatedAt: new Date() } },
        { session },
      );

      // Step 4: Decrement tag counts
      for (const attachment of attachments) {
        await this.tagModel.updateOne(
          { label: attachment.tagLabel },
          {
            $inc: {
              usageCount: -1,
              [`entityTypeCounts.${entityType}`]: -1,
            },
          },
          { session },
        );
      }

      await session.commitTransaction();

      return {
        success: true,
        message: 'Entity soft-deleted successfully',
        cleanedTags: attachments.length,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async validateEntity(entityType: string, entityId: string): Promise<boolean> {
    const collection = this.getCollectionForType(entityType);
    const entity = await collection.findOne({ _id: entityId, isDeleted: false });
    return !!entity;
  }

  async getEntity(entityType: string, entityId: string): Promise<any> {
    const collection = this.getCollectionForType(entityType);
    return collection.findOne({ _id: entityId, isDeleted: false }).lean();
  }

  private getCollectionForType(entityType: string): Model<any> {
    switch (entityType) {
      case 'source':
        return this.sourceModel;
      case 'snippet':
        return this.snippetModel;
      case 'airesponse':
        return this.aiResponseModel;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }
}
