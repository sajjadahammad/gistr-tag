import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SimilarityDetectionService } from '../../src/tags/services/similarity-detection.service';
import { Tag } from '../../src/schemas/tag.schema';

describe('SimilarityDetectionService', () => {
  let service: SimilarityDetectionService;
  let mockTagModel: any;

  beforeEach(async () => {
    mockTagModel = {
      countDocuments: jest.fn(),
      find: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimilarityDetectionService,
        {
          provide: getModelToken(Tag.name),
          useValue: mockTagModel,
        },
      ],
    }).compile();

    service = module.get<SimilarityDetectionService>(SimilarityDetectionService);
  });

  describe('calculateDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(service.calculateDistance('javascript', 'javascript')).toBe(0);
    });

    it('should return 1 for single character difference', () => {
      expect(service.calculateDistance('javascript', 'javascrip')).toBe(1);
      expect(service.calculateDistance('javascript', 'javascriptt')).toBe(1);
    });

    it('should return 2 for two character differences', () => {
      expect(service.calculateDistance('javascript', 'javascrpt')).toBe(2);
    });

    it('should calculate substitution distance', () => {
      expect(service.calculateDistance('javascript', 'javascrxpt')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(service.calculateDistance('', 'abc')).toBe(3);
      expect(service.calculateDistance('abc', '')).toBe(3);
    });

    it('should be symmetric', () => {
      const dist1 = service.calculateDistance('abc', 'def');
      const dist2 = service.calculateDistance('def', 'abc');
      expect(dist1).toBe(dist2);
    });
  });

  describe('findSimilarTags', () => {
    it('should find tags within distance 2', async () => {
      mockTagModel.countDocuments.mockResolvedValue(100);
      mockTagModel.lean.mockResolvedValue([
        { label: 'javascript' },
        { label: 'javascrpt' },
        { label: 'typescript' },
      ]);

      const similar = await service.findSimilarTags('javascrip');
      
      expect(similar).toContain('javascript');
      expect(similar).toContain('javascrpt');
      expect(similar).not.toContain('typescript');
    });

    it('should exclude exact matches', async () => {
      mockTagModel.countDocuments.mockResolvedValue(100);
      mockTagModel.lean.mockResolvedValue([
        { label: 'javascript' },
      ]);

      const similar = await service.findSimilarTags('javascript');
      
      expect(similar).not.toContain('javascript');
    });

    it('should only check approved tags', async () => {
      mockTagModel.countDocuments.mockResolvedValue(100);
      
      await service.findSimilarTags('test');
      
      expect(mockTagModel.find).toHaveBeenCalledWith({ isApproved: true });
    });

    it('should use optimized version for >100K tags', async () => {
      mockTagModel.countDocuments.mockResolvedValue(150000);
      mockTagModel.lean.mockResolvedValue([
        { label: 'javascript' },
      ]);

      await service.findSimilarTags('javascrip');
      
      // Should use regex for prefix filtering
      expect(mockTagModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.any(RegExp),
          isApproved: true,
        })
      );
    });
  });
});
