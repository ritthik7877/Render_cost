import { useMemo, useState } from "react";
import type {
  ComponentRenderStats,
  RenderEvent,
} from "./store";
import { useRenderCostSnapshot, useRenderCostStore } from "./RenderCostProvider";
import type { RenderReason } from "./diff";
import "./RenderCostPanel.css";

interface FixSuggestion {
  reason: "new-function-reference" | "new-object-or-array-reference" | "parent-rerender";
  title: string;
  before: string;
  after: string;
}

const reasonLabels: Record<RenderReason, string> = {
  "value-changed": "Value changed",
  "new-function-reference": "New function reference",
  "new-object-or-array-reference": "New object/array reference",
  "context-update": "Context update",
  "parent-rerender": "Parent re-render",
};

const fixableReasons: FixSuggestion["reason"][] = [
  "new-function-reference",
  "new-object-or-array-reference",
  "parent-rerender",
];

function getTopReason(
  reasonCounts: ComponentRenderStats["reasonCounts"],
): RenderReason | null {
  let topReason: RenderReason | null = null;
  let topCount = 0;

  for (const [reason, count] of Object.entries(reasonCounts)) {
    if (count !== undefined && count > topCount) {
      topReason = reason as RenderReason;
      topCount = count;
    }
  }

  return topReason;
}

function getFixSuggestion(
  component: ComponentRenderStats,
): FixSuggestion | null {
  const reasonCounts = new Map<FixSuggestion["reason"], number>();

  for (const event of component.events) {
    if (!event.isUnnecessary) {
      continue;
    }

    for (const reason of event.reasons) {
      if (fixableReasons.includes(reason as FixSuggestion["reason"])) {
        const fixableReason = reason as FixSuggestion["reason"];
        reasonCounts.set(
          fixableReason,
          (reasonCounts.get(fixableReason) ?? 0) + 1,
        );
      }
    }
  }

  const reason = fixableReasons.reduce<FixSuggestion["reason"] | null>(
    (topReason, candidate) =>
      (reasonCounts.get(candidate) ?? 0) >
      (topReason === null ? 0 : reasonCounts.get(topReason) ?? 0)
        ? candidate
        : topReason,
    null,
  );
  if (reason === null) {
    return null;
  }

  const latestChange = [...component.events]
    .reverse()
    .flatMap((event) => event.changedProps)
    .find((change) => change.reason === reason);
  const propName =
    latestChange?.name ??
    (reason === "new-function-reference" ? "onAction" : "value");

  if (reason === "new-function-reference") {
    return {
      reason,
      title: "Wrap the handler in useCallback",
      before: `<${component.name} ${propName}={() => handleAction()} />`,
      after: [
        `import { useCallback } from "react";`,
        "",
        `const ${propName} = useCallback(() => handleAction(), [handleAction]);`,
        `<${component.name} ${propName}={${propName}} />`,
      ].join("\n"),
    };
  }

  if (reason === "new-object-or-array-reference") {
    const isArray = Array.isArray(latestChange?.nextValue);
    const expression = isArray ? "[...items]" : "({ ... })";
    return {
      reason,
      title: "Wrap the value in useMemo",
      before: `<${component.name} ${propName}={${expression}} />`,
      after: [
        `import { useMemo } from "react";`,
        "",
        `const ${propName} = useMemo(() => ${expression}, [dependencies]);`,
        `<${component.name} ${propName}={${propName}} />`,
      ].join("\n"),
    };
  }

  return {
    reason,
    title: "Wrap the component in React.memo",
    before: `export default ${component.name};`,
    after: [
      `import { memo } from "react";`,
      `export default memo(${component.name});`,
    ].join("\n"),
  };
}

function RenderEventItem({ event }: { event: RenderEvent }) {
  const props = event.changedProps.map(({ name }) => name);

  return (
    <li className="rendercost-event">
      <div className="rendercost-event-heading">
        <span>{event.reasons.map((reason) => reasonLabels[reason]).join(", ")}</span>
        <span>{event.durationMs.toFixed(2)} ms</span>
      </div>
      <div className="rendercost-event-props">
        Changed props: {props.length > 0 ? props.join(", ") : "none"}
      </div>
      {event.isUnnecessary && (
        <span className="rendercost-event-wasted">Unnecessary render</span>
      )}
    </li>
  );
}

function ComponentDetails({
  component,
  isMemoized,
  suggestion,
  suggestionRequested,
  onSuggest,
  onToggleMemo,
  onCopy,
  copyStatus,
}: {
  component: ComponentRenderStats;
  isMemoized: boolean;
  suggestion: FixSuggestion | null;
  suggestionRequested: boolean;
  onSuggest: () => void;
  onToggleMemo: () => void;
  onCopy: () => void;
  copyStatus: string;
}) {
  const events = component.events.slice(-10).reverse();

  return (
    <tr className="rendercost-details-row">
      <td colSpan={5}>
        <section
          className="rendercost-details"
          aria-label={`${component.name} render details`}
        >
          <div className="rendercost-breakdown">
            <h3>Reason breakdown</h3>
            <div className="rendercost-fix-actions">
              <button type="button" onClick={onSuggest}>
                Suggest fix
              </button>
              <button
                type="button"
                aria-pressed={isMemoized}
                onClick={onToggleMemo}
              >
                {isMemoized ? "Stop simulating memo" : "Simulate memo"}
              </button>
            </div>
            <ul>
              {Object.entries(component.reasonCounts).map(([reason, count]) => (
                <li key={reason}>
                  <span>{reasonLabels[reason as RenderReason]}</span>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
            {suggestion && (
              <section
                className="rendercost-suggestion"
                aria-label="Suggested fix"
              >
                <h4>{suggestion.title}</h4>
                <div className="rendercost-code-block">
                  <strong>Before</strong>
                  <pre>
                    <code>{suggestion.before}</code>
                  </pre>
                </div>
                <div className="rendercost-code-block">
                  <strong>After</strong>
                  <pre>
                    <code>{suggestion.after}</code>
                  </pre>
                </div>
                <button type="button" onClick={onCopy}>
                  Copy snippet
                </button>
                <span className="rendercost-copy-status" aria-live="polite">
                  {copyStatus}
                </span>
              </section>
            )}
            {suggestionRequested && !suggestion && (
              <p className="rendercost-no-suggestion" role="status">
                No automatic fix applies to this component&apos;s unnecessary
                renders.
              </p>
            )}
          </div>
          <div className="rendercost-history">
            <h3>Last {events.length} render events</h3>
            {events.length > 0 ? (
              <ol>
                {events.map((event) => (
                  <RenderEventItem key={event.id} event={event} />
                ))}
              </ol>
            ) : (
              <p>No render events recorded.</p>
            )}
          </div>
        </section>
      </td>
    </tr>
  );
}

export function RenderCostPanel() {
  const snapshot = useRenderCostSnapshot();
  const store = useRenderCostStore();
  const [collapsed, setCollapsed] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [suggestionName, setSuggestionName] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");

  const components = useMemo(
    () =>
      [...snapshot.components].sort(
        (left, right) =>
          right.unnecessaryRenderCount - left.unnecessaryRenderCount ||
          left.name.localeCompare(right.name),
      ),
    [snapshot.components],
  );
  const selectedComponent =
    components.find((component) => component.name === selectedName) ?? null;
  const suggestion =
    selectedComponent && suggestionName === selectedComponent.name
      ? getFixSuggestion(selectedComponent)
      : null;

  const reset = () => {
    store?.reset();
    setSelectedName(null);
    setSuggestionName(null);
    setCopyStatus("");
  };

  const copySuggestion = async () => {
    if (!suggestion) {
      return;
    }

    if (typeof navigator.clipboard === "undefined") {
      setCopyStatus("Clipboard access is unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(suggestion.after);
      setCopyStatus("Snippet copied.");
    } catch (error) {
      setCopyStatus(
        `Copy failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  };

  return (
    <aside
      className={`rendercost-panel${collapsed ? " rendercost-panel-collapsed" : ""}`}
      aria-label="RenderCost panel"
    >
      <header className="rendercost-panel-header">
        <div>
          <h2>RenderCost</h2>
          <span
            className={`rendercost-status${snapshot.enabled ? " is-active" : ""}`}
          >
            {snapshot.enabled ? "Tracking" : "Paused"}
          </span>
        </div>
        <div className="rendercost-panel-actions">
          <button type="button" onClick={reset} disabled={!store}>
            Reset
          </button>
          <button
            type="button"
            onClick={() => store?.setEnabled(!snapshot.enabled)}
            disabled={!store}
          >
            {snapshot.enabled ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            className="rendercost-collapse-button"
            aria-label={collapsed ? "Expand RenderCost panel" : "Collapse RenderCost panel"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "+" : "−"}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="rendercost-panel-body">
          {components.length === 0 ? (
            <p className="rendercost-empty">
              No renders recorded yet. Track a component with{" "}
              <code>withRenderCost</code> or <code>useRenderTracker</code>.
            </p>
          ) : (
            <div className="rendercost-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Component</th>
                    <th scope="col">Renders</th>
                    <th scope="col">Wasted</th>
                    <th scope="col">Wasted ms</th>
                    <th scope="col">Top reason</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((component) => {
                    const selected = component.name === selectedName;
                    const topReason = getTopReason(component.reasonCounts);

                    return (
                      <FragmentRows
                        key={component.name}
                        component={component}
                        selected={selected}
                        topReason={topReason}
                        onSelect={() => {
                          setSelectedName(selected ? null : component.name);
                          setSuggestionName(null);
                          setCopyStatus("");
                        }}
                        isMemoized={snapshot.simulatedMemo.includes(
                          component.name,
                        )}
                        suggestion={
                          selected && suggestionName === component.name
                            ? getFixSuggestion(component)
                            : null
                        }
                        suggestionRequested={
                          suggestionName === component.name
                        }
                        copyStatus={copyStatus}
                        onSuggest={() => {
                          setSelectedName(component.name);
                          setSuggestionName(component.name);
                          setCopyStatus("");
                        }}
                        onToggleMemo={() =>
                          store?.setSimulatedMemo(
                            component.name,
                            !snapshot.simulatedMemo.includes(component.name),
                          )
                        }
                        onCopy={() => void copySuggestion()}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selectedComponent && (
            <div className="rendercost-selected-summary">
              Showing details for <strong>{selectedComponent.name}</strong>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function FragmentRows({
  component,
  selected,
  topReason,
  onSelect,
  isMemoized,
  suggestion,
  suggestionRequested,
  copyStatus,
  onSuggest,
  onToggleMemo,
  onCopy,
}: {
  component: ComponentRenderStats;
  selected: boolean;
  topReason: RenderReason | null;
  onSelect: () => void;
  isMemoized: boolean;
  suggestion: FixSuggestion | null;
  suggestionRequested: boolean;
  copyStatus: string;
  onSuggest: () => void;
  onToggleMemo: () => void;
  onCopy: () => void;
}) {
  return (
    <>
      <tr
        className={`rendercost-component-row${selected ? " is-selected" : ""}`}
        aria-selected={selected}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
      >
        <th scope="row">{component.name}</th>
        <td>{component.renderCount}</td>
        <td>{component.unnecessaryRenderCount}</td>
        <td>{component.wastedTimeMs.toFixed(2)}</td>
        <td>{topReason ? reasonLabels[topReason] : "—"}</td>
      </tr>
      {selected && (
        <ComponentDetails
          component={component}
          isMemoized={isMemoized}
          suggestion={suggestion}
          suggestionRequested={suggestionRequested}
          copyStatus={copyStatus}
          onSuggest={onSuggest}
          onToggleMemo={onToggleMemo}
          onCopy={onCopy}
        />
      )}
    </>
  );
}
