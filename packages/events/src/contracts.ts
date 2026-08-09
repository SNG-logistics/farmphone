import {
  AgentStateUpdate,
  DeviceStateUpdate,
  EventType,
  WorkflowUpdate,
} from '@farm-phone/types';

export { EventType };
export type { AgentStateUpdate, DeviceStateUpdate, WorkflowUpdate };

export type EventMap = object;
export type EventName<TEvents extends EventMap> = Extract<keyof TEvents, string>;

export type EventDomain<TType extends string = string> = Lowercase<
  TType extends `${infer TDomain}_${string}`
    ? TDomain
    : TType extends `${infer TDomain}.${string}`
      ? TDomain
      : TType extends `${infer TDomain}:${string}`
        ? TDomain
        : TType
>;

export type DomainEventName<
  TEvents extends EventMap,
  TDomain extends string,
> = {
  [TName in EventName<TEvents>]: EventDomain<TName> extends Lowercase<TDomain>
    ? TName
    : never;
}[EventName<TEvents>];

export type EventPayloadMap = {
  [TType in EventType]: unknown;
};

export interface EventEnvelope<
  TType extends string = EventType,
  TPayload = unknown,
> {
  readonly id: string;
  readonly type: TType;
  readonly domain: EventDomain<TType>;
  readonly payload: TPayload;
  readonly timestamp: string;
  readonly organizationId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Kept for consumers of the original package API. */
export interface SystemEvent<
  TPayload = unknown,
  TType extends EventType = EventType,
> {
  id: string;
  type: TType;
  payload: TPayload;
  timestamp: string;
  organizationId: string;
}

export interface EventHandler<TEvent extends SystemEvent = SystemEvent> {
  (event: TEvent): void | Promise<void>;
}

export type TypedEvent<
  TEvents extends EventMap,
  TName extends EventName<TEvents>,
> = EventEnvelope<TName, TEvents[TName]>;

export type TypedEventHandler<
  TEvents extends EventMap,
  TName extends EventName<TEvents>,
> = (event: TypedEvent<TEvents, TName>) => void | Promise<void>;

export type AnyEvent<TEvents extends EventMap> = {
  [TName in EventName<TEvents>]: TypedEvent<TEvents, TName>;
}[EventName<TEvents>];

export type AnyEventHandler<TEvents extends EventMap> = (
  event: AnyEvent<TEvents>,
) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface PublishOptions {
  correlationId?: string;
  causationId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface EventDispatchError<TEvents extends EventMap = EventPayloadMap> {
  readonly error: unknown;
  readonly event: AnyEvent<TEvents>;
  readonly selector: string;
}

export type EventErrorHandler<TEvents extends EventMap = EventPayloadMap> = (
  failure: EventDispatchError<TEvents>,
) => void | Promise<void>;

export interface EventBus<TEvents extends EventMap = EventPayloadMap> {
  emit<TName extends EventName<TEvents>>(
    type: TName,
    payload: TEvents[TName],
    organizationId: string,
    options?: PublishOptions,
  ): void;

  publish<TName extends EventName<TEvents>>(
    type: TName,
    payload: TEvents[TName],
    organizationId: string,
    options?: PublishOptions,
  ): Promise<TypedEvent<TEvents, TName>>;

  on<TName extends EventName<TEvents>>(
    type: TName,
    handler: TypedEventHandler<TEvents, TName>,
  ): Unsubscribe;

  off<TName extends EventName<TEvents>>(
    type: TName,
    handler: TypedEventHandler<TEvents, TName>,
  ): void;

  onAny(handler: AnyEventHandler<TEvents>): Unsubscribe;

  onDomain<TDomain extends string>(
    domain: TDomain,
    handler: (
      event: TypedEvent<TEvents, DomainEventName<TEvents, TDomain>>,
    ) => void | Promise<void>,
  ): Unsubscribe;
}
