import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TagsService } from '../../src/tags/services/tags.service';
import { Tag } from '../../src/schemas/tag.schema';
import { TagAttachment } from '../../src/schemas/tag-attachment.schema';
import { TagNormalizationService } from '../../src/tags/services/tag-normalization.service';
import { SimilarityDetectionService } from '../../src/tags/services/similarity-detection.service';

describe('TagsService', () => {
  let service: TagsService;
  let mockTagModel: any;
  let mockAttachmentModel: any;
  let mockNormalizationService: any;
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
      save: jest.fn(),
    };

    mockNormalizationService = {
      normalize: jest.fn((label) => label.toLowerCase()),
      validate: jest.fn(),
    };

    mockSimilarityService = {
      findSimilarTags: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagsService,
        {
          provide: getModelToken(Tag.name),
          useValue: mockTagModel,
        },
        {
          provide: getModelToken(TagAttachment.name),
          useValue: mockAttachmentModel,
        },
        {
          provide: TagNormalizationService,
          useValue: mockNormalizationService,
        },
        {
          provide: SimilarityDetectionService,
          useValue: mockSimilarityService,
        },
      ],
    }).compile();

    service = module.get<TagsService>(TagsService);
  });

  describe('attachTags', () => {
    const dto = {
      entityId: 'entity1',
      entityType: 'source' as const,
      tags: ['javascript', 'nodejs'],
      source: 'user' as const,
    };

    it('should normalize and deduplicate tags', async () => {
      mockAttachmentModel.countDocuments.mockResolvedValue(0);
      mockTagModel.findOneAndUpdate.mockResolvedValue({});
      mockAttachmentModel.create.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});
      mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

      const dtoWithDupes = { ...dto, tags: ['JavaScript', 'javascript', 'nodejs'] };
      await service.attachTags(dtoWithDupes);

      expect(mockNormalizationService.normalize).toHaveBeenCalledTimes(3);
      expect(mockAttachmentModel.create).toHaveBeenCalledTimes(2); // Only 2 unique tags
    });

    it('should enforce 20-tag limit', async () => {
      mockAttachmentModel.countDocuments.mockResolvedValue(19);

      const dtoWithManyTags = { ...dto, tags: ['tag1', 'tag2'] };
      
      await expect(service.attachTags(dtoWithManyTags)).rejects.toThrow(BadRequestException);
      await expect(service.attachTags(dtoWithManyTags)).rejects.toThrow('Maximum of 20 tags');
    });

    it('should return warnings for similar tags', async () => {
      mockAttachmentModel.countDocuments.mockResolvedValue(0);
      mockSimilarityService.findSimilarTags.mockResolvedValue(['javascript']);
      mockTagModel.findOneAndUpdate.mockResolvedValue({});
      mockAttachmentModel.create.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});
      mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

      const result = await service.attachTags({ ...dto, tags: ['javascrip'] });

      expect(result.warnings).toBeDefined();
      expect(result.warnings![0].submitted).toBe('javascrip');
      expect(result.warnings![0].similar).toContain('javascript');
    });

    it('should handle duplicate key errors (idempotence)', async () => {
      mockAttachmentModel.countDocuments.mockResolvedValue(0);
      mockTagModel.findOneAndUpdate.mockResolvedValue({});
      mockAttachmentModel.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ code: 11000 });
      mockTagModel.updateOne.mockResolvedValue({});
      mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

      const result = await service.attachTags(dto);

      expect(result.attached).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
    });

    it('should increment tag counts', async () => {
      mockAttachmentModel.countDocuments.mockResolvedValue(0);
      mockTagModel.findOneAndUpdate.mockResolvedValue({});
      mockAttachmentModel.create.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});
      mockTagModel.findOne.mockResolvedValue({ usageCount: 1, isApproved: false });

      await service.attachTags({ ...dto, tags: ['javascript'] });

      expect(mockTagModel.updateOne).toHaveBeenCalledWith(
        { label: 'javascript' },
        expect.objectContaining({
          $inc: {
            usageCount: 1,
            'entityTypeCounts.source': 1,
          },
        })
      );
    });

    it('should promote tag at threshold', async () => {
      mockAttachmentModel.countDocuments.mockResolvedValue(0);
      mockTagModel.findOneAndUpdate.mockResolvedValue({});
      mockAttachmentModel.create.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});
      
      const mockTag = {
        usageCount: 3,
        isApproved: false,
        save: jest.fn(),
      };
      mockTagModel.findOne.mockResolvedValue(mockTag);

      await service.attachTags({ ...dto, tags: ['javascript'] });

      expect(mockTag.isApproved).toBe(true);
      expect(mockTag.save).toHaveBeenCalled();
    });
  });

  describe('detachTag', () => {
    it('should mark attachment as deleted', async () => {
      const mockAttachment = {
        isDeleted: false,
        save: jest.fn(),
      };
      mockAttachmentModel.findOne.mockResolvedValue(mockAttachment);
      mockTagModel.updateOne.mockResolvedValue({});

      await service.detachTag('source', 'entity1', 'javascript');

      expect(mockAttachment.isDeleted).toBe(true);
      expect(mockAttachment.save).toHaveBeenCalled();
    });

    it('should decrement tag counts', async () => {
      const mockAttachment = {
        isDeleted: false,
        save: jest.fn(),
      };
      mockAttachmentModel.findOne.mockResolvedValue(mockAttachment);
      mockTagModel.updateOne.mockResolvedValue({});

      await service.detachTag('source', 'entity1', 'javascript');

      expect(mockTagModel.updateOne).toHaveBeenCalledWith(
        { label: 'javascript' },
        expect.objectContaining({
          $inc: {
            usageCount: -1,
            'entityTypeCounts.source': -1,
          },
        })
      );
    });

    it('should throw NotFoundException for non-existent attachment', async () => {
      mockAttachmentModel.findOne.mockResolvedValue(null);

      await expect(service.detachTag('source', 'entity1', 'javascript'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('setParentTag', () => {
    it('should validate parent tag exists', async () => {
      mockTagModel.findOne.mockResolvedValue(null);

      await expect(service.setParentTag('child', 'parent'))
        .rejects.toThrow(BadRequestException);
      await expect(service.setParentTag('child', 'parent'))
        .rejects.toThrow('Parent tag does not exist');
    });

    it('should update child parentLabel', async () => {
      mockTagModel.findOne.mockResolvedValue({ label: 'parent' });
      mockTagModel.updateOne.mockResolvedValue({});

      await service.setParentTag('child', 'parent');

      expect(mockTagModel.updateOne).toHaveBeenCalledWith(
        { label: 'child' },
        { $set: { parentLabel: 'parent' } }
      );
    });
  });

  describe('getRelatedTags', () => {
    it('should return parent and children', async () => {
      mockTagModel.findOne.mockResolvedValueOnce({ 
        label: 'mongodb', 
        parentLabel: 'database' 
      });
      mockTagModel.lean.mockResolvedValueOnce([
        { label: 'postgresql', usageCount: 5 },
        { label: 'redis', usageCount: 3 },
      ]);
      mockTagModel.findOne.mockResolvedValueOnce({ 
        label: 'database', 
        usageCount: 10 
      });

      const result = await service.getRelatedTags('mongodb');

      expect(result.parent).toEqual({ label: 'database', usageCount: 10 });
      expect(result.children).toHaveLength(2);
    });

    it('should return empty array for non-existent tag', async () => {
      mockTagModel.findOne.mockResolvedValue(null);

      const result = await service.getRelatedTags('nonexistent');

      expect(result.children).toEqual([]);
    });
  });

  describe('getAnalytics', () => {
    it('should validate days parameter', async () => {
      await expect(service.getAnalytics(0)).rejects.toThrow(BadRequestException);
      await expect(service.getAnalytics(366)).rejects.toThrow(BadRequestException);
    });

    it('should filter by time window', async () => {
      mockTagModel.lean.mockResolvedValue([]);

      await service.getAnalytics(30);

      expect(mockTagModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          lastUsedAt: expect.objectContaining({ $gte: expect.any(Date) }),
        })
      );
    });

    it('should return timeWindow metadata', async () => {
      mockTagModel.lean.mockResolvedValue([]);

      const result = await service.getAnalytics(14);

      expect(result.timeWindow.days).toBe(14);
      expect(result.timeWindow.startDate).toBeInstanceOf(Date);
      expect(result.timeWindow.endDate).toBeInstanceOf(Date);
    });
  });

  describe('listTags', () => {
    it('should exclude tags with zero usage', async () => {
      mockTagModel.lean.mockResolvedValue([]);

      await service.listTags();

      expect(mockTagModel.find).toHaveBeenCalledWith({ usageCount: { $gt: 0 } });
    });

    it('should sort by usageCount descending', async () => {
      mockTagModel.lean.mockResolvedValue([]);

      await service.listTags();

      expect(mockTagModel.sort).toHaveBeenCalledWith({ usageCount: -1 });
    });
  });
});
