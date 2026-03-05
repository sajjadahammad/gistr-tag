# Test Suite

This directory contains all tests for the Gistr Tagging & Search Layer.

## Structure

```
test/
├── unit/                           # Unit tests
│   ├── tag-normalization.service.spec.ts
│   ├── similarity-detection.service.spec.ts
│   ├── tags.service.spec.ts
│   ├── search.service.spec.ts
│   └── entities.service.spec.ts
├── property/                       # Property-based tests
│   ├── tags.service.property.spec.ts
│   ├── search.service.property.spec.ts
│   └── entities.service.property.spec.ts
├── integration/                    # End-to-end tests
│   └── app.e2e.spec.ts
├── performance/                    # Performance tests
│   └── performance.spec.ts
└── generators.ts                   # Test data generators

```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm test -- test/unit
```

### Property-Based Tests Only
```bash
npm test -- test/property
```

### Integration Tests
```bash
npm run test:e2e
```

### Performance Tests
```bash
npm test -- test/performance
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:cov
```

## Test Types

### Unit Tests (`test/unit/`)
- Test individual services in isolation
- Use mocks for dependencies
- Fast execution
- Focus on specific functionality

**Coverage:**
- Tag normalization (8 tests)
- Similarity detection (7 tests)
- Tags service (12 tests)
- Search service (8 tests)
- Entities service (9 tests)

### Property-Based Tests (`test/property/`)
- Test universal properties that should hold for all inputs
- Use `fast-check` library for randomized testing
- Run 50-100 iterations per property
- Validate design document properties

**Coverage:**
- Tag operations (Properties 1-11, 32, 41)
- Search operations (Properties 16-21)
- Soft delete operations (Properties 28-31)

### Integration Tests (`test/integration/`)
- Test complete API workflows
- Use `mongodb-memory-server` for isolated database
- Test all endpoints end-to-end
- Validate request/response formats

**Coverage:**
- All 7 API endpoints
- Validation and error handling
- Database operations
- Transaction behavior

### Performance Tests (`test/performance/`)
- Verify performance requirements
- Test with realistic data volumes
- Measure response times

**Requirements:**
- Search: <200ms for 10K entities
- Concurrent operations: 100 simultaneous attachments
- Analytics: <500ms for 30-day windows

## Test Data Generators

The `generators.ts` file provides reusable test data generators using `fast-check`:

```typescript
import { entityTypeGen, tagLabelGen, attachTagsDtoGen } from './generators';

// Use in tests
fc.assert(
  fc.asyncProperty(
    entityTypeGen,
    tagLabelGen,
    async (entityType, tagLabel) => {
      // Test logic
    }
  )
);
```

Available generators:
- `entityTypeGen` - Valid entity types
- `tagLabelGen` - Valid tag labels (2-50 chars)
- `tagSourceGen` - Tag sources (system/user)
- `searchModeGen` - Search modes (OR/AND)
- `entityIdGen` - MongoDB ObjectId format
- `entityWithTagsGen` - Entity with random tags
- `tagHierarchyGen` - Tag parent-child relationships
- `attachTagsDtoGen` - Complete attach DTO
- `searchDtoGen` - Complete search DTO

## Writing New Tests

### Unit Test Template
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { MyService } from '../../src/path/to/my.service';

describe('MyService', () => {
  let service: MyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MyService],
    }).compile();

    service = module.get<MyService>(MyService);
  });

  it('should do something', () => {
    expect(service.doSomething()).toBe(expected);
  });
});
```

### Property-Based Test Template
```typescript
import * as fc from 'fast-check';
import { tagLabelGen } from '../generators';

// Feature: gistr-tagging-search-layer, Property X: Description
it('property X: description', async () => {
  await fc.assert(
    fc.asyncProperty(
      tagLabelGen,
      async (tagLabel) => {
        // Test logic
        expect(result).toBe(expected);
      }
    ),
    { numRuns: 100 }
  );
});
```

## Debugging Tests

### Run Specific Test File
```bash
npm test -- test/unit/tags.service.spec.ts
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="property"
```

### Debug with Node Inspector
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

### View Coverage Report
```bash
npm run test:cov
# Open coverage/lcov-report/index.html in browser
```

## CI/CD Integration

Tests run automatically in GitHub Actions on every commit:
- Linting
- Unit tests
- Property-based tests
- Integration tests
- Coverage enforcement (80% threshold)

See `.github/workflows/ci.yml` for configuration.

## Best Practices

1. **Keep tests focused** - One concept per test
2. **Use descriptive names** - Test name should explain what's being tested
3. **Mock external dependencies** - Unit tests should be isolated
4. **Test edge cases** - Empty inputs, boundaries, error conditions
5. **Property tests for invariants** - Use property-based tests for universal truths
6. **Integration tests for workflows** - Test complete user journeys
7. **Performance tests for requirements** - Verify SLAs are met

## Troubleshooting

### Tests Timing Out
- Increase timeout in test file: `jest.setTimeout(10000)`
- Or in jest config: `testTimeout: 30000`

### MongoDB Connection Issues
- Integration tests use `mongodb-memory-server` (no external MongoDB needed)
- If issues persist, clear npm cache: `npm cache clean --force`

### Import Path Errors
- All imports from `src/` should use relative paths: `../../src/...`
- Test utilities use relative paths: `../generators`

### Coverage Not Meeting Threshold
- Check which files are uncovered: `npm run test:cov`
- Add tests for uncovered branches
- Exclude files that don't need coverage (DTOs, schemas) in jest.config.js
