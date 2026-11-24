import {
  useContext,
  useLayoutEffect,
  useRef,
  type Context,
} from "react";
import {
  classifyRender,
  type ContextSnapshot,
  type PropsSnapshot,
} from "./diff";
import { useRenderCostStore } from "./RenderCostProvider";

export function useRenderTracker(
  name: string,
  props: PropsSnapshot,
): string | null {
  return useTrackRender(name, props, undefined, false);
}

export function useTrackedContext<T>(
  context: Context<T>,
  name = context.displayName ?? "Context",
): T {
  const value = useContext(context);
  useTrackRender(name, {}, value, true);
  return value;
}

function useTrackRender(
  name: string,
  props: PropsSnapshot,
  contextValue: unknown,
  hasContext: boolean,
): string | null {
  const store = useRenderCostStore();
  const previousProps = useRef<PropsSnapshot | null>(null);
  const previousContext = useRef<unknown>(undefined);
  const hasPreviousContext = useRef(false);
  const renderStartedAt = useRef(0);

  const enabled = store?.getSnapshot().enabled ?? false;
  if (enabled) {
    renderStartedAt.current = performance.now();
  }
  const contextSnapshot: ContextSnapshot | undefined =
    hasContext && hasPreviousContext.current
      ? {
          previousValue: previousContext.current,
          nextValue: contextValue,
        }
      : undefined;
  const diff = enabled
    ? classifyRender(previousProps.current, props, contextSnapshot)
    : null;
  previousProps.current = props;

  if (hasContext) {
    previousContext.current = contextValue;
    hasPreviousContext.current = true;
  }

  const eventId = diff === null
    ? null
    : store?.recordRender(
    name,
    diff.reasons,
    diff.changes,
    diff.isUnnecessary,
  ) ?? null;

  useLayoutEffect(() => {
    if (eventId !== null) {
      store?.setDuration(
        eventId,
        performance.now() - renderStartedAt.current,
      );
    }
  });

  return eventId;
}
