import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SearchService } from '../../src/search/services/search.service';
import { TagAttachment } from '../../src/schemas/tag-attachment.schema';
import { TagExpansionService } from '../../src/search/services/tag-expansion.service';
import { EntityHydrationService } from '../../src/search/services/entity-hydration.service';
import { PaginationService } from '../../src/search/services/pagination.service';
import { TagNormalizationService } from '../../src/tags/services/tag-normalization.service';

describe('SearchService', () => {
  let service: SearchService;
  let mockAttachmentModel: any;
  let mockExpansionService: any;
  let mockHydrationService: any;
  let mockPaginationService: any;
  let mockNormalizationService: any;

  beforeEach(async () => {
    mockAttachmentModel = {
      aggregate: jest.fn(),
    };

    mockExpansionService = {
      expandTags: jest.fn((tags) => Promise.resolve(tags)),
    };

    mockHydrationService = {
      hydrate: jest.fn((attachments) => Promise.resolve(attachments)),
    };

    mockPaginationService = {
      getPaginationStrategy: jest.fn(() => 'offset'),
    };

    mockNormalizationService = {
      normalize: jest.fn((label) => label.toLowerCase()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getModelToken(TagAttachment.name),
          useValue: mockAttachmentModel,
        },
        {
          provide: TagExpansionService,
          useValue: mockExpansionService,
        },
        {
          provide: EntityHydrationService,
          useValue: mockHydrationService,
        },
        {
          provide: PaginationService,
          useValue: mockPaginationService,
        },
        {
          provide: TagNormalizationService,
          useValue: mockNormalizationService,
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search - OR mode', () => {
    it('should find entities with at least one matching tag', async () => {
      const dto = {
        tags: 'javascript,nodejs',
        mode: 'OR' as const,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate
        .mockResolvedValueOnce([
          { entityId: 'e1', entityType: 'source', tags: ['javascript'] },
          { entityId: 'e2', entityType: 'snippet', tags: ['nodejs'] },
        ])
        .mockResolvedValueOnce([{ total: 2 }]);

      mockHydrationService.hydrate.mockResolvedValue([
        { entityId: 'e1', entityType: 'source', data: {} },
        { entityId: 'e2', entityType: 'snippet', data: {} },
      ]);

      const result = await service.search(dto);

      expect(result.entities).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should exclude deleted attachments', async () => {
      const dto = {
        tags: 'javascript',
        mode: 'OR' as const,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.search(dto);

      const aggregateCall = mockAttachmentModel.aggregate.mock.calls[0][0];
      expect(aggregateCall[0].$match.isDeleted).toBe(false);
    });
  });

  describe('search - AND mode', () => {
    it('should find entities with all matching tags', async () => {
      const dto = {
        tags: 'javascript,nodejs',
        mode: 'AND' as const,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate
        .mockResolvedValueOnce([
          { entityId: 'e1', entityType: 'source', tags: ['javascript', 'nodejs'] },
        ])
        .mockResolvedValueOnce([{ total: 1 }]);

      mockHydrationService.hydrate.mockResolvedValue([
        { entityId: 'e1', entityType: 'source', data: {} },
      ]);

      const result = await service.search(dto);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].tags).toContain('javascript');
      expect(result.entities[0].tags).toContain('nodejs');
    });

    it('should filter by tagCount in aggregation', async () => {
      const dto = {
        tags: 'javascript,nodejs',
        mode: 'AND' as const,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.search(dto);

      const aggregateCall = mockAttachmentModel.aggregate.mock.calls[0][0];
      const matchStage = aggregateCall.find((stage: any) => stage.$match?.tagCount);
      expect(matchStage.$match.tagCount).toBe(2);
    });
  });

  describe('search - tag expansion', () => {
    it('should expand tags when expandRelated is true', async () => {
      const dto = {
        tags: 'database',
        mode: 'OR' as const,
        expandRelated: true,
        limit: 20,
        offset: 0,
      };

      mockExpansionService.expandTags.mockResolvedValue([
        'database',
        'mongodb',
        'postgresql',
      ]);

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      const result = await service.search(dto);

      expect(mockExpansionService.expandTags).toHaveBeenCalledWith(['database']);
      expect(result.expandedTags).toEqual(['database', 'mongodb', 'postgresql']);
    });

    it('should not expand tags when expandRelated is false', async () => {
      const dto = {
        tags: 'database',
        mode: 'OR' as const,
        expandRelated: false,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      const result = await service.search(dto);

      expect(mockExpansionService.expandTags).not.toHaveBeenCalled();
      expect(result.expandedTags).toBeUndefined();
    });
  });

  describe('search - entityType filtering', () => {
    it('should filter by entityType when provided', async () => {
      const dto = {
        tags: 'javascript',
        mode: 'OR' as const,
        entityType: 'source' as const,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.search(dto);

      const aggregateCall = mockAttachmentModel.aggregate.mock.calls[0][0];
      expect(aggregateCall[0].$match.entityType).toBe('source');
    });
  });

  describe('search - pagination', () => {
    it('should apply limit and offset', async () => {
      const dto = {
        tags: 'javascript',
        mode: 'OR' as const,
        limit: 10,
        offset: 20,
      };

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);

      await service.search(dto);

      const aggregateCall = mockAttachmentModel.aggregate.mock.calls[0][0];
      const skipStage = aggregateCall.find((stage: any) => stage.$skip !== undefined);
      const limitStage = aggregateCall.find((stage: any) => stage.$limit !== undefined);

      expect(skipStage.$skip).toBe(20);
      expect(limitStage.$limit).toBe(10);
    });

    it('should return pagination metadata', async () => {
      const dto = {
        tags: 'javascript',
        mode: 'OR' as const,
        limit: 20,
        offset: 0,
      };

      mockAttachmentModel.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 42 }]);

      const result = await service.search(dto);

      expect(result.pagination.total).toBe(42);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.offset).toBe(0);
    });
  });
});
