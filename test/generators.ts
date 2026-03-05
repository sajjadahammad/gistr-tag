import * as fc from 'fast-check';

// Generate valid entity types
export const entityTypeGen = fc.constantFrom('source', 'snippet', 'airesponse');

// Generate valid tag labels (2-50 chars, will be normalized)
export const tagLabelGen = fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length >= 2);

// Generate tag source
export const tagSourceGen = fc.constantFrom('system', 'user');

// Generate search mode
export const searchModeGen = fc.constantFrom('OR', 'AND');

// Generate entity ID (MongoDB ObjectId format)
export const entityIdGen = fc.hexaString({ minLength: 24, maxLength: 24 });

// Generate entity with random tags (0-20 tags)
export const entityWithTagsGen = fc.record({
  entityId: entityIdGen,
  entityType: entityTypeGen,
  tags: fc.array(tagLabelGen, { minLength: 0, maxLength: 20 }),
});

// Generate tag hierarchy (parent-child relationships)
export const tagHierarchyGen = fc.array(
  fc.record({
    label: tagLabelGen,
    parentLabel: fc.option(tagLabelGen, { nil: null }),
  }),
  { minLength: 1, maxLength: 10 }
);

// Generate attach tags DTO
export const attachTagsDtoGen = fc.record({
  entityId: entityIdGen,
  entityType: entityTypeGen,
  tags: fc.array(tagLabelGen, { minLength: 1, maxLength: 20 }),
  source: tagSourceGen,
});

// Generate search DTO
export const searchDtoGen = fc.record({
  tags: fc.array(tagLabelGen, { minLength: 1, maxLength: 5 }).map(tags => tags.join(',')),
  mode: searchModeGen,
  expandRelated: fc.boolean(),
  limit: fc.integer({ min: 1, max: 100 }),
  offset: fc.integer({ min: 0, max: 1000 }),
});
