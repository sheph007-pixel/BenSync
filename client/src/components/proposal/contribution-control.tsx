import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

type Props = {
  value: number;
  eeRate: number;
  onChange: (value: number) => void;
};

// Employer Contribution, Defined-Contribution style: the employer picks a
// per-employee-per-month dollar budget. Clamped to [ceil(eeRate*0.5),
// ceil(eeRate)] and re-baselined to 50% of the EE rate whenever the
// selected plan changes, so the value always tracks a valid 50%+
// contribution on the current plan.
export function ContributionControl({ value, eeRate, onChange }: Props) {
  const min = Math.max(1, Math.ceil(eeRate * 0.5));
  const max = Math.max(min, Math.ceil(eeRate));

  useEffect(() => {
    onChange(Math.ceil(eeRate * 0.5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eeRate]);

  const [draft, setDraft] = useState<string>(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commitDraft() {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    if (clamped !== value) onChange(clamped);
    setDraft(String(clamped));
  }

  return (
    <Card className="p-5" data-testid="card-contribution">
      <div className="text-base font-semibold">Monthly Budget</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        With Defined Contribution, you tell us how much you can spend per
        employee per month:
      </p>

      <div className="mt-3 flex items-center gap-3">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={5}
          onValueChange={(v) => onChange(v[0])}
          className="flex-1"
          data-testid="slider-contribution"
        />
        <div className="flex items-baseline rounded-md border bg-background px-2 py-1.5">
          <span className="mr-0.5 text-sm text-muted-foreground">$</span>
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitDraft();
                e.currentTarget.blur();
              }
            }}
            aria-label="Dollar amount per employee per month"
            className="w-14 bg-transparent text-right font-mono text-2xl font-bold leading-none tabular-nums outline-none"
            data-testid="input-contribution"
          />
          <span className="ml-1 text-[10px] font-bold tracking-wider text-muted-foreground">
            PEPM
          </span>
        </div>
      </div>
    </Card>
  );
}
