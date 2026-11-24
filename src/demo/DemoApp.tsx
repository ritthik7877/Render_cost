import { createContext, useState } from "react";
import { useTrackedContext, withRenderCost } from "../rendercost";

interface DemoTheme {
  accent: string;
  revision: number;
}

const DemoThemeContext = createContext<DemoTheme>({
  accent: "mint",
  revision: 0,
});
DemoThemeContext.displayName = "DemoTheme";

const PassiveChild = withRenderCost(
  ({ label }: { label: string }) => (
    <article className="demo-card">
      <span className="demo-card-kicker">Parent re-render</span>
      <h2>Stable child</h2>
      <p>{label}</p>
    </article>
  ),
  "PassiveChild",
);

const HandlerChild = withRenderCost(
  ({ onAction }: { onAction: () => void }) => (
    <article className="demo-card">
      <span className="demo-card-kicker">Inline function prop</span>
      <h2>Fresh handler</h2>
      <p>A new callback reference is created on each parent render.</p>
      <button type="button" onClick={onAction}>
        Run handler
      </button>
    </article>
  ),
  "HandlerChild",
);

interface DemoOptions {
  tone: string;
  density: string;
}

const DataChild = withRenderCost(
  ({
    options,
    items,
  }: {
    options: DemoOptions;
    items: string[];
  }) => (
    <article className="demo-card">
      <span className="demo-card-kicker">Inline object and array props</span>
      <h2>Fresh data references</h2>
      <p>
        {options.tone} tone · {options.density} layout
      </p>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  ),
  "DataChild",
);

function ContextChild() {
  const theme = useTrackedContext(DemoThemeContext);

  return (
    <article className="demo-card">
      <span className="demo-card-kicker">Frequently replaced context value</span>
      <h2>Context consumer</h2>
      <p>
        Accent: {theme.accent} · revision: {theme.revision}
      </p>
    </article>
  );
}

export function DemoApp() {
  const [count, setCount] = useState(0);
  const theme = { accent: "mint", revision: count };
  const increment = () => setCount((current) => current + 1);

  return (
    <DemoThemeContext.Provider value={theme}>
      <main className="demo-shell">
        <header className="demo-header">
          <div className="demo-brand">
            <span className="demo-mark">RC</span>
            <div>
              <p className="demo-eyebrow">React performance workbench</p>
              <h1>RenderCost</h1>
            </div>
          </div>
          <p className="demo-intro">
            Find avoidable renders, understand what changed, and try a memo fix
            live.
          </p>
        </header>

        <section className="demo-counter" aria-label="Demo controls">
          <div>
            <span className="demo-eyebrow">Parent state</span>
            <p>
              Counter updates intentionally refresh all four examples. Check
              the RenderCost panel for the reason behind each render.
            </p>
          </div>
          <div className="demo-counter-control">
            <output aria-label="Counter value">{count}</output>
            <button type="button" onClick={increment}>
              Increment counter
            </button>
          </div>
        </section>

        <section className="demo-grid" aria-label="Intentional render examples">
          <PassiveChild label="This child receives the same props each time." />
          <HandlerChild
            onAction={() => setCount((current) => current + 1)}
          />
          <DataChild
            options={{ tone: "cool", density: "comfortable" }}
            items={["alpha", "beta", "gamma"]}
          />
          <ContextChild />
        </section>
      </main>
    </DemoThemeContext.Provider>
  );
}
