# Gistr — Tagging & Search Layer

A polymorphic tag engine for Gistr's knowledge management system, built with NestJS, TypeScript, and MongoDB.

## Quick Start

```bash
cp .env.example .env          # set MONGODB_URI if not localhost
npm install
npm run seed                  # populate seed data
npm run start:dev             # start dev server on :3000
npm test                      # run unit tests
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /tags/attach | Attach tags to any entity (idempotent) |
| DELETE | /tags/detach/:entityType/:entityId/:tagLabel | Remove a tag from an entity |
| GET | /tags/analytics?days=30 | Tag usage analytics |
| GET | /tags/related/:label | Related tags via hierarchy |
| GET | /tags | All tags sorted by usage |
| GET | /entities/search | Polymorphic tag-based search |
| DELETE | /entities/:entityType/:entityId | Soft-delete entity + cleanup |

## Sample Requests

### Attach system-generated tags (simulating YouTube API response)
```bash
curl -X POST http://localhost:3000/tags/attach \
  -H "Content-Type: application/json" \
  -d '{"entityId":"<sourceId>","entityType":"source","tags":["mongodb","database","indexing","backend"],"source":"system"}'
```

### Search: any entity tagged "database" (OR mode, default)
```bash
curl "http://localhost:3000/entities/search?tags=database&mode=OR"
```

### Search: snippets with BOTH "mongodb" AND "performance"
```bash
curl "http://localhost:3000/entities/search?tags=mongodb,performance&mode=AND&entityType=snippet"
```

### Search "database" and automatically expand to sibling tags
```bash
curl "http://localhost:3000/entities/search?tags=database&mode=OR&expandRelated=true"
```

### Analytics: top tags in the last 14 days
```bash
curl "http://localhost:3000/tags/analytics?days=14"
```

### Related tags for "mongodb"
```bash
curl "http://localhost:3000/tags/related/mongodb"
```

## Schema Design

### Why three collections?

- **tags** — one document per unique label; stores counts + hierarchy
- **tagattachments** — polymorphic join table between tags and any entity
- **sources** — content entities
- **snippets** — user highlights
- **airesponses** — AI-generated answers

### The polymorphic join table (tagattachments)

The alternative — embedding a `tags: string[]` array inside each entity — is simpler but breaks down in three ways:

1. **Extensibility**: A new entity type (Collection, Playlist) would require the same tag-query logic reimplemented in each new collection. The join table needs zero changes.

2. **Analytics**: `GROUP BY tagLabel` across all entity types is a single aggregation pipeline. With embedded arrays you'd need a `$unionWith` fan-out across N collections.

3. **Cleanup**: Soft-deleting an entity's tags means one `updateMany` on attachments, not a `$pull` operation that modifies entity documents directly.

The `source` field on each attachment records whether it came from the system (YouTube API) or the user — satisfying the dual-origin tagging requirement cleanly.

### Tag document design

```typescript
{
  label: string           // unique, lowercase — primary lookup key
  usageCount: number      // flat total — O(1) analytics reads
  entityTypeCounts: {}    // flexible Map — new entity types, no migration
  isApproved: boolean     // promotion threshold flag
  lastUsedAt: Date        // powers "top tags last N days"
  parentLabel?: string    // hierarchy for related-tag surfacing
}
```

`entityTypeCounts` is stored as a plain object rather than a typed sub-document so that adding `entityTypeCounts.collection: 4` for a new entity type requires no schema migration — Mongoose writes it as-is.

## How Tag Search Works Internally

### Phase 1 — Tag resolution

Normalise the input tags (lowercase, trim, deduplicate). If `expandRelated=true`, query the tag hierarchy: every searched tag's siblings and parent are added to the effective tag set.

```
User searches: "database"
After expansion: ["database", "mongodb", "postgresql", "redis", "nosql"]
```

### Phase 2 — Attachment-layer aggregation

A `$group` over `tagattachments` groups by `(entityId, entityType)` and collects matched tag labels per group. This runs against the compound index `(tagLabel, entityType, isDeleted)`.

- **OR mode**: all groups that appear in the result (matched ≥ 1 tag)
- **AND mode**: filter groups where `matchedTags` contains all requested tags (`$all` operator)

Pagination (`$skip`/`$limit`) happens here — before entity hydration — so we only fetch the page-sized slice of entity IDs, not the entire matching set.

### Phase 3 — Entity hydration

The `(entityId, entityType)` pairs from Phase 2 are grouped by type. For each type, a single `_id: { $in: ids }` query fetches the documents. `_id` is always the primary index — O(1) per document.

Each hydrated document is annotated with `entityType` so the client knows what it received.

## Tag Explosion Prevention

### Strategy implemented: Dual-layer prevention

**Layer 1 — Per-entity tag cap (MAX_TAGS_PER_ENTITY = 20)**

Enforced before any DB write. Returns a clear error explaining how many slots remain. Prevents a single entity from accumulating infinite tags.

**Layer 2 — Promotion threshold (TAG_APPROVAL_THRESHOLD = 3)**

A tag is created with `isApproved: false`. Once its `usageCount` reaches 3, `isApproved` flips to true atomically. Unapproved tags are:

- Still searchable (we don't want to lose data)
- Excluded from related-tag graph traversal (they haven't proven utility)
- Visually de-emphasised in the UI (API returns the flag; UI decides presentation)

**Layer 3 — Levenshtein similar-tag warnings**

On every attach, the service checks the submitted label against all approved tags. If any are within edit distance 2, the response includes a `warnings` array:

```json
{
  "attached": ["javascrpt"],
  "skipped": [],
  "warnings": [{ "submitted": "javascrpt", "similar": ["javascript"] }]
}
```

The attach still succeeds — this is a warning, not a block. The UI can prompt: "Did you mean 'javascript'?"

## Index Strategy

### tags collection

| Index | Query supported | Trade-off |
|-------|----------------|-----------|
| `{ label: 1 }` (unique) | Tag lookup by label; upsert on attach | Write overhead on every tag create |
| `{ lastUsedAt: -1, usageCount: -1 }` | Top tags in date window (analytics) | Adds ~40 bytes per document |
| `{ parentLabel: 1 }` | Sibling lookup for related-tag expansion | Low cardinality if hierarchy is shallow |

### tagattachments collection

| Index | Query supported | Trade-off |
|-------|----------------|-----------|
| `{ entityId, entityType, tagLabel }` (unique) | Idempotency guard; "all tags for entity X" | Most expensive write-side index; worth it for correctness |
| `{ tagLabel, isDeleted }` | Search Phase 2 — primary search index | High-read index; maintained on every attach |
| `{ entityId, isDeleted }` | Soft-delete cleanup sweep | Needed for cleanup performance |
| `{ createdAt: -1, tagLabel }` | Analytics date-range window | Large collection — this index is critical for analytics |

### Read vs. write trade-offs

Attach (POST /tags/attach) writes to 4 indexes on `tagattachments` and 2 on `tags`. This is deliberate — attaching is less frequent than searching. The trade-off: every additional index slows writes by ~10–15% but speeds reads dramatically. For a knowledge management system where users read far more than they write, this is the right direction.

## Concurrency & Idempotency

The unique compound index `(entityId, entityType, tagLabel)` on `tagattachments` is the atomic guard. Two simultaneous attach requests for the same tag race to the same index. MongoDB's document-level locking means exactly one succeeds; the other receives E11000 (duplicate key). The service catches E11000 and returns the tag in the `skipped` array — the client sees a 200 with the same result as if the tag was already there.

No application-level locking, no distributed mutex. The DB enforces correctness.

## Soft Delete & Tag Cleanup

### Entity deletion flow

```
DELETE /entities/:type/:id
  → Start MongoDB session
  → Mark entity isDeleted=true
  → Find all active tag attachments for entity
  → Bulk-mark attachments isDeleted=true
  → bulkWrite $inc -1 on affected Tag.usageCount values
  → Commit session
```

The Tag document is never deleted — other entities may reference it, and removing it would break the tag graph and analytics history.

### Sync vs. async cleanup

Cleanup is synchronous (within the same transaction). Rationale: tag count updates are lightweight integer operations. Synchronous cleanup keeps analytics immediately consistent — a deleted entity stops contributing to counts in the same request.

## Project Structure

```
src/
├── main.ts                 # Application entry point
├── app.module.ts           # Root module
├── common/
│   └── filters/
│       └── http-exception.filter.ts  # Global error handling
├── schemas/                # Mongoose schemas
│   ├── tag.schema.ts
│   ├── tag-attachment.schema.ts
│   ├── source.schema.ts
│   ├── snippet.schema.ts
│   └── airesponse.schema.ts
├── tags/                   # Tags module
│   ├── tags.module.ts
│   ├── tags.controller.ts
│   ├── dto/
│   │   └── attach-tags.dto.ts
│   └── services/
│       ├── tags.service.ts
│       ├── tag-normalization.service.ts
│       └── similarity-detection.service.ts
├── search/                 # Search module
│   ├── search.module.ts
│   ├── search.controller.ts
│   ├── dto/
│   │   └── search.dto.ts
│   └── services/
│       ├── search.service.ts
│       ├── tag-expansion.service.ts
│       ├── entity-hydration.service.ts
│       └── pagination.service.ts
├── entities/               # Entities module
│   ├── entities.module.ts
│   ├── entities.controller.ts
│   └── entities.service.ts
└── seed/                   # Seed data script
    └── seed.ts

test/                       # Centralized test directory
├── unit/                   # Unit tests
├── property/               # Property-based tests
├── integration/            # End-to-end tests
├── performance/            # Performance tests
└── generators.ts           # Test data generators
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Run tests
npm test

# Run tests with coverage
npm run test:cov

# Build for production
npm run build

# Start production server
npm run start:prod
```

## Seed Data Generation

The seed script (`src/seed/seed.ts`) populates the database with realistic test data for development and testing.

### Approach

The seed data was generated using AI assistance (ChatGPT) with the following prompt:

> "Generate realistic seed data for a knowledge management system with the following structure:
> - 10 sources (YouTube-style content with title, URL, description)
> - 8 snippets (user highlights from sources)
> - 6 AI responses (generated answers)
> - Tags with hierarchical relationships (parent-child)
> - Tag attachments from both system and user sources
> 
> Ensure data is realistic, diverse, and demonstrates the polymorphic tagging system."

### Manual Adjustments

The following adjustments were made to the AI-generated data:

1. **Tag hierarchy structure** — Organized tags into meaningful parent-child relationships:
   - `database` → parent for `mongodb`, `postgresql`, `redis`
   - `backend` → parent for `nodejs`, `python`, `java`
   - `frontend` → parent for `javascript`, `react`, `vue`

2. **Dual-origin tagging** — Ensured realistic mix of tag sources:
   - System-generated tags (simulating YouTube API extraction): 60% of attachments
   - User-added tags: 40% of attachments

3. **Tag distribution** — Adjusted tag counts to demonstrate:
   - Approved tags (usageCount ≥ 3): core technical tags
   - Unapproved tags (usageCount < 3): emerging or niche tags
   - Realistic usage patterns across entity types

4. **Entity metadata** — Enhanced with realistic details:
   - Sources: Added publication dates, view counts, channel names
   - Snippets: Added context about which source they came from
   - AI Responses: Added confidence scores and generation timestamps

5. **Timestamp distribution** — Spread creation dates across 30 days to enable meaningful analytics queries

### Running the Seed Script

```bash
npm run seed
```

This will:
1. Connect to MongoDB (using MONGODB_URI from .env or localhost default)
2. Clear existing data (optional, can be modified)
3. Create all schemas with indexes
4. Insert seed documents
5. Display summary of inserted data

The seed data is idempotent — running it multiple times won't create duplicates due to unique indexes on tags and tag attachments.

## Environment Variables

Create a `.env` file based on `.env.example`:

```
MONGODB_URI=mongodb://localhost:27017/gistr
PORT=3000
```
