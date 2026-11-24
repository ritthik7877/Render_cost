import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoApp } from "./DemoApp";
import { RenderCostPanel } from "../rendercost/RenderCostPanel";
import { RenderCostProvider } from "../rendercost/RenderCostProvider";

describe("demo render scenarios", () => {
  it("shows all four intentional render reasons", async () => {
    render(
      <RenderCostProvider>
        <DemoApp />
        <RenderCostPanel />
      </RenderCostProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increment counter" }));

    const expectations = [
      ["PassiveChild", "Parent re-render"],
      ["HandlerChild", "New function reference"],
      ["DataChild", "New object/array reference"],
      ["DemoTheme", "Context update"],
    ];

    for (const [component, reason] of expectations) {
      const row = await screen.findByRole("row", {
        name: new RegExp(component),
      });
      expect(within(row).getByText(reason)).toBeInTheDocument();
    }
  });
});
