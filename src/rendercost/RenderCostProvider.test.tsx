import { createContext } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RenderCostProvider,
  useRenderCostSnapshot,
  useRenderCostStore,
} from "./RenderCostProvider";
import { useRenderTracker, useTrackedContext } from "./useRenderTracker";
import { withRenderCost } from "./withRenderCost";

function SnapshotProbe() {
  const snapshot = useRenderCostSnapshot();
  return <output data-testid="snapshot">{JSON.stringify(snapshot)}</output>;
}

describe("withRenderCost", () => {
  it("tracks render counts, prop changes, and unnecessary renders", () => {
    const renderSpy = vi.fn();
    const Component = withRenderCost(({ value }: { value: number }) => {
      renderSpy();
      return <span>{value}</span>;
    }, "TrackedCounter");

    const view = render(
      <RenderCostProvider>
        <Component value={1} />
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    view.rerender(
      <RenderCostProvider>
        <Component value={1} />
        <SnapshotProbe />
      </RenderCostProvider>,
    );
    view.rerender(
      <RenderCostProvider>
        <Component value={2} />
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    const snapshot = JSON.parse(
      screen.getByTestId("snapshot").textContent ?? "{}",
    ) as {
      components: Array<{
        name: string;
        renderCount: number;
        unnecessaryRenderCount: number;
        events: Array<{ changedProps: Array<{ name: string }> }>;
      }>;
    };
    const stats = snapshot.components.find(
      (component) => component.name === "TrackedCounter",
    );

    expect(renderSpy).toHaveBeenCalledTimes(3);
    expect(stats?.renderCount).toBe(3);
    expect(stats?.unnecessaryRenderCount).toBe(1);
    const lastEvent = stats?.events[stats.events.length - 1];
    expect(lastEvent?.changedProps.map(({ name }) => name)).toEqual(["value"]);
  });

  it("does not record renders when the provider is disabled", () => {
    const Component = withRenderCost(() => <span>untracked</span>, "Disabled");
    render(
      <RenderCostProvider initiallyEnabled={false}>
        <Component />
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    const snapshot = JSON.parse(
      screen.getByTestId("snapshot").textContent ?? "{}",
    ) as { components: unknown[] };
    expect(snapshot.components).toEqual([]);
  });

  it("starts tracking when enabled through the store", () => {
    const renderSpy = vi.fn();
    const Component = withRenderCost(() => {
      renderSpy();
      return <span>toggle</span>;
    }, "Toggled");
    function EnableButton() {
      const store = useRenderCostStore();
      return (
        <button onClick={() => store?.setEnabled(true)}>
          Enable tracking
        </button>
      );
    }

    render(
      <RenderCostProvider initiallyEnabled={false}>
        <Component />
        <EnableButton />
        <SnapshotProbe />
      </RenderCostProvider>,
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Enable tracking" }));

    expect(renderSpy).toHaveBeenCalledTimes(2);
    const snapshot = JSON.parse(
      screen.getByTestId("snapshot").textContent ?? "{}",
    ) as { components: Array<{ name: string; renderCount: number }> };
    expect(
      snapshot.components.find((component) => component.name === "Toggled")
        ?.renderCount,
    ).toBe(1);
  });

  it("returns the original component in production", () => {
    const Component = () => <span>production</span>;
    vi.stubEnv("NODE_ENV", "production");

    expect(withRenderCost(Component)).toBe(Component);

    vi.unstubAllEnvs();
  });
});

describe("render tracking hooks", () => {
  it("tracks props when used directly", () => {
    function HookTracked({ label }: { label: string }) {
      useRenderTracker("HookTracked", { label });
      return <span>{label}</span>;
    }

    const view = render(
      <RenderCostProvider>
        <HookTracked label="before" />
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    view.rerender(
      <RenderCostProvider>
        <HookTracked label="after" />
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    const snapshot = JSON.parse(
      screen.getByTestId("snapshot").textContent ?? "{}",
    ) as { components: Array<{ name: string; renderCount: number }> };
    expect(
      snapshot.components.find((component) => component.name === "HookTracked")
        ?.renderCount,
    ).toBe(2);
  });

  it("reports a changed context value through useTrackedContext", () => {
    const ThemeContext = createContext("light");
    ThemeContext.displayName = "Theme";
    function ContextTracked() {
      const theme = useTrackedContext(ThemeContext);
      return <span>{theme}</span>;
    }

    const view = render(
      <RenderCostProvider>
        <ThemeContext.Provider value="light">
          <ContextTracked />
        </ThemeContext.Provider>
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    view.rerender(
      <RenderCostProvider>
        <ThemeContext.Provider value="dark">
          <ContextTracked />
        </ThemeContext.Provider>
        <SnapshotProbe />
      </RenderCostProvider>,
    );

    const snapshot = JSON.parse(
      screen.getByTestId("snapshot").textContent ?? "{}",
    ) as {
      components: Array<{
        name: string;
        events: Array<{ reasons: string[] }>;
      }>;
    };

    const events = snapshot.components.find(
      (component) => component.name === "Theme",
    )?.events;
    expect(events?.[events.length - 1]?.reasons).toContain("context-update");
  });
});
