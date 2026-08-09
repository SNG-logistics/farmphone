export const RECIPE_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type RecipeStatus = typeof RECIPE_STATUSES[number];

export const RECIPE_COMMANDS = [
  'HEALTH_CHECK',
  'SCREENSHOT',
  'OPEN_APP',
  'STOP_APP',
  'TAP',
  'TAP_UI',
  'SWIPE',
  'TYPE_TEXT',
  'KEYEVENT',
  'BACK',
  'HOME',
  'WAIT_UI',
  'DUMP_UI',
] as const;
export type RecipeCommand = typeof RECIPE_COMMANDS[number];

export interface RecipeSelector {
  resourceId?: string;
  contentDescription?: string;
  text?: string;
  coordinate?: { x: number; y: number };
}

export interface RecipeEvidenceOptions {
  before?: boolean;
  after?: boolean;
  onFailure?: boolean;
}

export interface AutomationRecipeStep {
  id?: string;
  name?: string;
  command: RecipeCommand | string;
  parameters?: Record<string, unknown>;
  selector?: RecipeSelector;
  timeoutMs?: number;
  evidence?: RecipeEvidenceOptions;
}

export interface CompiledSelector {
  strategy: 'resourceId' | 'contentDescription' | 'text' | 'coordinate';
  value?: string;
  x?: number;
  y?: number;
}

export interface CompiledRecipeStep {
  id: string;
  name: string;
  command: RecipeCommand;
  parameters: Record<string, unknown>;
  selectors?: CompiledSelector[];
  timeoutMs: number;
  evidence: Required<RecipeEvidenceOptions>;
}

export interface CompiledAutomationSequence {
  sequenceVersion: 1;
  recipeId: string;
  recipeVersion: number;
  stopOnFailure: true;
  steps: CompiledRecipeStep[];
}
