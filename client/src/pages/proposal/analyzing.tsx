import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalFooter } from "@/components/proposal/proposal-footer";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Group } from "@shared/schema";

type Props = {
  group?: Group | null;
  onComplete: () => void;
};

const STEPS = [
  "Parsing census file",
  "Detecting columns & validating employee records",
  "Scoring group risk profile",
  "Calculating medical rates for effective dates",
  "Assembling your proposal",
];

export function ProposalAnalyzing({ onComplete }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const total = 18000;
    const step = total / STEPS.length;
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i >= STEPS.length) {
        clearInterval(id);
        setIdx(STEPS.length);
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
        setTimeout(onComplete, 700);
        return;
      }
      setIdx(i);
    }, step);
    return () => clearInterval(id);
  }, [onComplete]);

  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-full border border-border">
          <div
            className="h-28 w-28 rounded-full bg-primary"
            style={{ animation: "k-pulse 1.8s ease-in-out infinite" }}
          />
        </div>

        <h2 className="mt-8 text-3xl font-bold tracking-tight">Analyzing your group</h2>
        <p className="mt-2 text-sm text-muted-foreground">Usually takes under a minute.</p>

        <Card className="mx-auto mt-8 max-w-md p-5 text-left">
          <ul className="space-y-2.5">
            {STEPS.map((label, i) => {
              const done = i < idx;
              const active = i === idx;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-3 font-mono text-sm transition-colors",
                    done && "text-green-700 dark:text-green-400",
                    active && "text-foreground",
                    !done && !active && "text-muted-foreground/60",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        done && "bg-green-600 dark:bg-green-400",
                        active && "bg-foreground",
                        !done && !active && "bg-muted-foreground/40",
                      )}
                      aria-hidden
                    />
                    <span>{label}</span>
                  </div>
                  {done && <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <ProposalFooter />

      <style>{`
        @keyframes k-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.12); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
