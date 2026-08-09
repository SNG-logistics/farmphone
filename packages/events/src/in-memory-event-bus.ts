import { randomUUID } from 'node:crypto';

import {
  AnyEvent,
  AnyEventHandler,
  DomainEventName,
  EventBus,
  EventDispatchError,
  EventDomain,
  EventErrorHandler,
  EventMap,
  EventName,
  EventPayloadMap,
  PublishOptions,
  TypedEvent,
  TypedEventHandler,
  Unsubscribe,
} from './contracts';

type InternalHandler<TEvents extends EventMap> = AnyEventHandler<TEvents>;

export interface InMemoryEventBusOptions<
  TEvents extends EventMap = EventPayloadMap,
> {
  idFactory?: () => string;
  now?: () => Date;
  onError?: EventErrorHandler<TEvents>;
}

export class InMemoryEventBus<
  TEvents extends EventMap = EventPayloadMap,
> implements EventBus<TEvents> {
  private readonly exactHandlers = new Map<
    EventName<TEvents>,
    Set<InternalHandler<TEvents>>
  >();

  private readonly domainHandlers = new Map<
    string,
    Set<InternalHandler<TEvents>>
  >();

  private readonly anyHandlers = new Set<InternalHandler<TEvents>>();
  private readonly errorHandlers = new Set<EventErrorHandler<TEvents>>();
  private readonly idFactory: () => string;
  private readonly now: () => Date;

  constructor(options: InMemoryEventBusOptions<TEvents> = {}) {
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date());

    if (options.onError) {
      this.errorHandlers.add(options.onError);
    }
  }

  emit<TName extends EventName<TEvents>>(
    type: TName,
    payload: TEvents[TName],
    organizationId: string,
    options?: PublishOptions,
  ): void {
    const event = this.createEnvelope(type, payload, organizationId, options);
    void this.dispatch(event);
  }

  async publish<TName extends EventName<TEvents>>(
    type: TName,
    payload: TEvents[TName],
    organizationId: string,
    options?: PublishOptions,
  ): Promise<TypedEvent<TEvents, TName>> {
    const event = this.createEnvelope(type, payload, organizationId, options);
    await this.dispatch(event);
    return event;
  }

  on<TName extends EventName<TEvents>>(
    type: TName,
    handler: TypedEventHandler<TEvents, TName>,
  ): Unsubscribe;
  on(selector: '*', handler: AnyEventHandler<TEvents>): Unsubscribe;
  on(selector: `${string}.*`, handler: AnyEventHandler<TEvents>): Unsubscribe;
  on(
    selector: EventName<TEvents> | '*' | `${string}.*`,
    handler: InternalHandler<TEvents>,
  ): Unsubscribe {
    if (selector === '*') {
      return this.onAny(handler);
    }

    if (selector.endsWith('.*')) {
      return this.onDomain(selector.slice(0, -2), handler);
    }

    const handlers = this.getOrCreate(this.exactHandlers, selector);
    handlers.add(handler);
    return this.makeUnsubscribe(() => this.removeHandler(this.exactHandlers, selector, handler));
  }

  off<TName extends EventName<TEvents>>(
    type: TName,
    handler: TypedEventHandler<TEvents, TName>,
  ): void;
  off(selector: '*', handler: AnyEventHandler<TEvents>): void;
  off(selector: `${string}.*`, handler: AnyEventHandler<TEvents>): void;
  off(
    selector: EventName<TEvents> | '*' | `${string}.*`,
    handler: InternalHandler<TEvents>,
  ): void {
    if (selector === '*') {
      this.anyHandlers.delete(handler);
      return;
    }

    if (selector.endsWith('.*')) {
      this.removeHandler(this.domainHandlers, this.normalizeDomain(selector.slice(0, -2)), handler);
      return;
    }

    this.removeHandler(this.exactHandlers, selector, handler);
  }

  onAny(handler: AnyEventHandler<TEvents>): Unsubscribe {
    this.anyHandlers.add(handler);
    return this.makeUnsubscribe(() => this.anyHandlers.delete(handler));
  }

  onDomain<TDomain extends string>(
    domain: TDomain,
    handler: (
      event: TypedEvent<TEvents, DomainEventName<TEvents, TDomain>>,
    ) => void | Promise<void>,
  ): Unsubscribe {
    const normalizedDomain = this.normalizeDomain(domain);
    const internalHandler = handler as InternalHandler<TEvents>;
    const handlers = this.getOrCreate(this.domainHandlers, normalizedDomain);
    handlers.add(internalHandler);
    return this.makeUnsubscribe(() =>
      this.removeHandler(this.domainHandlers, normalizedDomain, internalHandler),
    );
  }

  onError(handler: EventErrorHandler<TEvents>): Unsubscribe {
    this.errorHandlers.add(handler);
    return this.makeUnsubscribe(() => this.errorHandlers.delete(handler));
  }

  clear(): void {
    this.exactHandlers.clear();
    this.domainHandlers.clear();
    this.anyHandlers.clear();
    this.errorHandlers.clear();
  }

  private createEnvelope<TName extends EventName<TEvents>>(
    type: TName,
    payload: TEvents[TName],
    organizationId: string,
    options?: PublishOptions,
  ): TypedEvent<TEvents, TName> {
    const envelope: TypedEvent<TEvents, TName> = {
      id: this.idFactory(),
      type,
      domain: this.getDomain(type),
      payload,
      timestamp: this.now().toISOString(),
      organizationId,
      ...(options?.correlationId ? { correlationId: options.correlationId } : {}),
      ...(options?.causationId ? { causationId: options.causationId } : {}),
      ...(options?.metadata ? { metadata: Object.freeze({ ...options.metadata }) } : {}),
    };

    return Object.freeze(envelope);
  }

  private async dispatch(event: AnyEvent<TEvents>): Promise<void> {
    const subscriptions: Array<{
      selector: string;
      handler: InternalHandler<TEvents>;
    }> = [];

    for (const handler of this.exactHandlers.get(event.type) ?? []) {
      subscriptions.push({ selector: event.type, handler });
    }

    for (const handler of this.domainHandlers.get(event.domain) ?? []) {
      subscriptions.push({ selector: `${event.domain}.*`, handler });
    }

    for (const handler of this.anyHandlers) {
      subscriptions.push({ selector: '*', handler });
    }

    await Promise.all(
      subscriptions.map(({ selector, handler }) =>
        this.invokeHandler(handler, event, selector),
      ),
    );
  }

  private async invokeHandler(
    handler: InternalHandler<TEvents>,
    event: AnyEvent<TEvents>,
    selector: string,
  ): Promise<void> {
    try {
      await handler(event);
    } catch (error) {
      await this.reportError({ error, event, selector });
    }
  }

  private async reportError(failure: EventDispatchError<TEvents>): Promise<void> {
    await Promise.allSettled(
      [...this.errorHandlers].map((handler) => Promise.resolve().then(() => handler(failure))),
    );
  }

  private getDomain<TName extends EventName<TEvents>>(type: TName): EventDomain<TName> {
    const domain = type.split(/[_.:]/, 1)[0] ?? type;
    return domain.toLowerCase() as EventDomain<TName>;
  }

  private normalizeDomain(domain: string): string {
    return domain.trim().toLowerCase();
  }

  private getOrCreate<TKey>(
    registry: Map<TKey, Set<InternalHandler<TEvents>>>,
    key: TKey,
  ): Set<InternalHandler<TEvents>> {
    const existing = registry.get(key);
    if (existing) {
      return existing;
    }

    const handlers = new Set<InternalHandler<TEvents>>();
    registry.set(key, handlers);
    return handlers;
  }

  private removeHandler<TKey>(
    registry: Map<TKey, Set<InternalHandler<TEvents>>>,
    key: TKey,
    handler: InternalHandler<TEvents>,
  ): void {
    const handlers = registry.get(key);
    handlers?.delete(handler);
    if (handlers?.size === 0) {
      registry.delete(key);
    }
  }

  private makeUnsubscribe(remove: () => void | boolean): Unsubscribe {
    let subscribed = true;
    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      remove();
    };
  }
}
