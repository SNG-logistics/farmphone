import { BadRequestException } from '@nestjs/common';
import {
  AutomationRecipeStep,
  CompiledAutomationSequence,
  CompiledRecipeStep,
  CompiledSelector,
  RECIPE_COMMANDS,
  RecipeCommand,
} from './automation-recipe.types';

const SELECTOR_COMMANDS = new Set<RecipeCommand>(['TAP_UI', 'WAIT_UI']);

export function compileRecipe(recipe: {
  id: string;
  version: number;
  steps: unknown;
}): CompiledAutomationSequence {
  const steps = validateRecipeSteps(recipe.steps);
  return {
    sequenceVersion: 1,
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    stopOnFailure: true,
    steps: steps.map((step, index) => compileStep(step, index)),
  };
}

export function validateRecipeSteps(value: unknown): AutomationRecipeStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('Recipe must contain at least one automation step');
  }
  if (value.length > 100) throw new BadRequestException('Recipe cannot contain more than 100 steps');
  return value.map((raw, index) => validateStep(raw, index));
}

function validateStep(raw: unknown, index: number): AutomationRecipeStep {
  if (!isRecord(raw)) throw new BadRequestException(`Step ${index + 1} must be an object`);
  const command = String(raw.command || '').trim().toUpperCase() as RecipeCommand;
  if (!RECIPE_COMMANDS.includes(command)) {
    throw new BadRequestException(`Step ${index + 1} uses unsupported command ${command || '(empty)'}`);
  }
  const parameters = raw.parameters === undefined ? {} : raw.parameters;
  if (!isRecord(parameters)) throw new BadRequestException(`Step ${index + 1} parameters must be an object`);
  const selector = raw.selector === undefined ? undefined : validateSelector(raw.selector, index);
  if (SELECTOR_COMMANDS.has(command) && !selector) {
    throw new BadRequestException(`Step ${index + 1} ${command} requires a selector fallback chain`);
  }
  if (command === 'WAIT_UI' && selector && !selector.resourceId && !selector.contentDescription && !selector.text) {
    throw new BadRequestException(`Step ${index + 1} WAIT_UI requires a UI selector; coordinates cannot prove UI state`);
  }
  if (raw.evidence !== undefined && !isRecord(raw.evidence)) {
    throw new BadRequestException(`Step ${index + 1} evidence must be an object`);
  }
  const timeoutMs = raw.timeoutMs === undefined ? undefined : Number(raw.timeoutMs);
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000)) {
    throw new BadRequestException(`Step ${index + 1} timeoutMs must be an integer between 100 and 120000`);
  }
  return {
    id: optionalText(raw.id),
    name: optionalText(raw.name),
    command,
    parameters,
    selector,
    timeoutMs,
    evidence: raw.evidence,
  } as AutomationRecipeStep;
}

function validateSelector(raw: unknown, index: number) {
  if (!isRecord(raw)) throw new BadRequestException(`Step ${index + 1} selector must be an object`);
  const coordinate = raw.coordinate;
  if (coordinate !== undefined) {
    if (!isRecord(coordinate) || !validCoordinate(coordinate.x) || !validCoordinate(coordinate.y)) {
      throw new BadRequestException(`Step ${index + 1} coordinate fallback requires non-negative integer x/y`);
    }
  }
  const selector = {
    resourceId: optionalText(raw.resourceId),
    contentDescription: optionalText(raw.contentDescription),
    text: optionalText(raw.text),
    coordinate: coordinate as { x: number; y: number } | undefined,
  };
  if (!selector.resourceId && !selector.contentDescription && !selector.text && !selector.coordinate) {
    throw new BadRequestException(`Step ${index + 1} selector fallback chain is empty`);
  }
  return selector;
}

function compileStep(step: AutomationRecipeStep, index: number): CompiledRecipeStep {
  const command = String(step.command).toUpperCase() as RecipeCommand;
  const selectors: CompiledSelector[] = [];
  if (step.selector?.resourceId) selectors.push({ strategy: 'resourceId', value: step.selector.resourceId });
  if (step.selector?.contentDescription) selectors.push({ strategy: 'contentDescription', value: step.selector.contentDescription });
  if (step.selector?.text) selectors.push({ strategy: 'text', value: step.selector.text });
  if (step.selector?.coordinate) {
    selectors.push({ strategy: 'coordinate', x: step.selector.coordinate.x, y: step.selector.coordinate.y });
  }
  return {
    id: step.id || `step-${index + 1}`,
    name: step.name || `${index + 1}. ${command}`,
    command,
    parameters: { ...(step.parameters || {}) },
    ...(selectors.length ? { selectors } : {}),
    timeoutMs: step.timeoutMs || (command === 'WAIT_UI' ? 15_000 : 30_000),
    evidence: {
      before: step.evidence?.before === true,
      after: step.evidence?.after === true,
      onFailure: step.evidence?.onFailure === true,
    },
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function optionalText(value: unknown) {
  const text = String(value || '').trim();
  return text || undefined;
}

function validCoordinate(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100_000;
}
