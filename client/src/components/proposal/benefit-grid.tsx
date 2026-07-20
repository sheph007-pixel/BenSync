import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Visual row specifier for the grid.
//   - "data" rows render a benefit name on the left and one cell per
//     plan on the right.
//   - "section" rows render a full-width dark band (e.g. the "Benefits"
//     / "Covered Services" bars from the PDFs) to visually separate
//     check-style rows from dollar-copay rows.
export type BenefitRow<P> =
  | {
      kind: "data";
      label: string;
      render: (plan: P) => string;
    }
  | {
      kind: "section";
      label: string;
    };

type Props<P extends { key: string; name: string }> = {
  plans: P[];
  rows: BenefitRow<P>[];
  selectedKey?: string | null;
  // Column width for the benefit-name column. Plans themselves share the
  // remaining width evenly.
  labelColWidth?: number;
  // Optional minimum pixel width for each plan column, keeps copy from
  // cramping when there are a lot of plans. Drives horizontal scroll.
  minPlanColWidth?: number;
};

// Re-used color cues so tables read consistently across tabs, matches
// the carrier-style PDFs the content was transcribed from.
function cellClassFor(value: string): string {
  const v = value.trim();
  if (v === "Free On App") return "text-primary font-semibold";
  if (v === "No Charge") return "text-emerald-700 font-semibold dark:text-emerald-400";
  if (v === "✓") return "text-emerald-700 font-bold dark:text-emerald-400";
  if (v === "-") return "text-muted-foreground";
  return "";
}

export function BenefitGrid<P extends { key: string; name: string }>({
  plans,
  rows,
  selectedKey,
  labelColWidth = 220,
  minPlanColWidth = 140,
}: Props<P>) {
  // The `selectedKey` prop seeds the initial highlight (from
  // ?plan=… passed through from the cockpit). Once on this page,
  // users can click any plan column header to repin the comparison
  // anchor, that's the natural way to explore a compare table.
  const [pinnedKey, setPinnedKey] = useState<string | null>(selectedKey ?? null);
  // Re-seed if the prop changes (e.g. navigation back + forward
  // with a different ?plan=). Otherwise local clicks win.
  useEffect(() => {
    setPinnedKey(selectedKey ?? null);
  }, [selectedKey]);
  const selectedIdx = pinnedKey
    ? plans.findIndex((p) => p.key === pinnedKey)
    : -1;

  function togglePin(key: string) {
    setPinnedKey((prev) => (prev === key ? null : key));
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  // Guess whether the grid will overflow before we can measure, so the
  // chevron doesn't flash enabled → disabled when switching from a
  // wide tab (Medical) to a narrow one (Dental/Vision). 1200 is a
  // reasonable floor for desktop viewports inside the 1280-max layout.
  const estimatedTableWidth = labelColWidth + plans.length * minPlanColWidth;
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(estimatedTableWidth > 1200);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  // Measure on mount before paint, and again on every relevant change.
  // ResizeObserver on both the viewport container AND the inner table
  // handles: font/style shifts, tab switches (Radix toggles display),
  // plan-count changes, and window resizes.
  useLayoutEffect(() => {
    update();
  }, [plans.length, rows.length, update]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (tableRef.current) ro.observe(tableRef.current);
    window.addEventListener("resize", update);
    // Extra pass after the first paint in case web fonts shift the
    // layout (otherwise scrollWidth can read stale at mount).
    const raf = requestAnimationFrame(update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [update]);

  function scrollByColumn(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll by roughly one plan column so each click advances the
    // comparison by one plan, feels more deliberate than a free swipe.
    const step = Math.max(minPlanColWidth + 8, 160);
    el.scrollBy({ left: step * direction, behavior: "smooth" });
  }

  // One toolbar layout rendered twice, above the grid (sticky under
  // the main nav so it follows you as you scroll) and below the grid
  // so controls are within reach no matter where you are in a tall
  // table. Pattern lifted from GitHub / Gmail / Salesforce pagination.
  const renderToolbar = (position: "top" | "bottom") => (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border bg-background/95 px-3 py-2 shadow-sm backdrop-blur",
        position === "top" ? "sticky top-14 z-30 mb-2" : "mt-2",
      )}
    >
      <span className="text-xs text-muted-foreground">
        {plans.length} {plans.length === 1 ? "plan" : "plans"} · scroll to compare
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => scrollByColumn(-1)}
          disabled={!canScrollLeft}
          aria-label="Scroll to previous plan"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card text-foreground hover-elevate disabled:cursor-not-allowed disabled:opacity-30"
          data-testid={`button-grid-scroll-left-${position}`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => scrollByColumn(1)}
          disabled={!canScrollRight}
          aria-label="Scroll to next plan"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card text-foreground hover-elevate disabled:cursor-not-allowed disabled:opacity-30"
          data-testid={`button-grid-scroll-right-${position}`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      {renderToolbar("top")}

      <div className="relative">
        <div
          ref={scrollRef}
          className="w-full overflow-x-auto rounded-md border bg-card"
        >
          <table ref={tableRef} className="w-full border-collapse text-sm">
          <colgroup>
            <col style={{ width: labelColWidth, minWidth: labelColWidth }} />
            {plans.map((p) => (
              <col key={p.key} style={{ minWidth: minPlanColWidth }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 h-14 border-b border-r bg-[hsl(215_50%_18%)] px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80"
              >
                Benefit
              </th>
              {plans.map((p, i) => (
                <th
                  key={p.key}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 h-14 border-b border-white/10 bg-[hsl(215_50%_18%)] p-0 text-center align-middle text-xs font-semibold leading-tight text-white",
                    i === selectedIdx && "ring-2 ring-inset ring-amber-400",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => togglePin(p.key)}
                    aria-pressed={i === selectedIdx}
                    title={
                      i === selectedIdx
                        ? "Click to unpin this plan"
                        : "Click to pin this plan for comparison"
                    }
                    className="flex h-full w-full items-center justify-center px-3 text-white transition hover:bg-white/10"
                    data-testid={`button-pin-${p.key}`}
                  >
                    {p.name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rIdx) => {
              if (row.kind === "section") {
                return (
                  <tr key={`sec-${rIdx}`}>
                    <td
                      colSpan={plans.length + 1}
                      className="sticky left-0 z-10 h-8 bg-foreground px-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-background"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={`row-${rIdx}`} className="border-b last:border-b-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r bg-card px-4 py-2 text-left text-sm font-medium text-foreground"
                  >
                    {row.label}
                  </th>
                  {plans.map((p, i) => {
                    const value = row.render(p);
                    return (
                      <td
                        key={p.key}
                        className={cn(
                          "px-3 py-2 text-center align-middle text-sm tabular-nums",
                          cellClassFor(value),
                          i === selectedIdx && "bg-primary/5 ring-1 ring-inset ring-primary/20",
                        )}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        {/* Edge fade gradients, visual cue that the grid continues
            past the viewport. Hide themselves once the user reaches
            that edge. The scroll CONTROL lives in the sticky toolbar
            above; these are just a supplementary hint so the cutoff
            column doesn't look like a design mistake. */}
        {canScrollLeft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-12 rounded-l-md bg-gradient-to-r from-background to-transparent"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-md bg-gradient-to-l from-background to-transparent"
          />
        )}
      </div>

      {renderToolbar("bottom")}
    </div>
  );
}
