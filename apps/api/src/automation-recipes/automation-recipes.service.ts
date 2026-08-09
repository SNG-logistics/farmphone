import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SingleDeviceCommandsService } from '../jobs/single-device-commands.service';
import { AutomationRecipeStep, RECIPE_STATUSES, RecipeStatus } from './automation-recipe.types';
import { compileRecipe, validateRecipeSteps } from './recipe-compiler';

interface RecipeInput {
  name?: string;
  description?: string;
  status?: string;
  steps?: AutomationRecipeStep[];
}

@Injectable()
export class AutomationRecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: SingleDeviceCommandsService,
  ) {}

  findAll(organizationId: string) {
    return this.prisma.automationRecipe.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const recipe = await this.prisma.automationRecipe.findFirst({ where: { id, organizationId } });
    if (!recipe || recipe.organizationId !== organizationId) {
      throw new NotFoundException(`Automation recipe ${id} not found`);
    }
    return recipe;
  }

  async create(organizationId: string, input: RecipeInput) {
    const name = requiredName(input.name);
    const steps = validateRecipeSteps(input.steps);
    const status = statusValue(input.status || 'DRAFT');
    return this.prisma.automationRecipe.create({
      data: {
        organizationId,
        name,
        description: String(input.description || '').trim(),
        status,
        version: 1,
        steps,
        runCount: 0,
        lastRunAt: null,
      },
    });
  }

  async update(organizationId: string, id: string, input: RecipeInput) {
    const recipe = await this.findOne(organizationId, id);
    if (recipe.status === 'ARCHIVED' && input.status && input.status !== 'ARCHIVED') {
      throw new BadRequestException('Archived recipes cannot be reactivated; create a new version instead');
    }
    const data: Record<string, unknown> = {};
    let versionChanged = false;
    if (input.name !== undefined) {
      data.name = requiredName(input.name);
      versionChanged = true;
    }
    if (input.description !== undefined) {
      data.description = String(input.description).trim();
      versionChanged = true;
    }
    if (input.steps !== undefined) {
      data.steps = validateRecipeSteps(input.steps);
      versionChanged = true;
    }
    if (input.status !== undefined) data.status = statusValue(input.status);
    if (versionChanged) data.version = Number(recipe.version || 1) + 1;
    return this.prisma.automationRecipe.update({ where: { id }, data });
  }

  async remove(organizationId: string, id: string) {
    const recipe = await this.findOne(organizationId, id);
    if (Number(recipe.runCount || 0) > 0) {
      throw new BadRequestException('Executed recipes are auditable records; archive this recipe instead of deleting it');
    }
    await this.prisma.automationRecipe.delete({ where: { id } });
    return { id, deleted: true };
  }

  async run(organizationId: string, id: string, deviceCodes: unknown) {
    const recipe = await this.findOne(organizationId, id);
    if (recipe.status !== 'ACTIVE') throw new BadRequestException('Only ACTIVE recipes can be executed');
    const codes = normalizeDeviceCodes(deviceCodes);
    const devices: any[] = [];
    for (let offset = 0; offset < codes.length; offset += 30) {
      devices.push(...await this.prisma.device.findMany({
        where: { organizationId, code: { in: codes.slice(offset, offset + 30) } },
      }));
    }
    const byCode = new Map<string, { serialNumber?: string | null; metadata?: { simulated?: boolean } | null }>(
      devices.map((device: any) => [String(device.code), device as { serialNumber?: string | null; metadata?: { simulated?: boolean } | null }]),
    );
    for (const code of codes) {
      const device = byCode.get(code);
      if (!device) throw new NotFoundException(`Physical device ${code} not found`);
      if (!String(device.serialNumber || '').trim() || device.metadata?.simulated === true) {
        throw new BadRequestException(`Device ${code} has no physical ADB serial and cannot run production automation`);
      }
    }

    const sequence = compileRecipe(recipe as { id: string; version: number; steps: unknown });
    const runId = randomUUID();
    const jobs = [];
    for (const code of codes) {
      const result = await this.commands.create(code, {
        command: 'AUTOMATION_SEQUENCE',
        parameters: sequence,
        idempotencyKey: `recipe:${id}:v${recipe.version}:${runId}:${code}`,
        context: {
          source: 'AUTOMATION_RECIPE',
          recipeId: id,
          recipeVersion: recipe.version,
          recipeRunId: runId,
        },
      });
      jobs.push({ deviceCode: code, job: result.job, duplicate: result.duplicate });
    }
    await this.prisma.automationRecipe.update({
      where: { id },
      data: { runCount: Number(recipe.runCount || 0) + 1, lastRunAt: new Date() },
    });
    return { runId, recipeId: id, recipeVersion: recipe.version, deviceCount: codes.length, jobs };
  }
}

function requiredName(value: unknown) {
  const name = String(value || '').trim();
  if (!name || name.length > 120) throw new BadRequestException('Recipe name must contain 1-120 characters');
  return name;
}

function statusValue(value: unknown): RecipeStatus {
  const status = String(value || '').toUpperCase() as RecipeStatus;
  if (!RECIPE_STATUSES.includes(status)) throw new BadRequestException(`Unsupported recipe status ${status || '(empty)'}`);
  return status;
}

function normalizeDeviceCodes(value: unknown) {
  if (!Array.isArray(value)) throw new BadRequestException('deviceCodes must be a non-empty array');
  const codes = [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  if (codes.length === 0 || codes.length > 100) throw new BadRequestException('deviceCodes must contain 1-100 device codes');
  return codes;
}
