import { Controller, Post, Delete, Get, Body, Param, Query } from '@nestjs/common';
import { TagsService } from './services/tags.service';
import { AttachTagsDto } from './dto/attach-tags.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post('attach')
  async attachTags(@Body() dto: AttachTagsDto) {
    return this.tagsService.attachTags(dto);
  }

  @Delete('detach/:entityType/:entityId/:tagLabel')
  async detachTag(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Param('tagLabel') tagLabel: string,
  ) {
    await this.tagsService.detachTag(entityType, entityId, tagLabel);
    return { success: true, message: 'Tag detached successfully' };
  }

  @Get('related/:label')
  async getRelatedTags(@Param('label') label: string) {
    return this.tagsService.getRelatedTags(label);
  }

  @Get('analytics')
  async getAnalytics(@Query('days') days?: string) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.tagsService.getAnalytics(daysNum);
  }

  @Get()
  async listTags() {
    const tags = await this.tagsService.listTags();
    return { tags };
  }
}
