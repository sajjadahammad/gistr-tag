import { Injectable } from '@nestjs/common';

@Injectable()
export class PaginationService {
  getPaginationStrategy(total: number): 'offset' | 'keyset' {
    return total > 10000 ? 'keyset' : 'offset';
  }

  applyOffsetPagination(pipeline: any[], limit: number, offset: number): any[] {
    return [
      ...pipeline,
      { $skip: offset },
      { $limit: limit },
    ];
  }

  applyKeysetPagination(pipeline: any[], limit: number, cursor?: string): any[] {
    if (cursor) {
      pipeline.push({
        $match: {
          '_id': { $gt: cursor },
        },
      });
    }
    
    return [
      ...pipeline,
      { $limit: limit },
    ];
  }

  generateCursor(lastEntity: any): string {
    return lastEntity._id.toString();
  }
}
