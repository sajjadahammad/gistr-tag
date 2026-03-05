import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';

describe('Gistr Tagging & Search Layer (e2e)', () => {
  let app: INestApplication;
  let mongoServer: MongoMemoryServer;
  let sourceId: string;
  let snippetId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongoUri),
        AppModule,
      ],
    })
      .overrideModule(AppModule)
      .useModule(AppModule)
      .compile();

    app = moduleFixture.createNestApplication();
    
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Create test entities
    const connection = moduleFixture.get('DatabaseConnection');
    const db = connection.db;
    
    const sourcesCollection = db.collection('sources');
    const snippetsCollection = db.collection('snippets');
    
    const source = await sourcesCollection.insertOne({
      title: 'Test Source',
      url: 'https://example.com',
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    sourceId = source.insertedId.toString();

    const snippet = await snippetsCollection.insertOne({
      content: 'Test snippet content',
      sourceId: sourceId,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    snippetId = snippet.insertedId.toString();
  });

  afterAll(async () => {
    await app.close();
    await mongoServer.stop();
  });

  describe('POST /tags/attach', () => {
    it('should attach tags to an entity', () => {
      return request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: sourceId,
          entityType: 'source',
          tags: ['javascript', 'nodejs'],
          source: 'user',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.attached).toContain('javascript');
          expect(res.body.attached).toContain('nodejs');
        });
    });

    it('should return warnings for similar tags', async () => {
      // First attach a tag
      await request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: sourceId,
          entityType: 'source',
          tags: ['typescript'],
          source: 'user',
        });

      // Promote it
      await request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: snippetId,
          entityType: 'snippet',
          tags: ['typescript'],
          source: 'user',
        });

      await request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: sourceId,
          entityType: 'source',
          tags: ['typescript'],
          source: 'system',
        });

      // Now attach similar tag
      return request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: snippetId,
          entityType: 'snippet',
          tags: ['typescrip'],
          source: 'user',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.warnings).toBeDefined();
        });
    });

    it('should reject invalid entity type', () => {
      return request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: sourceId,
          entityType: 'invalid',
          tags: ['test'],
          source: 'user',
        })
        .expect(400);
    });

    it('should reject empty tags array', () => {
      return request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: sourceId,
          entityType: 'source',
          tags: [],
          source: 'user',
        })
        .expect(400);
    });

    it('should enforce 20-tag limit', async () => {
      const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
      
      await request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: snippetId,
          entityType: 'snippet',
          tags,
          source: 'user',
        })
        .expect(201);

      return request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: snippetId,
          entityType: 'snippet',
          tags: ['extra-tag'],
          source: 'user',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('Maximum of 20 tags');
        });
    });
  });

  describe('GET /tags', () => {
    it('should list all tags', () => {
      return request(app.getHttpServer())
        .get('/tags')
        .expect(200)
        .expect((res) => {
          expect(res.body.tags).toBeDefined();
          expect(Array.isArray(res.body.tags)).toBe(true);
        });
    });

    it('should sort tags by usage count', () => {
      return request(app.getHttpServer())
        .get('/tags')
        .expect(200)
        .expect((res) => {
          const tags = res.body.tags;
          for (let i = 1; i < tags.length; i++) {
            expect(tags[i - 1].usageCount).toBeGreaterThanOrEqual(tags[i].usageCount);
          }
        });
    });
  });

  describe('GET /tags/analytics', () => {
    it('should return analytics for default 30 days', () => {
      return request(app.getHttpServer())
        .get('/tags/analytics')
        .expect(200)
        .expect((res) => {
          expect(res.body.tags).toBeDefined();
          expect(res.body.timeWindow).toBeDefined();
          expect(res.body.timeWindow.days).toBe(30);
        });
    });

    it('should return analytics for custom days', () => {
      return request(app.getHttpServer())
        .get('/tags/analytics?days=14')
        .expect(200)
        .expect((res) => {
          expect(res.body.timeWindow.days).toBe(14);
        });
    });

    it('should reject invalid days parameter', () => {
      return request(app.getHttpServer())
        .get('/tags/analytics?days=400')
        .expect(400);
    });
  });

  describe('GET /entities/search', () => {
    it('should search with OR mode', () => {
      return request(app.getHttpServer())
        .get('/entities/search?tags=javascript&mode=OR')
        .expect(200)
        .expect((res) => {
          expect(res.body.entities).toBeDefined();
          expect(res.body.pagination).toBeDefined();
        });
    });

    it('should search with AND mode', () => {
      return request(app.getHttpServer())
        .get('/entities/search?tags=javascript,nodejs&mode=AND')
        .expect(200)
        .expect((res) => {
          expect(res.body.entities).toBeDefined();
        });
    });

    it('should filter by entity type', () => {
      return request(app.getHttpServer())
        .get('/entities/search?tags=javascript&mode=OR&entityType=source')
        .expect(200)
        .expect((res) => {
          const entities = res.body.entities;
          entities.forEach((entity: any) => {
            expect(entity.entityType).toBe('source');
          });
        });
    });

    it('should respect pagination', () => {
      return request(app.getHttpServer())
        .get('/entities/search?tags=javascript&mode=OR&limit=1&offset=0')
        .expect(200)
        .expect((res) => {
          expect(res.body.entities.length).toBeLessThanOrEqual(1);
          expect(res.body.pagination.limit).toBe(1);
        });
    });

    it('should reject invalid mode', () => {
      return request(app.getHttpServer())
        .get('/entities/search?tags=javascript&mode=INVALID')
        .expect(400);
    });

    it('should reject limit > 100', () => {
      return request(app.getHttpServer())
        .get('/entities/search?tags=javascript&mode=OR&limit=101')
        .expect(400);
    });
  });

  describe('DELETE /tags/detach/:entityType/:entityId/:tagLabel', () => {
    it('should detach a tag', async () => {
      // First attach a tag
      await request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: sourceId,
          entityType: 'source',
          tags: ['detach-test'],
          source: 'user',
        });

      return request(app.getHttpServer())
        .delete(`/tags/detach/source/${sourceId}/detach-test`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });

    it('should return 404 for non-existent attachment', () => {
      return request(app.getHttpServer())
        .delete(`/tags/detach/source/${sourceId}/nonexistent`)
        .expect(404);
    });
  });

  describe('DELETE /entities/:entityType/:entityId', () => {
    it('should soft-delete entity and clean up tags', async () => {
      // Create a new entity for deletion
      const connection = app.get('DatabaseConnection');
      const db = connection.db;
      const sourcesCollection = db.collection('sources');
      
      const source = await sourcesCollection.insertOne({
        title: 'Delete Test',
        url: 'https://example.com/delete',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const deleteSourceId = source.insertedId.toString();

      // Attach tags
      await request(app.getHttpServer())
        .post('/tags/attach')
        .send({
          entityId: deleteSourceId,
          entityType: 'source',
          tags: ['delete-tag1', 'delete-tag2'],
          source: 'user',
        });

      // Delete entity
      return request(app.getHttpServer())
        .delete(`/entities/source/${deleteSourceId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.cleanedTags).toBe(2);
        });
    });

    it('should return 404 for non-existent entity', () => {
      return request(app.getHttpServer())
        .delete('/entities/source/000000000000000000000000')
        .expect(404);
    });
  });
});
