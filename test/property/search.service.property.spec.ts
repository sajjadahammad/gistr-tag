import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as fc from 'fast-check';
import { SearchService } from '../../src/search/services/search.service';
import { TagAttachment } from '../../src/schemas/tag-attachment.schema';
import { TagExpansionService } from '../../src/search/services/tag-expansion.service';
import { EntityHydrationService } from '../../src/search/services/entity-hydration.service';
import { PaginationService } from '../../src/search/services/pagination.service';
import { TagNormalizationService } from '../../src/tags/services/tag-normalization.service';
import { searchDtoGen, tagLabelGen } from '../generators';

describe('SearchService - Property-Based Tests', () => {
  let service: SearchService;
  let mockAttachmentModel: any;
  let mockExpansionService: any;
  let mockHydrationService: any;
  let mockPaginationService: any;
  let normalizationService: TagNormalizationService;

  beforeEach(async () => {
    mockAttachmentModel = {
      aggregate: jest.fn(),
    };

    mockExpansionService = {
      expandTags: jest.fn((tags) => Promise.resolve([...tags, 'expanded-tag'])),
    };

    mockHydrationService = {
      hydrate: jest.fn((attachments) => Promise.resolve(attachments.map((a: any) => ({
        ...a,
        data: { title: 'Test' },
      })))),
    };

    mockPaginationService = {
      getPaginationStrategy: jest.fn(() => 'offset'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        TagNormalizationService,
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
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    normalizationService = module.get<TagNormalizationService>(TagNormalizationService);
  });

  // Feature: gistr-tagging-search-layer, Property 16: OR Search Mode
  it('property 16: OR search mode returns entities with at least one tag', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tagLabelGen, { minLength: 1, maxLength: 3 }),
        async (tags) => {
          mockAttachmentModel.aggregate
            .mockResolvedValueOnce([
              { entityId: 'e1', entityType: 'source', tags: [tags[0]] },
            ])
            .mockResolvedValueOnce([{ total: 1 }]);

          const result = await service.search({
            tags: tags.join(','),
            mode: 'OR',
            limit: 20,
            offset: 0,
          });

          // Should call aggregate with OR logic
          const aggregateCall = mockAttachmentModel.aggregate.mock.calls[0][0];
          expect(aggregateCall[0].$match.tagLabel.$in).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 17: AND Search Mode
  it('property 17: AND search mode returns entities with all tags', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(tagLabelGen, { minLength: 2, maxLength: 3 }),
        async (tags) => {
          mockAttachmentModel.aggregate
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

          await service.search({
            tags: tags.join(','),
            mode: 'AND',
            limit: 20,
            offset: 0,
          });

          // Should filter by tagCount
          const aggregateCall = mockAttachmentModel.aggregate.mock.calls[0][0];
          const matchStage = aggregateCall.find((s: any) => s.$match?.tagCount);
          expect(matchStage.$match.tagCount).toBe(tags.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 18: Search Pagination Accuracy
  it('property 18: search pagination accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        tagLabelGen,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        async (tag, limit, offset) => {
          mockAttachmentModel.aggregate
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 42 }]);

          const result = await service.search({
            tags: tag,
            mode: 'OR',
            limit,
            offset,
          });

          expect(result.pagination.limit).toBe(limit);
          expect(result.pagination.offset).toBe(offset);
          expect(result.pagination.total).toBe(42);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 19: Related Tag Expansion in Search
  it('property 19: related tag expansion in search', async () => {
    await fc.assert(
      fc.asyncProperty(
        tagLabelGen,
        async (tag) => {
          mockAttachmentModel.aggregate
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

          const result = await service.search({
            tags: tag,
            mode: 'OR',
            expandRelated: true,
            limit: 20,
            offset: 0,
          });

          expect(mockExpansionService.expandTags).toHaveBeenCalled();
          expect(result.expandedTags).toBeDefined();
          expect(result.expandedTags!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 20: No Expansion Without Flag
  it('property 20: no expansion without flag', async () => {
    await fc.assert(
      fc.asyncProperty(
        tagLabelGen,
        async (tag) => {
          mockAttachmentModel.aggregate
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ total: 0 }]);

          const result = await service.search({
            tags: tag,
            mode: 'OR',
            expandRelated: false,
            limit: 20,
            offset: 0,
          });

          expect(mockExpansionService.expandTags).not.toHaveBeenCalled();
          expect(result.expandedTags).toBeUndefined();
        }
      ),
      { numRuns: 50 }
    );
  });

  // Feature: gistr-tagging-search-layer, Property 21: Entity Hydration Completeness
  it('property 21: entity hydration completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        tagLabelGen,
        async (tag) => {
          mockAttachmentModel.aggregate
            .mockResolvedValueOnce([
              { entityId: 'e1', entityType: 'source', tags: [tag] },
            ])
            .mockResolvedValueOnce([{ total: 1 }]);

          const result = await service.search({
            tags: tag,
            mode: 'OR',
            limit: 20,
            offset: 0,
          });

          expect(mockHydrationService.hydrate).toHaveBeenCalled();
          expect(result.entities[0].data).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});
