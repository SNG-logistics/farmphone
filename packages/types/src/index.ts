// ============================================================
// FARM PHONE AI OFFICE — Shared Type Definitions
// ============================================================

// ---- Enums ----

export enum AgentStatusCode {
  IDLE = 'IDLE',
  THINKING = 'THINKING',
  WORKING = 'WORKING',
  WAITING = 'WAITING',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  OFFLINE = 'OFFLINE',
}

export enum AgentCode {
  CEO = '16bit.CEO',
  MANAGER = '16bit.MANAGER',
  ANALYST = '16bit.ANALYST',
  CONTENT = '16bit.CONTENT',
  DESIGNER = '16bit.DESIGNER',
  VIDEO = '16bit.VIDEO',
  SCHEDULER = '16bit.SCHEDULER',
  DEVICE = '16bit.DEVICE',
  API = '16bit.API',
  UPLOADER = '16bit.UPLOADER',
  SECURITY = '16bit.SECURITY',
  QA = '16bit.QA',
  DATA = '16bit.DATA',
  AI_ENGINE = '16bit.AI_ENGINE',
  NOTIFIER = '16bit.NOTIFIER',
  LOG = '16bit.LOG',
}

export enum DeviceStatus {
  OFFLINE = 'OFFLINE',
  CONNECTING = 'CONNECTING',
  ONLINE = 'ONLINE',
  BUSY = 'BUSY',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  MAINTENANCE = 'MAINTENANCE',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  ERROR = 'ERROR',
  BANNED = 'BANNED',
}

export enum ContentStatus {
  READY = 'READY',
  PROCESSING = 'PROCESSING',
  USED = 'USED',
  ARCHIVED = 'ARCHIVED',
  ERROR = 'ERROR',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  CANCELLED = 'CANCELLED',
}

export enum JobStatus {
  CREATED = 'CREATED',
  QUEUED = 'QUEUED',
  ASSIGNED = 'ASSIGNED',
  RUNNING = 'RUNNING',
  VERIFYING = 'VERIFYING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum JobType {
  CONTENT_UPLOAD = 'CONTENT_UPLOAD',
  CONTENT_PUBLISH = 'CONTENT_PUBLISH',
  ACCOUNT_CHECK = 'ACCOUNT_CHECK',
  DEVICE_HEALTH = 'DEVICE_HEALTH',
  CAMPAIGN_EXECUTE = 'CAMPAIGN_EXECUTE',
  BATCH_OPERATION = 'BATCH_OPERATION',
}

export enum JobPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum MissionStatus {
  DRAFT = 'DRAFT',
  ANALYZING = 'ANALYZING',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
}

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum CreditTransactionType {
  CREDIT_ADD = 'CREDIT_ADD',
  CREDIT_USE = 'CREDIT_USE',
  CREDIT_REFUND = 'CREDIT_REFUND',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

export enum WorkflowStepStatus {
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum EventType {
  MISSION_CREATED = 'MISSION_CREATED',
  TASK_CREATED = 'TASK_CREATED',
  TASK_ASSIGNED = 'TASK_ASSIGNED',
  AGENT_STARTED = 'AGENT_STARTED',
  AGENT_COMPLETED = 'AGENT_COMPLETED',
  JOB_CREATED = 'JOB_CREATED',
  JOB_STARTED = 'JOB_STARTED',
  JOB_COMPLETED = 'JOB_COMPLETED',
  JOB_FAILED = 'JOB_FAILED',
  DEVICE_ONLINE = 'DEVICE_ONLINE',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  CAMPAIGN_STARTED = 'CAMPAIGN_STARTED',
  CAMPAIGN_COMPLETED = 'CAMPAIGN_COMPLETED',
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  USER_ACTION = 'USER_ACTION',
}

// ---- Agent Types ----

export interface AIAgent {
  id: string;
  organizationId: string;
  code: AgentCode;
  name: string;
  role: string;
  avatar: string;
  status: AgentStatusCode;
  currentTaskId: string | null;
  lastActivityAt: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTask {
  id: string;
  agentId: string;
  parentTaskId: string | null;
  missionId: string | null;
  type: string;
  title: string;
  description: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  status: TaskStatus;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvent {
  id: string;
  agentId: string;
  eventType: EventType;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---- Mission & Workflow ----

export interface Mission {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: MissionStatus;
  campaignId: string | null;
  createdBy: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  missionId: string;
  order: number;
  name: string;
  status: WorkflowStepStatus;
  agentCode: AgentCode | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

// ---- Device Types ----

export interface Device {
  id: string;
  organizationId: string;
  deviceGroupId: string | null;
  code: string;
  name: string;
  model: string;
  osVersion: string;
  adbStatus: DeviceStatus;
  battery: number;
  storage: number;
  networkType: string;
  assignedAccountId: string | null;
  currentJobId: string | null;
  lastHeartbeatAt: string | null;
  nodeId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceGroup {
  id: string;
  organizationId: string;
  name: string;
  nodeId: string;
  deviceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceCommand {
  command:
    | 'HEALTH_CHECK'
    | 'SCREENSHOT'
    | 'OPEN_APP'
    | 'STOP_APP'
    | 'RESTART_APP'
    | 'PUSH_FILE'
    | 'REBOOT_DEVICE'
    | 'VIEW_DEVICE_STATUS'
    | 'VIEW_JOB_LOG'
    | 'RUN_SINGLE_DEVICE_TEST';
  parameters?: Record<string, unknown>;
  idempotencyKey?: string;
}

// ---- Content Types ----

export interface Content {
  id: string;
  organizationId: string;
  title: string;
  type: 'video' | 'image';
  url: string;
  thumbnailUrl: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  caption: string | null;
  hashtags: string[];
  tags: string[];
  status: ContentStatus;
  usageCount: number;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Account Types ----

export interface Account {
  id: string;
  organizationId: string;
  platform: string;
  username: string;
  nickname: string | null;
  status: AccountStatus;
  assignedDeviceId: string | null;
  authStatus: string;
  lastJobAt: string | null;
  todayJobCount: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Campaign Types ----

export interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  accountIds: string[];
  contentIds: string[];
  deviceGroupId: string | null;
  schedule: string | null;
  dailyLimit: number;
  status: CampaignStatus;
  totalJobs: number;
  successJobs: number;
  failedJobs: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Job Types ----

export interface Job {
  id: string;
  organizationId: string;
  campaignId: string | null;
  accountId: string | null;
  deviceId: string | null;
  contentId: string | null;
  type: JobType;
  priority: JobPriority;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: JobStatus;
  parameters: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  retryCount: number;
  maxRetries: number;
  errorCode: string | null;
  errorMessage: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Billing Types ----

export interface Plan {
  id: string;
  name: string;
  maxDevices: number;
  maxAccounts: number;
  monthlyPrice: number;
  includedCredits: number;
  features: string[];
  isActive: boolean;
}

export interface CreditLedger {
  id: string;
  organizationId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
}

// ---- User & Auth ----

export interface User {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: UserRole;
  permissions: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

// ---- Organization ----

export interface Organization {
  id: string;
  name: string;
  planId: string | null;
  creditBalance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- Dashboard ----

export interface DashboardKPI {
  totalDevices: number;
  onlineDevices: number;
  totalAccounts: number;
  activeAccounts: number;
  totalJobs: number;
  successJobs: number;
  failedJobs: number;
  successRate: number;
  creditBalance: number;
}

export interface DeviceSimulatorConfig {
  nodeId: string;
  prefix: string;
  count: number;
  enabled: boolean;
}

// ---- API Response Wrappers ----

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

// ---- WebSocket Events ----

export interface WSEvent {
  type: EventType;
  payload: unknown;
  timestamp: string;
}

export interface AgentStateUpdate {
  agentId: string;
  code: AgentCode;
  status: AgentStatusCode;
  currentTaskId: string | null;
  currentTaskTitle: string | null;
}

export interface WorkflowUpdate {
  missionId: string;
  steps: WorkflowStep[];
}

export interface DeviceStateUpdate {
  deviceId: string;
  code: string;
  status: DeviceStatus;
  battery: number;
  currentJobId: string | null;
}
