import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './services/search.service';
import { SearchDto } from './dto/search.dto';

@Controller('entities')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search')
  async search(@Query() dto: SearchDto) {
    return this.searchService.search(dto);
  }
}
