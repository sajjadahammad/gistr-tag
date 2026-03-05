import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { EntitiesService } from '../../src/entities/entities.service';
import { Source } from '../../src/schemas/source.schema';
import { Snippet } from '../../src/schemas/snippet.schema';
import { AIResponse } from '../../src/schemas/airesponse.schema';
import { TagAttachment } from '../../src/schemas/tag-attachment.schema';
import { Tag } from '../../src/schemas/tag.schema';

describe('EntitiesService', () => {
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

  describe('softDelete', () => {
    it('should mark entity as deleted', async () => {
      mockSourceModel.findOneAndUpdate.mockResolvedValue({ _id: 'e1', isDeleted: true });
      mockAttachmentModel.session.mockResolvedValue([
        { tagLabel: 'javascript', entityType: 'source' },
      ]);
      mockAttachmentModel.updateMany.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});

      const result = await service.softDelete('source', 'e1');

      expect(mockSourceModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'e1', isDeleted: false },
        { $set: { isDeleted: true, updatedAt: expect.any(Date) } },
        expect.objectContaining({ session: mockSession })
      );
      expect(result.success).toBe(true);
    });

    it('should mark attachments as deleted', async () => {
      mockSourceModel.findOneAndUpdate.mockResolvedValue({ _id: 'e1' });
      mockAttachmentModel.session.mockResolvedValue([
        { tagLabel: 'javascript', entityType: 'source' },
        { tagLabel: 'nodejs', entityType: 'source' },
      ]);
      mockAttachmentModel.updateMany.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});

      await service.softDelete('source', 'e1');

      expect(mockAttachmentModel.updateMany).toHaveBeenCalledWith(
        { entityId: 'e1', entityType: 'source', isDeleted: false },
        { $set: { isDeleted: true, updatedAt: expect.any(Date) } },
        expect.objectContaining({ session: mockSession })
      );
    });

    it('should decrement tag counts', async () => {
      mockSourceModel.findOneAndUpdate.mockResolvedValue({ _id: 'e1' });
      mockAttachmentModel.session.mockResolvedValue([
        { tagLabel: 'javascript', entityType: 'source' },
        { tagLabel: 'nodejs', entityType: 'source' },
      ]);
      mockAttachmentModel.updateMany.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});

      await service.softDelete('source', 'e1');

      expect(mockTagModel.updateOne).toHaveBeenCalledTimes(2);
      expect(mockTagModel.updateOne).toHaveBeenCalledWith(
        { label: 'javascript' },
        {
          $inc: {
            usageCount: -1,
            'entityTypeCounts.source': -1,
          },
        },
        expect.objectContaining({ session: mockSession })
      );
    });

    it('should return cleanedTags count', async () => {
      mockSourceModel.findOneAndUpdate.mockResolvedValue({ _id: 'e1' });
      mockAttachmentModel.session.mockResolvedValue([
        { tagLabel: 'javascript', entityType: 'source' },
        { tagLabel: 'nodejs', entityType: 'source' },
        { tagLabel: 'typescript', entityType: 'source' },
      ]);
      mockAttachmentModel.updateMany.mockResolvedValue({});
      mockTagModel.updateOne.mockResolvedValue({});

      const result = await service.softDelete('source', 'e1');

      expect(result.cleanedTags).toBe(3);
    });

    it('should commit transaction on success', async () => {
      mockSourceModel.findOneAndUpdate.mockResolvedValue({ _id: 'e1' });
      mockAttachmentModel.session.mockResolvedValue([]);
      mockAttachmentModel.updateMany.mockResolvedValue({});

      await service.softDelete('source', 'e1');

      expect(mockSession.commitTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should rollback transaction on failure', async () => {
      mockSourceModel.findOneAndUpdate.mockRejectedValue(new Error('DB error'));

      await expect(service.softDelete('source', 'e1')).rejects.toThrow('DB error');

      expect(mockSession.abortTransaction).toHaveBeenCalled();
      expect(mockSession.endSession).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent entity', async () => {
      mockSourceModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.softDelete('source', 'e1')).rejects.toThrow(NotFoundException);
      await expect(service.softDelete('source', 'e1')).rejects.toThrow('Entity not found');
    });

    it('should handle different entity types', async () => {
      // Test snippet
      mockSnippetModel.findOneAndUpdate.mockResolvedValue({ _id: 'e1' });
      mockAttachmentModel.session.mockResolvedValue([]);
      mockAttachmentModel.updateMany.mockResolvedValue({});

      await service.softDelete('snippet', 'e1');
      expect(mockSnippetModel.findOneAndUpdate).toHaveBeenCalled();

      // Test airesponse
      mockAIResponseModel.findOneAndUpdate.mockResolvedValue({ _id: 'e2' });
      await service.softDelete('airesponse', 'e2');
      expect(mockAIResponseModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('validateEntity', () => {
    it('should return true for existing entity', async () => {
      mockSourceModel.findOne.mockResolvedValue({ _id: 'e1', isDeleted: false });

      const result = await service.validateEntity('source', 'e1');

      expect(result).toBe(true);
    });

    it('should return false for non-existent entity', async () => {
      mockSourceModel.findOne.mockResolvedValue(null);

      const result = await service.validateEntity('source', 'e1');

      expect(result).toBe(false);
    });

    it('should return false for deleted entity', async () => {
      mockSourceModel.findOne.mockResolvedValue(null);

      const result = await service.validateEntity('source', 'e1');

      expect(result).toBe(false);
      expect(mockSourceModel.findOne).toHaveBeenCalledWith({ _id: 'e1', isDeleted: false });
    });
  });

  describe('getEntity', () => {
    it('should return entity data', async () => {
      const mockEntity = { _id: 'e1', title: 'Test', isDeleted: false };
      mockSourceModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockEntity),
      });

      const result = await service.getEntity('source', 'e1');

      expect(result).toEqual(mockEntity);
    });

    it('should return null for non-existent entity', async () => {
      mockSourceModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getEntity('source', 'e1');

      expect(result).toBeNull();
    });
  });
});
