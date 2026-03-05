import { connect, connection } from 'mongoose';
import { TagSchema } from '../schemas/tag.schema';
import { TagAttachmentSchema } from '../schemas/tag-attachment.schema';
import { SourceSchema } from '../schemas/source.schema';
import { SnippetSchema } from '../schemas/snippet.schema';
import { AIResponseSchema } from '../schemas/airesponse.schema';

async function seed() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gistr';
  
  await connect(mongoUri);
  console.log('Connected to MongoDB');

  // Clear existing data
  await connection.db.dropDatabase();
  console.log('Database cleared');

  // Create tags with hierarchy
  const tags = [
    { label: 'database', usageCount: 5, entityTypeCounts: { source: 2, snippet: 2, airesponse: 1 }, isApproved: true, lastUsedAt: new Date() },
    { label: 'mongodb', usageCount: 4, entityTypeCounts: { source: 2, snippet: 1, airesponse: 1 }, isApproved: true, lastUsedAt: new Date(), parentLabel: 'database' },
    { label: 'postgresql', usageCount: 2, entityTypeCounts: { source: 1, snippet: 1, airesponse: 0 }, isApproved: false, lastUsedAt: new Date(), parentLabel: 'database' },
    { label: 'redis', usageCount: 1, entityTypeCounts: { source: 1, snippet: 0, airesponse: 0 }, isApproved: false, lastUsedAt: new Date(), parentLabel: 'database' },
    { label: 'nosql', usageCount: 2, entityTypeCounts: { source: 1, snippet: 1, airesponse: 0 }, isApproved: false, lastUsedAt: new Date(), parentLabel: 'database' },
    { label: 'performance', usageCount: 4, entityTypeCounts: { source: 1, snippet: 2, airesponse: 1 }, isApproved: true, lastUsedAt: new Date() },
    { label: 'indexing', usageCount: 3, entityTypeCounts: { source: 1, snippet: 1, airesponse: 1 }, isApproved: true, lastUsedAt: new Date() },
    { label: 'backend', usageCount: 3, entityTypeCounts: { source: 2, snippet: 1, airesponse: 0 }, isApproved: true, lastUsedAt: new Date() },
    { label: 'interview-prep', usageCount: 2, entityTypeCounts: { source: 0, snippet: 2, airesponse: 0 }, isApproved: false, lastUsedAt: new Date() },
  ];

  const TagModel = connection.model('Tag', TagSchema);
  await TagModel.insertMany(tags);
  console.log('Tags created');

  // Create sources
  const sources = [
    {
      title: 'MongoDB Performance Tuning Guide',
      url: 'https://youtube.com/watch?v=example1',
      description: 'Comprehensive guide on MongoDB indexing and performance optimization',
      isDeleted: false,
    },
    {
      title: 'Building Scalable Backend Systems',
      url: 'https://youtube.com/watch?v=example2',
      description: 'Architecture patterns for scalable backend development',
      isDeleted: false,
    },
  ];

  const SourceModel = connection.model('Source', SourceSchema);
  const createdSources = await SourceModel.insertMany(sources);
  console.log('Sources created');

  // Create snippets
  const snippets = [
    {
      content: 'MongoDB compound indexes should place equality filters first, then sort fields, then range filters',
      sourceId: createdSources[0]._id.toString(),
      notes: 'Key insight for query optimization',
      isDeleted: false,
    },
    {
      content: 'Use connection pooling to reduce database connection overhead in high-traffic applications',
      sourceId: createdSources[1]._id.toString(),
      notes: 'Performance best practice',
      isDeleted: false,
    },
  ];

  const SnippetModel = connection.model('Snippet', SnippetSchema);
  const createdSnippets = await SnippetModel.insertMany(snippets);
  console.log('Snippets created');

  // Create AI responses
  const aiResponses = [
    {
      question: 'What are the best practices for MongoDB indexing?',
      answer: 'MongoDB indexing best practices include: 1) Create indexes on frequently queried fields, 2) Use compound indexes for multi-field queries, 3) Monitor index usage with explain(), 4) Avoid over-indexing as it impacts write performance',
      context: 'Database optimization discussion',
      isDeleted: false,
    },
  ];

  const AIResponseModel = connection.model('AIResponse', AIResponseSchema);
  const createdAIResponses = await AIResponseModel.insertMany(aiResponses);
  console.log('AI Responses created');

  // Create tag attachments
  const attachments = [
    // Source 1 tags
    { entityId: createdSources[0]._id.toString(), entityType: 'source', tagLabel: 'mongodb', source: 'system', isDeleted: false },
    { entityId: createdSources[0]._id.toString(), entityType: 'source', tagLabel: 'database', source: 'system', isDeleted: false },
    { entityId: createdSources[0]._id.toString(), entityType: 'source', tagLabel: 'indexing', source: 'system', isDeleted: false },
    { entityId: createdSources[0]._id.toString(), entityType: 'source', tagLabel: 'performance', source: 'system', isDeleted: false },
    
    // Source 2 tags
    { entityId: createdSources[1]._id.toString(), entityType: 'source', tagLabel: 'backend', source: 'system', isDeleted: false },
    { entityId: createdSources[1]._id.toString(), entityType: 'source', tagLabel: 'database', source: 'system', isDeleted: false },
    { entityId: createdSources[1]._id.toString(), entityType: 'source', tagLabel: 'mongodb', source: 'system', isDeleted: false },
    
    // Snippet 1 tags
    { entityId: createdSnippets[0]._id.toString(), entityType: 'snippet', tagLabel: 'mongodb', source: 'user', isDeleted: false },
    { entityId: createdSnippets[0]._id.toString(), entityType: 'snippet', tagLabel: 'indexing', source: 'user', isDeleted: false },
    { entityId: createdSnippets[0]._id.toString(), entityType: 'snippet', tagLabel: 'performance', source: 'user', isDeleted: false },
    { entityId: createdSnippets[0]._id.toString(), entityType: 'snippet', tagLabel: 'interview-prep', source: 'user', isDeleted: false },
    
    // Snippet 2 tags
    { entityId: createdSnippets[1]._id.toString(), entityType: 'snippet', tagLabel: 'database', source: 'user', isDeleted: false },
    { entityId: createdSnippets[1]._id.toString(), entityType: 'snippet', tagLabel: 'performance', source: 'user', isDeleted: false },
    { entityId: createdSnippets[1]._id.toString(), entityType: 'snippet', tagLabel: 'backend', source: 'user', isDeleted: false },
    { entityId: createdSnippets[1]._id.toString(), entityType: 'snippet', tagLabel: 'interview-prep', source: 'user', isDeleted: false },
    
    // AI Response tags
    { entityId: createdAIResponses[0]._id.toString(), entityType: 'airesponse', tagLabel: 'mongodb', source: 'system', isDeleted: false },
    { entityId: createdAIResponses[0]._id.toString(), entityType: 'airesponse', tagLabel: 'database', source: 'system', isDeleted: false },
    { entityId: createdAIResponses[0]._id.toString(), entityType: 'airesponse', tagLabel: 'indexing', source: 'system', isDeleted: false },
    { entityId: createdAIResponses[0]._id.toString(), entityType: 'airesponse', tagLabel: 'performance', source: 'system', isDeleted: false },
  ];

  const TagAttachmentModel = connection.model('TagAttachment', TagAttachmentSchema);
  await TagAttachmentModel.insertMany(attachments);
  console.log('Tag attachments created');

  console.log('\nSeed data summary:');
  console.log(`- ${tags.length} tags created`);
  console.log(`- ${sources.length} sources created`);
  console.log(`- ${snippets.length} snippets created`);
  console.log(`- ${aiResponses.length} AI responses created`);
  console.log(`- ${attachments.length} tag attachments created`);

  await connection.close();
  console.log('\nDatabase seeded successfully!');
}

seed().catch(console.error);
