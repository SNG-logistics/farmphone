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
import { AgentsService } from './agents.service';

@ApiTags('Agents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('VIEWER')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all AI agents' })
  findAll() {
    return this.agentsService.findAll().then((data) => ({ success: true, data }));
  }

  @Post('activate-all')
  @ApiOperation({ summary: 'Activate all 4 MVP agents to WORKING status' })
  activateAll() {
    return this.agentsService.activateAll().then((data) => ({ success: true, data }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get AI agent by ID' })
  findOne(@Param('id') id: string) {
    return this.agentsService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update agent status' })
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.agentsService.updateStatus(id, status).then((data) => ({ success: true, data }));
  }
}

