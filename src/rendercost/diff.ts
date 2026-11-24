export type RenderReason =
  | "value-changed"
  | "new-function-reference"
  | "new-object-or-array-reference"
  | "context-update"
  | "parent-rerender";

export type PropsSnapshot = object;

export interface PropChange {
  name: string;
  reason: Exclude<RenderReason, "context-update" | "parent-rerender">;
  previousValue: unknown;
  nextValue: unknown;
}

export interface ContextSnapshot {
  previousValue: unknown;
  nextValue: unknown;
}

export interface RenderDiff {
  changes: PropChange[];
  reasons: RenderReason[];
  isUnnecessary: boolean;
  isInitialRender: boolean;
}

export function classifyRender(
  previousProps: PropsSnapshot | null,
  nextProps: PropsSnapshot,
  context?: ContextSnapshot,
): RenderDiff {
  if (previousProps === null) {
    return {
      changes: [],
      reasons: [],
      isUnnecessary: false,
      isInitialRender: true,
    };
  }

  const changes = diffProps(previousProps, nextProps);
  const contextChanged =
    context !== undefined &&
    !Object.is(context.previousValue, context.nextValue);
  const reasons: RenderReason[] = changes.map((change) => change.reason);

  if (contextChanged) {
    reasons.push("context-update");
  } else if (reasons.length === 0) {
    reasons.push("parent-rerender");
  }

  const isUnnecessary =
    !contextChanged &&
    changes.every(
      ({ reason }) =>
        reason === "new-function-reference" ||
        reason === "new-object-or-array-reference",
    );

  return {
    changes,
    reasons,
    isUnnecessary,
    isInitialRender: false,
  };
}

export function diffProps(
  previousProps: PropsSnapshot,
  nextProps: PropsSnapshot,
): PropChange[] {
  const changes: PropChange[] = [];
  const names = new Set([
    ...Object.keys(previousProps),
    ...Object.keys(nextProps),
  ]);

  for (const name of names) {
    const previousValue = Reflect.get(previousProps, name);
    const nextValue = Reflect.get(nextProps, name);

    if (Object.is(previousValue, nextValue)) {
      continue;
    }

    let reason: PropChange["reason"] = "value-changed";

    if (
      typeof previousValue === "function" &&
      typeof nextValue === "function" &&
      Function.prototype.toString.call(previousValue) ===
        Function.prototype.toString.call(nextValue)
    ) {
      reason = "new-function-reference";
    } else if (
      isObjectOrArray(previousValue) &&
      isObjectOrArray(nextValue) &&
      areDeepEqual(previousValue, nextValue)
    ) {
      reason = "new-object-or-array-reference";
    }

    changes.push({ name, reason, previousValue, nextValue });
  }

  return changes;
}

function isObjectOrArray(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function areDeepEqual(
  left: unknown,
  right: unknown,
  compared = new WeakMap<object, object>(),
): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isObjectOrArray(left) || !isObjectOrArray(right)) {
    return false;
  }

  const previouslyCompared = compared.get(left);

  if (previouslyCompared !== undefined) {
    return previouslyCompared === right;
  }

  compared.set(left, right);

  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  const rightRecord = right as Record<string, unknown>;

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      areDeepEqual(
        (left as Record<string, unknown>)[key],
        rightRecord[key],
        compared,
      ),
  );
}
