import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenderCostPanel } from "./RenderCostPanel";
import { RenderCostProvider } from "./RenderCostProvider";
import { withRenderCost } from "./withRenderCost";

describe("RenderCostPanel", () => {
  it("sorts components by unnecessary renders and shows selected render history", () => {
    const Wasteful = withRenderCost(
      ({ value }: { value: number }) => <span>{value}</span>,
      "Wasteful",
    );
    const Necessary = withRenderCost(
      ({ value }: { value: number }) => <span>{value}</span>,
      "Necessary",
    );

    const view = render(
      <RenderCostProvider>
        <Wasteful value={1} />
        <Necessary value={1} />
        <RenderCostPanel />
      </RenderCostProvider>,
    );

    view.rerender(
      <RenderCostProvider>
        <Wasteful value={1} />
        <Necessary value={2} />
        <RenderCostPanel />
      </RenderCostProvider>,
    );
    view.rerender(
      <RenderCostProvider>
        <Wasteful value={1} />
        <Necessary value={3} />
        <RenderCostPanel />
      </RenderCostProvider>,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Wasteful");
    expect(rows[2]).toHaveTextContent("Necessary");

    fireEvent.click(screen.getByRole("row", { name: /Wasteful/ }));

    const details = screen.getByRole("region", {
      name: "Wasteful render details",
    });
    expect(
      within(details).getAllByText("Parent re-render").length,
    ).toBeGreaterThan(0);
    expect(
      within(details).getAllByText("Changed props: none").length,
    ).toBeGreaterThan(0);
  });

  it("collapses, pauses, resumes, and resets the panel", () => {
    render(
      <RenderCostProvider>
        <RenderCostPanel />
      </RenderCostProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse RenderCost panel" }),
    );
    expect(
      screen.getByRole("button", { name: "Expand RenderCost panel" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/No renders recorded yet/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Expand RenderCost panel" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("Paused")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByText("Tracking")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/No renders recorded yet/)).toBeInTheDocument();
  });

  it("suggests the useCallback fix and copies the snippet", async () => {
    const Handler = withRenderCost(
      ({ onAction }: { onAction: () => void }) => (
        <button onClick={onAction}>Handler</button>
      ),
      "Handler",
    );
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const originalClipboard = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });

    try {
      const view = render(
        <RenderCostProvider>
          <Handler onAction={() => undefined} />
          <RenderCostPanel />
        </RenderCostProvider>,
      );
      view.rerender(
        <RenderCostProvider>
          <Handler onAction={() => undefined} />
          <RenderCostPanel />
        </RenderCostProvider>,
      );

      fireEvent.click(screen.getByRole("row", { name: /Handler/ }));
      fireEvent.click(screen.getByRole("button", { name: "Suggest fix" }));

      const suggestion = screen.getByRole("region", { name: "Suggested fix" });
      expect(within(suggestion).getAllByText(/useCallback/).length).toBeGreaterThan(0);
      expect(within(suggestion).getAllByText(/onAction/).length).toBeGreaterThan(0);
      fireEvent.click(
        within(suggestion).getByRole("button", { name: "Copy snippet" }),
      );
      expect(await within(suggestion).findByText("Snippet copied.")).toBeInTheDocument();
      expect(clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("useCallback"),
      );
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }
    }
  });

  it("suggests useMemo for a new object reference", () => {
    const Configured = withRenderCost(
      ({ options }: { options: { mode: string } }) => <span>{options.mode}</span>,
      "Configured",
    );
    const view = render(
      <RenderCostProvider>
        <Configured options={{ mode: "dark" }} />
        <RenderCostPanel />
      </RenderCostProvider>,
    );
    view.rerender(
      <RenderCostProvider>
        <Configured options={{ mode: "dark" }} />
        <RenderCostPanel />
      </RenderCostProvider>,
    );

    fireEvent.click(screen.getByRole("row", { name: /Configured/ }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest fix" }));

    expect(screen.getByRole("region", { name: "Suggested fix" })).toHaveTextContent(
      "useMemo",
    );
  });

  it("suggests React.memo for unchanged props on a parent re-render", () => {
    const Component = withRenderCost(() => <span>Stable child</span>, "StableChild");
    const view = render(
      <RenderCostProvider>
        <Component />
        <RenderCostPanel />
      </RenderCostProvider>,
    );
    view.rerender(
      <RenderCostProvider>
        <Component />
        <RenderCostPanel />
      </RenderCostProvider>,
    );

    fireEvent.click(screen.getByRole("row", { name: /StableChild/ }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest fix" }));

    expect(screen.getByRole("region", { name: "Suggested fix" })).toHaveTextContent(
      "React.memo",
    );
  });

  it("simulates memo so unchanged parent renders stop reaching the component", () => {
    let renderCount = 0;
    const Component = withRenderCost(() => {
      renderCount += 1;
      return <span>Memo target</span>;
    }, "MemoTarget");

    const view = render(
      <RenderCostProvider>
        <Component />
        <RenderCostPanel />
      </RenderCostProvider>,
    );
    view.rerender(
      <RenderCostProvider>
        <Component />
        <RenderCostPanel />
      </RenderCostProvider>,
    );
    expect(renderCount).toBe(2);

    fireEvent.click(screen.getByRole("row", { name: /MemoTarget/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate memo" }));
    const countAfterEnabling = renderCount;

    view.rerender(
      <RenderCostProvider>
        <Component />
        <RenderCostPanel />
      </RenderCostProvider>,
    );
    expect(renderCount).toBe(countAfterEnabling);
    expect(
      screen.getByRole("button", { name: "Stop simulating memo" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
