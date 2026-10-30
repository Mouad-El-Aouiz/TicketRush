import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { context, propagation } from '@opentelemetry/api';
export const requestContext = new AsyncLocalStorage<{
  correlationId: string;
}>();
export function messageContext() {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    correlationId: requestContext.getStore()?.correlationId ?? randomUUID(),
    ...(carrier.traceparent ? { traceparent: carrier.traceparent } : {}),
  };
}
