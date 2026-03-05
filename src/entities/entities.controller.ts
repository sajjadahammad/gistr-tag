import { Controller, Delete, Param } from '@nestjs/common';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @Delete(':entityType/:entityId')
  async softDelete(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.entitiesService.softDelete(entityType, entityId);
  }
}
