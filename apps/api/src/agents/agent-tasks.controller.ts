import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AgentTasksService } from './agent-tasks.service';

@ApiTags('Agent Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OPERATOR')
@Controller('agent-tasks')
export class AgentTasksController {
  constructor(private readonly agentTasksService: AgentTasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all agent tasks (optional filter by agentId)' })
  findAll(@Query('agentId') agentId?: string) {
    return this.agentTasksService.findAll(agentId).then((data) => ({ success: true, data }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent task by ID' })
  findOne(@Param('id') id: string) {
    return this.agentTasksService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Post()
  @ApiOperation({ summary: 'Create agent task' })
  create(@Body() body: any) {
    return this.agentTasksService.create(body).then((data) => ({ success: true, data }));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update agent task' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.agentTasksService.update(id, body).then((data) => ({ success: true, data }));
  }
}
