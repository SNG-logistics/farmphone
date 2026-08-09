import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  organizationRepo,
  userRepo,
  deviceRepo,
  deviceHeartbeatRepo,
  deviceCommandRepo,
  deviceGroupRepo,
  jobRepo,
  jobLogRepo,
  accountRepo,
  campaignRepo,
  contentRepo,
  missionRepo,
  aiAgentRepo,
  agentTaskRepo,
  agentEventRepo,
  notificationRepo,
  uploadedFileRepo,
  planRepo,
  creditLedgerRepo,
  subscriptionRepo,
  logRepo,
  auditLogRepo,
  workflowStepRepo,
  type BaseEntity,
} from '@farm-phone/database';

type WhereFilterOp = '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any';

function fireOp(op: string): WhereFilterOp | null {
  const m: Record<string, WhereFilterOp> = {
    equals: '==', not: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
    in: 'in', notIn: 'not-in', contains: 'array-contains',
  };
  return m[op] || null;
}

function toFilters(where: Record<string, unknown> | undefined): { field: string; operator: WhereFilterOp; value: unknown }[] {
  if (!where) return [];
  const f: { field: string; operator: WhereFilterOp; value: unknown }[] = [];
  for (const [k, v] of Object.entries(where)) {
    if (v == null) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      for (const [op, val] of Object.entries(v as Record<string, unknown>)) {
        const fo = fireOp(op);
        if (fo) f.push({ field: k, operator: fo, value: val });
      }
    } else f.push({ field: k, operator: '==', value: v });
  }
  return f;
}

function uniqueSelectorFilters(where: Record<string, unknown>): { field: string; operator: WhereFilterOp; value: unknown }[] {
  const filters: { field: string; operator: WhereFilterOp; value: unknown }[] = [];
  for (const [field, value] of Object.entries(where)) {
    if (field === 'id' || value === undefined) continue;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      filters.push({ field, operator: '==', value });
      continue;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const nested = Object.entries(value as Record<string, unknown>);
      const isFilterExpression = nested.some(([key]) => fireOp(key) !== null);
      if (!isFilterExpression) {
        for (const [nestedField, nestedValue] of nested) {
          if (nestedValue !== undefined) filters.push({ field: nestedField, operator: '==', value: nestedValue });
        }
        continue;
      }
    }
    filters.push(...toFilters({ [field]: value }));
  }
  return filters;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findByUniqueSelector(repo: any, where: Record<string, unknown>) {
  const id = where.id;
  if (typeof id === 'string') return repo.findById(id);

  const code = where.code;
  if (typeof code === 'string' && typeof repo.findByCode === 'function') {
    return repo.findByCode(code);
  }

  const filters = uniqueSelectorFilters(where);
  if (filters.length === 0) throw new Error('Upsert requires a supported unique selector');
  const matches = await repo.findMany(filters, undefined, 1);
  return matches[0] || null;
}

function orderField(ob: Record<string, string> | undefined): { field: string; direction: 'asc' | 'desc' } | undefined {
  if (!ob) return undefined;
  const e = Object.entries(ob)[0];
  if (!e || e[0] === '_count') return undefined;
  return { field: e[0], direction: (e[1] as 'asc' | 'desc') || 'asc' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function proxy(repo: any) {
  const p = {
    async findMany(a?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; take?: number; skip?: number; include?: unknown; select?: unknown }) {
      const r = await repo.findMany(toFilters(a?.where), orderField(a?.orderBy), a?.take);
      return (a?.skip || 0) ? r.slice(a!.skip!) : r;
    },
    async findFirst(a?: { where?: Record<string, unknown>; orderBy?: Record<string, string>; include?: unknown; select?: unknown }) {
      if (a?.where?.id && typeof a.where.id === 'string') {
        const doc = await repo.findById(a.where.id);
        if (doc) return doc;
      }
      if (a?.where?.code && typeof a.where.code === 'string' && repo.findByCode) {
        const doc = await repo.findByCode(a.where.code);
        if (doc) return doc;
      }
      if (Array.isArray(a?.where?.OR)) {
        for (const item of a.where.OR) {
          if (item?.id && typeof item.id === 'string') {
            const doc = await repo.findById(item.id);
            if (doc) return doc;
          }
          if (item?.code && typeof item.code === 'string' && repo.findByCode) {
            const doc = await repo.findByCode(item.code);
            if (doc) return doc;
          }
        }
      }
      const r = await repo.findMany(toFilters(a?.where), orderField(a?.orderBy), 1);
      return r[0] || null;
    },
    async findUnique(a: { where: Record<string, unknown>; include?: unknown; select?: unknown }) {
      const id = a.where?.id as string;
      if (id && typeof id === 'string') {
        const doc = await repo.findById(id);
        if (doc) return doc;
      }
      const code = a.where?.code as string;
      if (code && typeof code === 'string' && repo.findByCode) {
        const doc = await repo.findByCode(code);
        if (doc) return doc;
      }
      const r = await repo.findMany(toFilters(a.where), undefined, 1);
      return r[0] || null;
    },
    async count(a?: { where?: Record<string, unknown> }) { return repo.count(toFilters(a?.where)); },
    async create(a: { data: Record<string, unknown>; include?: unknown; select?: unknown }) { return repo.create(a.data); },
    async update(a: { where: Record<string, unknown>; data: Record<string, unknown>; include?: unknown; select?: unknown }) {
      const id = (a.where?.id as string) || (a.where?.code as string);
      if (!id) { const e = await repo.findMany(toFilters(a.where), undefined, 1); if (e[0]) return repo.update(e[0].id, a.data); throw new Error('Record not found'); }
      return repo.update(id, a.data);
    },
    async upsert(a: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) {
      const existing = await findByUniqueSelector(repo, a.where);
      if (existing) {
        const update = Object.fromEntries(Object.entries(a.update).filter(([, value]) => value !== undefined));
        if (Object.keys(update).length === 0) return existing;
        return repo.update(existing.id, update);
      }
      return repo.create(a.create);
    },
    async delete(a: { where: Record<string, unknown> }) {
      const id = a.where?.id as string;
      if (id) { await repo.delete(id); return; }
      const r = await repo.findMany(toFilters(a.where), undefined, 1);
      if (r[0]) await repo.delete(r[0].id);
    },
    async deleteMany(a?: { where?: Record<string, unknown> }) {
      const r = await repo.findMany(toFilters(a?.where));
      await repo.deleteMany(r.map((x: BaseEntity) => x.id));
      return { count: r.length };
    },
    async updateMany(a?: { where?: Record<string, unknown>; data?: Record<string, unknown> }) {
      const r = await repo.findMany(toFilters(a?.where));
      for (const x of r) await repo.update(x.id, a?.data || {});
      return { count: r.length };
    },
    async aggregate(a?: { where?: Record<string, unknown>; _sum?: Record<string, boolean> }) { 
      const r = await repo.findMany(toFilters(a?.where));
      const sum: Record<string, number> = {};
      if (a?._sum) {
        for (const key of Object.keys(a._sum)) {
          sum[key] = r.reduce((acc: number, x: Record<string, unknown>) => acc + (Number(x[key]) || 0), 0);
        }
      }
      return { _sum: sum };
    },
    async groupBy(a: { by: string[]; _count?: Record<string, boolean> }) {
      const r = await repo.findMany();
      const groups = new Map<string, number>();
      for (const item of r) {
        for (const field of a.by) {
          const key = String(item[field] ?? 'unknown');
          groups.set(key, (groups.get(key) || 0) + 1);
        }
      }
      return Array.from(groups.entries()).map(([key, count]) => ({
        [a.by[0]]: key,
        _count: { [a.by[0]]: count },
      }));
    },
  };
  return p;
}

@Injectable()
export class PrismaService implements OnModuleInit {
  readonly organization = proxy(organizationRepo);
  readonly user = proxy(userRepo);
  readonly device = proxy(deviceRepo);
  readonly deviceHeartbeat = proxy(deviceHeartbeatRepo);
  readonly deviceCommand = proxy(deviceCommandRepo);
  readonly job = proxy(jobRepo);
  readonly account = proxy(accountRepo);
  readonly campaign = proxy(campaignRepo);
  readonly content = proxy(contentRepo);
  readonly mission = proxy(missionRepo);
  readonly aiAgent = proxy(aiAgentRepo);
  readonly aIAgent = proxy(aiAgentRepo);
  readonly agentTask = proxy(agentTaskRepo);
  readonly agentEvent = proxy(agentEventRepo);
  readonly notification = proxy(notificationRepo);
  readonly uploadedFile = proxy(uploadedFileRepo);
  readonly deviceGroup = proxy(deviceGroupRepo);
  readonly jobLog = proxy(jobLogRepo);
  readonly plan = proxy(planRepo);
  readonly creditLedger = proxy(creditLedgerRepo);
  readonly subscription = proxy(subscriptionRepo);
  readonly log = proxy(logRepo);
  readonly auditLog = proxy(auditLogRepo);
  readonly workflowStep = proxy(workflowStepRepo);

  async $transaction<T>(arg: ((tx: PrismaService) => Promise<T>) | Promise<unknown>[]): Promise<T> {
    if (Array.isArray(arg)) {
      const results = await Promise.all(arg);
      return results as unknown as T;
    }
    return (arg as (tx: PrismaService) => Promise<T>)(this);
  }

  async onModuleInit() {}
  async $connect() {}
  async $disconnect() {}
  $on() {}
  $use() {}
}
