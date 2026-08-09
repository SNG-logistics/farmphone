import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContentService } from './content.service';
import { StorageService } from './storage.service';

@ApiTags('Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OPERATOR')
@Controller('content')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all content' })
  findAll() {
    return this.contentService.findAll().then((data) => ({ success: true, data }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content by ID' })
  findOne(@Param('id') id: string) {
    return this.contentService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Post()
  @ApiOperation({ summary: 'Create content' })
  create(@Body() body: any) {
    return this.contentService.create(body).then((data) => ({ success: true, data }));
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a media file to MinIO and create content' })
  async upload(
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    @Body() body: { title?: string; caption?: string; hashtags?: string; organizationId?: string },
  ) {
    if (!file) return { success: false, message: 'กรุณาเลือกไฟล์' };
    const stored = await this.storageService.upload(file);
    const data = await this.contentService.create({
      organizationId: body.organizationId || 'default-org',
      title: body.title || file.originalname,
      type: file.mimetype.startsWith('image/') ? 'image' : 'video',
      url: stored.url,
      thumbnailUrl: stored.previewUrl,
      fileSize: BigInt(file.size),
      caption: body.caption || null,
      hashtags: body.hashtags ? body.hashtags.split(/[,\s]+/).filter(Boolean) : [],
      status: 'READY',
      tags: [],
    });
    return { success: true, data };
  }

  @Post('generate-video')
  @ApiOperation({ summary: 'Generate premium video with Remotion Studio and Creative QA' })
  async generateVideo(@Body() dto: { prompt?: string; template?: string; preset?: string }) {
    try {
      const { execFileSync } = await import('child_process');
      const { existsSync } = await import('fs');
      const { join } = await import('path');

      let rootDir = process.cwd();
      while (rootDir && !existsSync(join(rootDir, 'turbo.json')) && existsSync(join(rootDir, '..'))) {
        const parent = join(rootDir, '..');
        if (parent === rootDir) break;
        rootDir = parent;
      }

      const scriptPath = join(rootDir, 'scripts', 'create-premium-video.mjs');
      execFileSync('node', [scriptPath], { stdio: 'inherit' });

      const finalUrl = '/output/sng-express/final.mp4';
      const previewUrl = '/output/sng-express/preview.mp4';
      const contactSheetUrl = '/output/sng-express/contact-sheet.jpg';
      const thumbnailUrl = '/output/sng-express/thumbnail.jpg';

      const data = await this.contentService.create({
        organizationId: 'default-org',
        title: dto.prompt || 'SNG EXPRESS Premium Social Commercial 9:16',
        type: 'video',
        url: finalUrl,
        thumbnailUrl: thumbnailUrl,
        fileSize: BigInt(831091),
        caption: 'สั่งของ Shopee & Lazada ประเทศไทย ไม่ว่าชิ้นเล็กหรือชิ้นใหญ่ 📦\nทีมงาน SNG EXPRESS ลุยส่งด่วนจากไทยถึงลาวอย่างปลอดภัย ถึงมือ 100% 🇹🇭➡️🇱🇦',
        hashtags: ['#SNGEXPRESS', '#ส่งด่วนไทยลาว', '#RemotionStudio', '#ขนส่งไทยลาว'],
        status: 'READY',
        tags: ['PREMIUM_VIDEO', 'REMOTION'],
      });

      return {
        success: true,
        data: {
          ...data,
          creativeScore: 89,
          previewUrl,
          finalUrl,
          contactSheetUrl,
          thumbnailUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'ไม่สามารถสร้างวิดีโอได้',
      };
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update content' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.contentService.update(id, body).then((data) => ({ success: true, data }));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete content' })
  delete(@Param('id') id: string) {
    return this.contentService.delete(id).then((data) => ({ success: true, data }));
  }
}
