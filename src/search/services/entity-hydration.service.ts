import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Source } from '../../schemas/source.schema';
import { Snippet } from '../../schemas/snippet.schema';
import { AIResponse } from '../../schemas/airesponse.schema';

@Injectable()
export class EntityHydrationService {
  constructor(
    @InjectModel(Source.name) private sourceModel: Model<Source>,
    @InjectModel(Snippet.name) private snippetModel: Model<Snippet>,
    @InjectModel(AIResponse.name) private aiResponseModel: Model<AIResponse>,
  ) {}

  async hydrate(attachments: any[]): Promise<any[]> {
    const byType = this.groupByType(attachments);
    const results: any[] = [];

    for (const [entityType, items] of Object.entries(byType)) {
      const ids = items.map((item: any) => item.entityId);
      const entities = await this.fetchEntitiesByType(entityType, ids);
      
      const entityMap = new Map(entities.map(e => [e._id.toString(), e]));
      
      for (const item of items) {
        const entity = entityMap.get(item.entityId);
        if (entity) {
          results.push({
            entityId: item.entityId,
            entityType: item.entityType,
            data: entity,
            tags: item.tags,
          });
        }
      }
    }

    return results;
  }

  private groupByType(attachments: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    for (const attachment of attachments) {
      if (!grouped[attachment.entityType]) {
        grouped[attachment.entityType] = [];
      }
      grouped[attachment.entityType].push(attachment);
    }
    
    return grouped;
  }

  async fetchEntitiesByType(entityType: string, entityIds: string[]): Promise<any[]> {
    const collection = this.getCollectionForType(entityType);
    
    return collection.find({
      _id: { $in: entityIds },
      isDeleted: false,
    }).lean();
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
