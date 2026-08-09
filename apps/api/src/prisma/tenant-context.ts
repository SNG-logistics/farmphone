import { AsyncLocalStorage } from 'async_hooks';

export type TenantStore = { organizationId?: string; role?: string };

export class TenantContext {
  private static readonly storage = new AsyncLocalStorage<TenantStore>();

  static run<T>(store: TenantStore, callback: () => T) {
    return this.storage.run(store, callback);
  }

  static current() {
    return this.storage.getStore();
  }
}
