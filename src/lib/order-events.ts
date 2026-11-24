import { EventEmitter } from "events";

const globalForOrderEvents = globalThis as typeof globalThis & {
  __ecoOrderEvents?: EventEmitter;
};

const orderEvents =
  globalForOrderEvents.__ecoOrderEvents ?? new EventEmitter();

if (!globalForOrderEvents.__ecoOrderEvents) {
  orderEvents.setMaxListeners(100);
  globalForOrderEvents.__ecoOrderEvents = orderEvents;
}

const NEW_ORDER_EVENT = "new-order";

export function emitNewOrder(order: unknown): void {
  orderEvents.emit(NEW_ORDER_EVENT, order);
}

export function onNewOrder(listener: (order: unknown) => void): () => void {
  orderEvents.on(NEW_ORDER_EVENT, listener);
  return () => {
    orderEvents.off(NEW_ORDER_EVENT, listener);
  };
}
