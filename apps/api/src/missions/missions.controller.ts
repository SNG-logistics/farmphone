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
import { MissionsService } from './missions.service';

@ApiTags('Missions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER')
@Controller('missions')
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all missions' })
  findAll() {
    return this.missionsService.findAll().then((data) => ({ success: true, data }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get mission by ID' })
  findOne(@Param('id') id: string) {
    return this.missionsService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Post()
  @ApiOperation({ summary: 'Create mission (with optional workflow steps)' })
  create(@Body() body: any) {
    return this.missionsService.create(body).then((data) => ({ success: true, data }));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update mission status' })
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.missionsService.updateStatus(id, status).then((data) => ({ success: true, data }));
  }

  @Get(':id/workflow')
  @ApiOperation({ summary: 'Get workflow steps for a mission' })
  getWorkflowSteps(@Param('id') id: string) {
    return this.missionsService.getWorkflowSteps(id).then((data) => ({ success: true, data }));
  }
}
