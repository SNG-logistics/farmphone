import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AutomationRecipeStep } from './automation-recipe.types';
import { AutomationRecipesService } from './automation-recipes.service';

type AuthenticatedRequest = { user?: { organizationId?: string } };

@ApiTags('Automation Recipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER')
@Controller('automation-recipes')
export class AutomationRecipesController {
  constructor(private readonly recipes: AutomationRecipesService) {}

  @Get()
  @ApiOperation({ summary: 'List reusable deterministic Android automation recipes' })
  findAll(@Req() request: AuthenticatedRequest) {
    return this.recipes.findAll(organizationId(request));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one automation recipe' })
  findOne(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.recipes.findOne(organizationId(request), id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an automation recipe without executing it' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: { name?: string; description?: string; status?: string; steps?: AutomationRecipeStep[] },
  ) {
    return this.recipes.create(organizationId(request), body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update and version an automation recipe' })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string; status?: string; steps?: AutomationRecipeStep[] },
  ) {
    return this.recipes.update(organizationId(request), id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a never-executed recipe; archive executed recipes' })
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.recipes.remove(organizationId(request), id);
  }

  @Post(':id/runs')
  @ApiOperation({ summary: 'Compile a recipe and enqueue one observable AUTOMATION_SEQUENCE job per physical device' })
  run(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { deviceCodes?: string[] },
  ) {
    return this.recipes.run(organizationId(request), id, body.deviceCodes);
  }
}

function organizationId(request: AuthenticatedRequest) {
  return String(request.user?.organizationId || 'default-org');
}
