import { describe, expect, it, vi } from "vitest";
import { activateWaitingWorker } from "./updates";

class FakeContainer extends EventTarget {
  order: string[] = [];

  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    this.order.push(`listen:${type}`);
    super.addEventListener(type, callback, options);
  }
}

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installed";
  order: string[];
  onMessage: () => void;

  constructor(order: string[], onMessage: () => void) {
    super();
    this.order = order;
    this.onMessage = onMessage;
  }

  postMessage(message: unknown) {
    this.order.push(`message:${JSON.stringify(message)}`);
    this.onMessage();
  }
}

describe("PWA update activation", () => {
  it("listens for controllerchange before requesting immediate activation", () => {
    const container = new FakeContainer();
    const reload = vi.fn();
    const worker = new FakeWorker(container.order, () => container.dispatchEvent(new Event("controllerchange")));

    activateWaitingWorker(worker as unknown as ServiceWorker, container as unknown as ServiceWorkerContainer, reload);

    expect(container.order).toEqual([
      "listen:controllerchange",
      'message:{"type":"SKIP_WAITING"}',
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("also reloads when activation completes without a controllerchange event", () => {
    const container = new FakeContainer();
    const reload = vi.fn();
    const worker = new FakeWorker(container.order, () => {
      worker.state = "activated";
      worker.dispatchEvent(new Event("statechange"));
    });

    activateWaitingWorker(worker as unknown as ServiceWorker, container as unknown as ServiceWorkerContainer, reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads twice when both activation signals arrive", () => {
    const container = new FakeContainer();
    const reload = vi.fn();
    const worker = new FakeWorker(container.order, () => {
      worker.state = "activated";
      worker.dispatchEvent(new Event("statechange"));
      container.dispatchEvent(new Event("controllerchange"));
    });

    activateWaitingWorker(worker as unknown as ServiceWorker, container as unknown as ServiceWorkerContainer, reload);

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
