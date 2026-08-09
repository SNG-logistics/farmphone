import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CampaignsService } from './campaigns.service';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all campaigns' })
  findAll() {
    return this.campaignsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new campaign' })
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      accountIds?: string[];
      contentIds?: string[];
      deviceGroupId?: string;
      schedule?: string;
      dailyLimit?: number;
    },
  ) {
    return this.campaignsService.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a campaign' })
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      accountIds?: string[];
      contentIds?: string[];
      deviceGroupId?: string;
      schedule?: string;
      dailyLimit?: number;
    },
  ) {
    return this.campaignsService.update(id, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update campaign status' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.campaignsService.updateStatus(id, body.status);
  }

  @Post(':id/launch')
  @ApiOperation({ summary: 'Create upload jobs and launch a campaign' })
  launch(@Param('id') id: string) {
    return this.campaignsService.launch(id);
  }
}
