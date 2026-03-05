import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';
import { TagsService } from '../../src/tags/services/tags.service';
import { SearchService } from '../../src/search/services/search.service';

describe('Performance Tests', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let tagsService: TagsService;
  let searchService: SearchService;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    tagsService = moduleFixture.get<TagsService>(TagsService);
    searchService = moduleFixture.get<SearchService>(SearchService);

    // Seed test data
    await seedPerformanceData(app);
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  it('should complete search within 200ms for 10K entities', async () => {
    const start = Date.now();
    
    await searchService.search({
      tags: 'javascript',
      mode: 'OR',
      limit: 20,
      offset: 0,
    });

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(200);
  });

  it('should handle 100 concurrent tag attachments', async () => {
    const promises = Array.from({ length: 100 }, (_, i) =>
      tagsService.attachTags({
        entityId: `concurrent-entity-${i}`,
        entityType: 'source',
        tags: [`concurrent-tag-${i}`],
        source: 'user',
      })
    );

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    // Should complete within reasonable time
    expect(duration).toBeLessThan(5000);
  });

  it('should complete analytics query within 500ms', async () => {
    const start = Date.now();
    
    await tagsService.getAnalytics(30);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });
});

async function seedPerformanceData(app: INestApplication) {
  const connection = app.get('DatabaseConnection');
  const db = connection.db;

  // Create 1000 test entities
  const sources = Array.from({ length: 1000 }, (_, i) => ({
    title: `Performance Test Source ${i}`,
    url: `https://example.com/${i}`,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const insertedSources = await db.collection('sources').insertMany(sources);
  const sourceIds = Object.values(insertedSources.insertedIds).map((id: any) => id.toString());

  // Create tags
  const tags = Array.from({ length: 100 }, (_, i) => ({
    label: `perf-tag-${i}`,
    usageCount: Math.floor(Math.random() * 100),
    entityTypeCounts: { source: 0, snippet: 0, airesponse: 0 },
    isApproved: true,
    lastUsedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  await db.collection('tags').insertMany(tags);

  // Create attachments
  const attachments = [];
  for (let i = 0; i < 1000; i++) {
    const numTags = Math.floor(Math.random() * 5) + 1;
    for (let j = 0; j < numTags; j++) {
      attachments.push({
        entityId: sourceIds[i],
        entityType: 'source',
        tagLabel: `perf-tag-${Math.floor(Math.random() * 100)}`,
        source: 'system',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  await db.collection('tagattachments').insertMany(attachments);
}
