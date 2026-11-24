import { DemoApp } from "./demo/DemoApp";
import { RenderCostPanel, RenderCostProvider } from "./rendercost";

export default function App() {
  return (
    <RenderCostProvider>
      <DemoApp />
      <RenderCostPanel />
    </RenderCostProvider>
  );
}
