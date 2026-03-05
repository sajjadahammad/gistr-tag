import { IsString, IsEnum, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class AttachTagsDto {
  @IsString()
  entityId: string;

  @IsEnum(['source', 'snippet', 'airesponse'])
  entityType: 'source' | 'snippet' | 'airesponse';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags: string[];

  @IsEnum(['system', 'user'])
  source: 'system' | 'user';
}
