import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@ApiBearerAuth()
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization' })
  create(@Body() createOrgDto: { name: string; ownerId?: string }) {
    return this.organizationService.create(createOrgDto).then((data) => ({ success: true, data }));
  }

  @Get()
  @ApiOperation({ summary: 'Get all organizations' })
  findAll() {
    return this.organizationService.findAll().then((data) => ({ success: true, data }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an organization by ID' })
  findOne(@Param('id') id: string) {
    return this.organizationService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an organization' })
  update(
    @Param('id') id: string,
    @Body() updateOrgDto: { name?: string },
  ) {
    return this.organizationService.update(id, updateOrgDto).then((data) => ({ success: true, data }));
  }
}
