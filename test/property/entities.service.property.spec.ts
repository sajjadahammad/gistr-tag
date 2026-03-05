import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import * as fc from 'fast-check';
import { EntitiesService } from '../../src/entities/entities.service';
import { Source } from '../../src/schemas/source.schema';
import { Snippet } from '../../src/schemas/snippet.schema';
import { AIResponse } from '../../src/schemas/airesponse.schema';
import { TagAttachment } from '../../src/schemas/tag-attachment.schema';
import { Tag } from '../../src/schemas/tag.schema';
import { entityIdGen, entityTypeGen } from '../generators';

describe('EntitiesService - Property-Based Tests', () => {
  let service: EntitiesService;
  let mockSourceModel: any;
  let mockSnippetModel: any;
  let mockAIResponseModel: any;
  let mockAttachmentModel: any;
  let mockTagModel: any;
  let mockConnection: any;
  let mockSession: any;

  beforeEach(async () => {
    mockSession = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };

    mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    mockSourceModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
    };

    mockSnippetModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
    };

    mockAIResponseModel = {
      findOneAndUpdate: jest.fn(),
      findOne: jest.fn(),
    };

    mockAttachmentModel = {
      find: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      updateMany: jest.fn(),
    };

    mockTagModel = {
      updateOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitiesService,
        {
          provide: getModelToken(Source.name),
          useValue: mockSourceModel,
        },
        {
          provide: getModelToken(Snippet.name),
          useValue: mockSnippetModel,
        },
        {
          provide: getModelToken(AIResponse.name),
          useValue: mockAIResponseModel,
        },
        {
          provide: getModelToken(TagAttachment.name),
          useValue: mockAttachmentModel,
        },
        {
          provide: getModelToken(Tag.name),
          useValue: mockTagModel,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    service = module.get<EntitiesService>(EntitiesService);
  });

  // Feature: gistr-tagging-search-layer, Property 28: Soft Delete Marks Entity
  it('property 28: soft delete marks entity', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeGen,
        entityIdGen,
        async (entityType, entityId) => {
          const mockModel = entityType === 'source' ? mockSourceModel :
                           entityType === 'snippet' ? mockSnippetModel :
                           mockAIResponseModel;

          mockModel.findOneAndUpdate.mockResolvedValue({ _id: entityId, isDeleted: true });
          mockAttachmentModel.session.mockResolvedValue([]);
          mockAttachmentModel.updateMany.mockResolvedValue({});

          await service.softDelete(entityType, entityId);

          expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
            { _id: entityId, isDeleted: false },
            expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) }),
            expect.any(Object)
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 29: Soft Delete Cascades to Attachments
  it('property 29: soft delete cascades to attachments', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeGen,
        entityIdGen,
        fc.array(fc.string({ minLength: 2, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        async (entityType, entityId, tagLabels) => {
          const mockModel = entityType === 'source' ? mockSourceModel :
                           entityType === 'snippet' ? mockSnippetModel :
                           mockAIResponseModel;

          mockModel.findOneAndUpdate.mockResolvedValue({ _id: entityId });
          
          const attachments = tagLabels.map(label => ({
            tagLabel: label,
            entityType,
          }));
          mockAttachmentModel.session.mockResolvedValue(attachments);
          mockAttachmentModel.updateMany.mockResolvedValue({});
          mockTagModel.updateOne.mockResolvedValue({});

          await service.softDelete(entityType, entityId);

          expect(mockAttachmentModel.updateMany).toHaveBeenCalledWith(
            { entityId, entityType, isDeleted: false },
            expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) }),
            expect.any(Object)
          );
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 30: Soft Delete Updates Tag Counts
  it('property 30: soft delete updates tag counts', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeGen,
        entityIdGen,
        fc.array(fc.string({ minLength: 2, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        async (entityType, entityId, tagLabels) => {
          const mockModel = entityType === 'source' ? mockSourceModel :
                           entityType === 'snippet' ? mockSnippetModel :
                           mockAIResponseModel;

          mockModel.findOneAndUpdate.mockResolvedValue({ _id: entityId });
          
          const attachments = tagLabels.map(label => ({
            tagLabel: label,
            entityType,
          }));
          mockAttachmentModel.session.mockResolvedValue(attachments);
          mockAttachmentModel.updateMany.mockResolvedValue({});
          mockTagModel.updateOne.mockResolvedValue({});

          const result = await service.softDelete(entityType, entityId);

          expect(mockTagModel.updateOne).toHaveBeenCalledTimes(tagLabels.length);
          expect(result.cleanedTags).toBe(tagLabels.length);
          
          // Verify each tag count was decremented
          tagLabels.forEach(label => {
            expect(mockTagModel.updateOne).toHaveBeenCalledWith(
              { label },
              expect.objectContaining({
                $inc: {
                  usageCount: -1,
                  [`entityTypeCounts.${entityType}`]: -1,
                },
              }),
              expect.any(Object)
            );
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 31: Soft Delete Atomicity
  it('property 31: soft delete atomicity', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityTypeGen,
        entityIdGen,
        async (entityType, entityId) => {
          const mockModel = entityType === 'source' ? mockSourceModel :
                           entityType === 'snippet' ? mockSnippetModel :
                           mockAIResponseModel;

          mockModel.findOneAndUpdate.mockRejectedValue(new Error('DB error'));

          await expect(service.softDelete(entityType, entityId)).rejects.toThrow();

          // Transaction should be aborted
          expect(mockSession.abortTransaction).toHaveBeenCalled();
          expect(mockSession.endSession).toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});
