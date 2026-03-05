import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as fc from 'fast-check';
import { TagsService } from '../../src/tags/services/tags.service';
import { Tag } from '../../src/schemas/tag.schema';
import { TagAttachment } from '../../src/schemas/tag-attachment.schema';
import { TagNormalizationService } from '../../src/tags/services/tag-normalization.service';
import { SimilarityDetectionService } from '../../src/tags/services/similarity-detection.service';
import { attachTagsDtoGen, tagLabelGen, entityIdGen, entityTypeGen } from '../generators';

describe('TagsService - Property-Based Tests', () => {
  let service: TagsService;
  let mockTagModel: any;
  let mockAttachmentModel: any;
  let normalizationService: TagNormalizationService;
  let mockSimilarityService: any;

  beforeEach(async () => {
    mockTagModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn().mockReturnThis(),
      countDocuments: jest.fn(),
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    mockAttachmentModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn(),
      find: jest.fn().mockReturnThis(),
    };

    mockSimilarityService = {
      findSimilarTags: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        TagNormalizationService,
        {
          provide: getModelToken(Tag.name),
          useValue: mockTagModel,
        },
        {
          provide: getModelToken(TagAttachment.name),
          useValue: mockAttachmentModel,
        },
        {
          provide: SimilarityDetectionService,
          useValue: mockSimilarityService,
        },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
    normalizationService = module.get<TagNormalizationService>(TagNormalizationService);
  });

  // Feature: gistr-tagging-search-layer, Property 1: Tag Attachment Creates Record
  it('property 1: tag attachment creates record', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityIdGen,
        entityTypeGen,
        tagLabelGen,
        async (entityId, entityType, tagLabel) => {
          mockAttachmentModel.countDocuments.mockResolvedValue(0);
          mockTagModel.findOneAndUpdate.mockResolvedValue({});
          mockAttachmentModel.create.mockResolvedValue({});
          mockTagModel.updateOne.mockResolvedValue({});
          mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

          const result = await service.attachTags({
            entityId,
            entityType: entityType as 'source' | 'snippet' | 'airesponse',
            tags: [tagLabel],
            source: 'user',
          });

          expect(mockAttachmentModel.create).toHaveBeenCalled();
          expect(result.attached.length + result.skipped.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 2: Tag Attachment Idempotence
  it('property 2: tag attachment idempotence', async () => {
    await fc.assert(
      fc.asyncProperty(
        attachTagsDtoGen,
        async (dto) => {
          mockAttachmentModel.countDocuments.mockResolvedValue(0);
          mockTagModel.findOneAndUpdate.mockResolvedValue({});
          mockAttachmentModel.create
            .mockResolvedValueOnce({})
            .mockRejectedValueOnce({ code: 11000 });
          mockTagModel.updateOne.mockResolvedValue({});
          mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

          const typedDto = {
            ...dto,
            entityType: dto.entityType as 'source' | 'snippet' | 'airesponse',
            source: dto.source as 'system' | 'user',
          };

          const result1 = await service.attachTags(typedDto);
          const result2 = await service.attachTags(typedDto);

          // Second call should skip already attached tags
          expect(result2.skipped.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 3: Tag Source Recording
  it('property 3: tag source recording', async () => {
    await fc.assert(
      fc.asyncProperty(
        attachTagsDtoGen,
        async (dto) => {
          mockAttachmentModel.countDocuments.mockResolvedValue(0);
          mockTagModel.findOneAndUpdate.mockResolvedValue({});
          mockAttachmentModel.create.mockResolvedValue({});
          mockTagModel.updateOne.mockResolvedValue({});
          mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

          const typedDto = {
            ...dto,
            entityType: dto.entityType as 'source' | 'snippet' | 'airesponse',
            source: dto.source as 'system' | 'user',
          };

          await service.attachTags(typedDto);

          const createCall = mockAttachmentModel.create.mock.calls[0][0];
          expect(createCall.source).toBe(dto.source);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 4: Tag Count Increment on Attachment
  it('property 4: tag count increment on attachment', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityIdGen,
        entityTypeGen,
        tagLabelGen,
        async (entityId, entityType, tagLabel) => {
          mockAttachmentModel.countDocuments.mockResolvedValue(0);
          mockTagModel.findOneAndUpdate.mockResolvedValue({});
          mockAttachmentModel.create.mockResolvedValue({});
          mockTagModel.updateOne.mockResolvedValue({});
          mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

          await service.attachTags({
            entityId,
            entityType: entityType as 'source' | 'snippet' | 'airesponse',
            tags: [tagLabel],
            source: 'user',
          });

          expect(mockTagModel.updateOne).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
              $inc: {
                usageCount: 1,
                [`entityTypeCounts.${entityType}`]: 1,
              },
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 10: Tag Promotion at Threshold
  it('property 10: tag promotion at threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        tagLabelGen,
        async (tagLabel) => {
          const mockTag = {
            usageCount: 3,
            isApproved: false,
            save: jest.fn(),
          };
          mockTagModel.findOne.mockResolvedValue(mockTag);

          await service.checkAndPromoteTag(tagLabel);

          expect(mockTag.isApproved).toBe(true);
          expect(mockTag.save).toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 11: New Tags Start Unapproved
  it('property 11: new tags start unapproved', async () => {
    await fc.assert(
      fc.asyncProperty(
        tagLabelGen,
        async (tagLabel) => {
          const normalized = normalizationService.normalize(tagLabel);
          mockTagModel.findOneAndUpdate.mockResolvedValue({
            label: normalized,
            isApproved: false,
            usageCount: 0,
          });

          const result = await service['upsertTag'](normalized);

          const updateCall = mockTagModel.findOneAndUpdate.mock.calls[0][1];
          expect(updateCall.$setOnInsert.isApproved).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 32: Tag Normalization Round Trip
  it('property 32: tag normalization round trip', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 2, maxLength: 50 }),
        async (tagLabel) => {
          const normalized1 = normalizationService.normalize(tagLabel);
          const normalized2 = normalizationService.normalize(normalized1);

          // Normalizing twice should give same result
          expect(normalized1).toBe(normalized2);
          
          // Should be lowercase
          expect(normalized1).toBe(normalized1.toLowerCase());
          
          // Should not have leading/trailing whitespace
          expect(normalized1).toBe(normalized1.trim());
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 41: Bulk Tag Deduplication
  it('property 41: bulk tag deduplication', async () => {
    await fc.assert(
      fc.asyncProperty(
        entityIdGen,
        entityTypeGen,
        fc.array(tagLabelGen, { minLength: 2, maxLength: 10 }),
        async (entityId, entityType, tags) => {
          // Create duplicates
          const tagsWithDupes = [...tags, ...tags.slice(0, 2)];
          
          mockAttachmentModel.countDocuments.mockResolvedValue(0);
          mockTagModel.findOneAndUpdate.mockResolvedValue({});
          mockAttachmentModel.create.mockResolvedValue({});
          mockTagModel.updateOne.mockResolvedValue({});
          mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

          await service.attachTags({
            entityId,
            entityType: entityType as 'source' | 'snippet' | 'airesponse',
            tags: tagsWithDupes,
            source: 'user',
          });

          // Should only create unique tags
          const createCalls = mockAttachmentModel.create.mock.calls.length;
          const uniqueTags = new Set(tags.map(t => normalizationService.normalize(t)));
          expect(createCalls).toBeLessThanOrEqual(uniqueTags.size);
        }
      ),
      { numRuns: 50 }
    );
  });
});
