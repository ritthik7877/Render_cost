import {
  createElement,
  memo,
  Profiler,
  type ComponentType,
  useCallback,
  useSyncExternalStore,
} from "react";
import { useRenderCostStore } from "./RenderCostProvider";
import { useRenderTracker } from "./useRenderTracker";

declare const process:
  | { env: { NODE_ENV?: string } }
  | undefined;

const subscribeToNothing = () => () => {};
const getDisabledSnapshot = () => false;

export function withRenderCost<Props extends object>(
  Component: ComponentType<Props>,
  name = Component.displayName ?? Component.name ?? "Anonymous",
): ComponentType<Props> {
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "production"
  ) {
    return Component;
  }

  function TrackedRender(props: Props) {
    const store = useRenderCostStore();
    const eventId = useRenderTracker(name, props);

    return createElement(
      Profiler,
      {
        id: name,
        onRender: (_id, _phase, actualDuration) => {
          if (eventId !== null) {
            store?.setDuration(eventId, actualDuration);
          }
        },
      },
      createElement(Component, props),
    );
  }

  const MemoizedTrackedRender = memo<Props>(TrackedRender);
  MemoizedTrackedRender.displayName = `memo(${name})`;

  function RenderCostTracked(props: Props) {
    const store = useRenderCostStore();
    const getEnabled = useCallback(
      () => store?.getSnapshot().enabled ?? false,
      [store],
    );
    const enabled = useSyncExternalStore(
      store?.subscribe ?? subscribeToNothing,
      store ? getEnabled : getDisabledSnapshot,
      store ? getEnabled : getDisabledSnapshot,
    );
    const getSimulatedMemo = useCallback(
      () => store?.getSnapshot().simulatedMemo.includes(name) ?? false,
      [name, store],
    );
    const isSimulatedMemo = useSyncExternalStore(
      store?.subscribe ?? subscribeToNothing,
      store ? getSimulatedMemo : getDisabledSnapshot,
      store ? getSimulatedMemo : getDisabledSnapshot,
    );

    if (!enabled) {
      return createElement(Component, props);
    }

    if (isSimulatedMemo) {
      return <MemoizedTrackedRender {...props} />;
    }

    return <TrackedRender {...props} />;
  }

  RenderCostTracked.displayName = `withRenderCost(${name})`;
  return RenderCostTracked;
}
