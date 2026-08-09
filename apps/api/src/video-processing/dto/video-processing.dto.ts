import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { VideoOutputPreset } from '../video-processing.types';

export class SourceVideoDto {
  @IsString()
  @IsNotEmpty()
  sourcePath!: string;
}

export class CreateThumbnailDto extends SourceVideoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7200)
  timestampSeconds?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([320, 480, 640, 720, 1080])
  width?: number = 720;
}

export class TranscodeVideoDto extends SourceVideoDto {
  @IsOptional()
  @IsIn(['social-vertical', 'social-square', 'social-landscape'])
  preset?: VideoOutputPreset = 'social-vertical';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([18, 20, 23, 28])
  crf?: number = 23;
}

export class CleanupVideoAssetsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(7 * 24 * 60 * 60)
  olderThanSeconds?: number;
}
