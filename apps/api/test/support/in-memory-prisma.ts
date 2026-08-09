type RecordValue = Record<string, any>;

function matchesWhere(item: RecordValue, where: RecordValue = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as RecordValue[]).some((condition) => matchesWhere(item, condition));
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('lte' in expected) return item[key] != null && new Date(item[key]) <= new Date(expected.lte);
    }
    return item[key] === expected;
  });
}

export class InMemoryPrisma {
  readonly organizations: RecordValue[] = [];
  readonly contents: RecordValue[] = [];
  readonly accounts: RecordValue[] = [];
  readonly campaigns: RecordValue[] = [];
  readonly jobs: RecordValue[] = [];
  private sequence = 0;

  private nextId(prefix: string) {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private timestamps(data: RecordValue) {
    const now = new Date();
    return { ...data, createdAt: data.createdAt || now, updatedAt: now };
  }

  private includeJobRelations(job: RecordValue) {
    return {
      ...job,
      device: null,
      campaign: this.campaigns.find((item) => item.id === job.campaignId) || null,
      account: this.accounts.find((item) => item.id === job.accountId) || null,
      content: this.contents.find((item) => item.id === job.contentId) || null,
    };
  }

  organization = {
    upsert: jest.fn(async ({ where, create }: RecordValue) => {
      const existing = this.organizations.find((item) => item.id === where.id);
      if (existing) return existing;
      const organization = this.timestamps(create);
      this.organizations.push(organization);
      return organization;
    }),
  };

  content = {
    findMany: jest.fn(async () => [...this.contents].reverse()),
    findUnique: jest.fn(async ({ where }: RecordValue) => this.contents.find((item) => item.id === where.id) || null),
    create: jest.fn(async ({ data }: RecordValue) => {
      const content = this.timestamps({ id: this.nextId('content'), ...data });
      this.contents.push(content);
      return content;
    }),
    update: jest.fn(async ({ where, data }: RecordValue) => {
      const item = this.contents.find((content) => content.id === where.id);
      if (!item) throw new Error('Content not found');
      Object.assign(item, data, { updatedAt: new Date() });
      return item;
    }),
    delete: jest.fn(async ({ where }: RecordValue) => {
      const index = this.contents.findIndex((item) => item.id === where.id);
      if (index < 0) throw new Error('Content not found');
      return this.contents.splice(index, 1)[0];
    }),
  };

  account = {
    findMany: jest.fn(async () => [...this.accounts].reverse()),
    findUnique: jest.fn(async ({ where }: RecordValue) => this.accounts.find((item) => item.id === where.id) || null),
    findFirst: jest.fn(async ({ where }: RecordValue) => this.accounts.find((item) => matchesWhere(item, where)) || null),
    create: jest.fn(async ({ data }: RecordValue) => {
      const account = this.timestamps({
        id: this.nextId('account'),
        status: 'ACTIVE',
        authStatus: 'unknown',
        ...data,
      });
      this.accounts.push(account);
      return account;
    }),
    update: jest.fn(async ({ where, data }: RecordValue) => {
      const item = this.accounts.find((account) => account.id === where.id);
      if (!item) throw new Error('Account not found');
      Object.assign(item, data, { updatedAt: new Date() });
      return item;
    }),
    delete: jest.fn(async ({ where }: RecordValue) => {
      const index = this.accounts.findIndex((item) => item.id === where.id);
      if (index < 0) throw new Error('Account not found');
      return this.accounts.splice(index, 1)[0];
    }),
  };

  campaign = {
    findMany: jest.fn(async () => [...this.campaigns].reverse().map((item) => ({
      ...item,
      jobs: this.jobs.filter((job) => job.campaignId === item.id),
    }))),
    findUnique: jest.fn(async ({ where }: RecordValue) => {
      const campaign = this.campaigns.find((item) => item.id === where.id);
      return campaign ? { ...campaign, jobs: this.jobs.filter((job) => job.campaignId === campaign.id) } : null;
    }),
    create: jest.fn(async ({ data }: RecordValue) => {
      const campaign = this.timestamps({ id: this.nextId('campaign'), totalJobs: 0, ...data });
      this.campaigns.push(campaign);
      return { ...campaign, jobs: [] };
    }),
    update: jest.fn(async ({ where, data }: RecordValue) => {
      const item = this.campaigns.find((campaign) => campaign.id === where.id);
      if (!item) throw new Error('Campaign not found');
      Object.assign(item, data, { updatedAt: new Date() });
      return { ...item, jobs: this.jobs.filter((job) => job.campaignId === item.id) };
    }),
    count: jest.fn(async () => this.campaigns.length),
    groupBy: jest.fn(async () => this.groupBy(this.campaigns, 'status')),
  };

  job = {
    findMany: jest.fn(async ({ where = {}, take }: RecordValue = {}) => {
      const jobs = this.jobs.filter((item) => matchesWhere(item, where));
      return jobs.slice(0, take || jobs.length).map((job) => this.includeJobRelations(job));
    }),
    findUnique: jest.fn(async ({ where }: RecordValue) => {
      const job = this.jobs.find((item) => item.id === where.id);
      return job ? this.includeJobRelations(job) : null;
    }),
    create: jest.fn(async ({ data }: RecordValue) => {
      const job = this.timestamps({
        id: this.nextId('job'),
        status: 'CREATED',
        scheduledAt: null,
        retryCount: 0,
        maxRetries: 3,
        ...data,
      });
      this.jobs.push(job);
      return this.includeJobRelations(job);
    }),
    update: jest.fn(async ({ where, data }: RecordValue) => {
      const item = this.jobs.find((job) => job.id === where.id);
      if (!item) throw new Error('Job not found');
      Object.assign(item, data, { updatedAt: new Date() });
      return this.includeJobRelations(item);
    }),
    count: jest.fn(async ({ where = {} }: RecordValue = {}) => this.jobs.filter((item) => matchesWhere(item, where)).length),
    groupBy: jest.fn(async ({ by }: RecordValue) => this.groupBy(this.jobs, by[0])),
  };

  private groupBy(items: RecordValue[], field: string) {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item[field], (counts.get(item[field]) || 0) + 1);
    return [...counts].map(([value, count]) => ({ [field]: value, _count: { [field]: count } }));
  }
}
