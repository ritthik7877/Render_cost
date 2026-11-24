import type { PropChange, RenderReason } from "./diff";

export interface RenderEvent {
  id: string;
  timestamp: number;
  reasons: RenderReason[];
  changedProps: PropChange[];
  isUnnecessary: boolean;
  durationMs: number;
}

export interface ComponentRenderStats {
  name: string;
  renderCount: number;
  unnecessaryRenderCount: number;
  wastedTimeMs: number;
  reasonCounts: Partial<Record<RenderReason, number>>;
  events: RenderEvent[];
}

export interface RenderCostSnapshot {
  enabled: boolean;
  components: ComponentRenderStats[];
  simulatedMemo: string[];
}

export interface RenderCostStore {
  getSnapshot: () => RenderCostSnapshot;
  subscribe: (listener: () => void) => () => void;
  recordRender: (
    name: string,
    reasons: RenderReason[],
    changedProps: PropChange[],
    isUnnecessary: boolean,
  ) => string | null;
  setDuration: (eventId: string, durationMs: number) => void;
  setEnabled: (enabled: boolean) => void;
  setSimulatedMemo: (name: string, enabled: boolean) => void;
  reset: () => void;
}

const MAX_EVENTS_PER_COMPONENT = 50;

let nextEventId = 0;

export function createRenderCostStore(initiallyEnabled = true): RenderCostStore {
  const listeners = new Set<() => void>();
  const components = new Map<string, ComponentRenderStats>();
  const eventNames = new Map<string, string>();
  const simulatedMemo = new Set<string>();
  let notificationQueued = false;
  let notificationVersion = 0;
  let snapshot: RenderCostSnapshot = {
    enabled: initiallyEnabled,
    components: [],
    simulatedMemo: [],
  };

  const notifyListeners = () => {
    listeners.forEach((listener) => listener());
  };

  const scheduleNotification = () => {
    if (notificationQueued) {
      return;
    }

    notificationQueued = true;
    const version = ++notificationVersion;
    Promise.resolve().then(() => {
      if (version !== notificationVersion) {
        return;
      }

      notificationQueued = false;
      notifyListeners();
    });
  };

  const publish = (deferNotification = false) => {
    snapshot = {
      enabled: snapshot.enabled,
      components: Array.from(components.values()),
      simulatedMemo: Array.from(simulatedMemo),
    };
    if (deferNotification) {
      scheduleNotification();
    } else {
      notificationQueued = false;
      notificationVersion += 1;
      notifyListeners();
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    recordRender: (name, reasons, changedProps, isUnnecessary) => {
      if (!snapshot.enabled) {
        return null;
      }

      const event: RenderEvent = {
        id: `render-${++nextEventId}`,
        timestamp: Date.now(),
        reasons,
        changedProps,
        isUnnecessary,
        durationMs: 0,
      };
      const previous = components.get(name);
      const component: ComponentRenderStats = previous
        ? {
            ...previous,
            renderCount: previous.renderCount + 1,
            unnecessaryRenderCount:
              previous.unnecessaryRenderCount + Number(isUnnecessary),
            reasonCounts: { ...previous.reasonCounts },
            events: [...previous.events, event].slice(-MAX_EVENTS_PER_COMPONENT),
          }
        : {
            name,
            renderCount: 1,
            unnecessaryRenderCount: Number(isUnnecessary),
            wastedTimeMs: 0,
            reasonCounts: {},
            events: [event],
          };

      for (const reason of reasons) {
        component.reasonCounts[reason] =
          (component.reasonCounts[reason] ?? 0) + 1;
      }

      components.set(name, component);
      if (previous && previous.events.length === MAX_EVENTS_PER_COMPONENT) {
        const expiredEvent = previous.events[0];
        if (expiredEvent) {
          eventNames.delete(expiredEvent.id);
        }
      }
      eventNames.set(event.id, name);
      publish(true);
      return event.id;
    },
    setDuration: (eventId, durationMs) => {
      const name = eventNames.get(eventId);
      if (name === undefined) {
        return;
      }

      const previous = components.get(name);

      if (!previous) {
        return;
      }

      const eventIndex = previous.events.findIndex(
        (event) => event.id === eventId,
      );

      if (eventIndex < 0) {
        eventNames.delete(eventId);
        return;
      }

      const oldEvent = previous.events[eventIndex];
      if (!oldEvent) {
        return;
      }

      const updatedEvent = { ...oldEvent, durationMs };
      const events = previous.events.slice();
      events[eventIndex] = updatedEvent;
      components.set(name, {
        ...previous,
        wastedTimeMs:
          previous.wastedTimeMs +
          (updatedEvent.isUnnecessary ? durationMs - oldEvent.durationMs : 0),
        events,
      });
      publish();
    },
    setEnabled: (enabled) => {
      if (snapshot.enabled === enabled) {
        return;
      }

      snapshot = { ...snapshot, enabled };
      publish();
    },
    setSimulatedMemo: (name, enabled) => {
      if (simulatedMemo.has(name) === enabled) {
        return;
      }

      if (enabled) {
        simulatedMemo.add(name);
      } else {
        simulatedMemo.delete(name);
      }

      publish();
    },
    reset: () => {
      components.clear();
      eventNames.clear();
      publish();
    },
  };
}
