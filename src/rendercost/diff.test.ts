import { describe, expect, it } from "vitest";
import { classifyRender, diffProps } from "./diff";

describe("diffProps", () => {
  it("classifies changed values", () => {
    expect(diffProps({ count: 1 }, { count: 2 })).toEqual([
      {
        name: "count",
        reason: "value-changed",
        previousValue: 1,
        nextValue: 2,
      },
    ]);
  });

  it("classifies new functions with matching source", () => {
    const previous = { onClick: () => 1 };
    const next = { onClick: () => 1 };

    expect(diffProps(previous, next)[0]?.reason).toBe(
      "new-function-reference",
    );
  });

  it("classifies deeply equal object and array references", () => {
    const changes = diffProps(
      { config: { theme: "dark" }, items: [1, { id: 2 }] },
      { config: { theme: "dark" }, items: [1, { id: 2 }] },
    );

    expect(changes.map(({ reason }) => reason)).toEqual([
      "new-object-or-array-reference",
      "new-object-or-array-reference",
    ]);
  });

  it("treats a new object reference with different content as a value change", () => {
    expect(diffProps({ config: { theme: "dark" } }, { config: { theme: "light" } })[0]?.reason).toBe(
      "value-changed",
    );
  });

  it("compares cyclic object props without recursing indefinitely", () => {
    const previous: { self?: unknown } = {};
    previous.self = previous;
    const next: { self?: unknown } = {};
    next.self = next;

    expect(diffProps({ value: previous }, { value: next })[0]?.reason).toBe(
      "new-object-or-array-reference",
    );
  });

  it("detects removed and added props", () => {
    expect(diffProps({ oldProp: true }, { newProp: true })).toEqual([
      {
        name: "oldProp",
        reason: "value-changed",
        previousValue: true,
        nextValue: undefined,
      },
      {
        name: "newProp",
        reason: "value-changed",
        previousValue: undefined,
        nextValue: true,
      },
    ]);
  });
});

describe("classifyRender", () => {
  it("does not mark the initial render as unnecessary", () => {
    expect(classifyRender(null, { value: 1 })).toEqual({
      changes: [],
      reasons: [],
      isUnnecessary: false,
      isInitialRender: true,
    });
  });

  it("classifies unchanged props as a parent re-render", () => {
    const result = classifyRender({ value: 1 }, { value: 1 });

    expect(result.reasons).toEqual(["parent-rerender"]);
    expect(result.isUnnecessary).toBe(true);
  });

  it("marks same-source function and deep-equal object changes unnecessary", () => {
    const result = classifyRender(
      { onClick: () => 1, config: { theme: "dark" } },
      { onClick: () => 1, config: { theme: "dark" } },
    );

    expect(result.reasons).toEqual([
      "new-function-reference",
      "new-object-or-array-reference",
    ]);
    expect(result.isUnnecessary).toBe(true);
  });

  it("classifies changed context as a necessary context update", () => {
    const result = classifyRender(
      { value: "same" },
      { value: "same" },
      { previousValue: { theme: "dark" }, nextValue: { theme: "light" } },
    );

    expect(result.reasons).toEqual(["context-update"]);
    expect(result.isUnnecessary).toBe(false);
  });

  it("detects a new context object even when its contents are equal", () => {
    const result = classifyRender(
      {},
      {},
      { previousValue: { theme: "dark" }, nextValue: { theme: "dark" } },
    );

    expect(result.reasons).toEqual(["context-update"]);
  });

  it("does not mark changed values as unnecessary", () => {
    const result = classifyRender({ count: 1 }, { count: 2 });

    expect(result.reasons).toEqual(["value-changed"]);
    expect(result.isUnnecessary).toBe(false);
  });
});
