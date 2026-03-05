import { IsString, IsEnum, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SearchDto {
  @IsString()
  tags: string;

  @IsEnum(['OR', 'AND'])
  mode: 'OR' | 'AND';

  @IsOptional()
  @IsEnum(['source', 'snippet', 'airesponse'])
  entityType?: 'source' | 'snippet' | 'airesponse';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  expandRelated?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  cursor?: string;
}
