import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { money } from "@/lib/kennion-rates";
import type { MedicalPlan } from "@/lib/kennion-rates";

type Props = {
  plans: MedicalPlan[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function MedicalTable({ plans, selectedId, onSelect }: Props) {
  return (
    <div className="overflow-hidden rounded-md border bg-card" data-testid="table-medical">
      <Table className="table-fixed">
        <colgroup>
          <col style={{ width: "36%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="text-left">Plan Name</TableHead>
            <TierHead>EE Only</TierHead>
            <TierHead>EE + CH</TierHead>
            <TierHead>EE + SP</TierHead>
            <TierHead>EE + FAM</TierHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => {
            const selected = plan.id === selectedId;
            return (
              <TableRow
                key={plan.id}
                onClick={() => onSelect(plan.id)}
                data-testid={`row-medical-${plan.id}`}
                className={cn(
                  "cursor-pointer",
                  selected && "bg-primary/5",
                )}
              >
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="medical-plan"
                      checked={selected}
                      onChange={() => onSelect(plan.id)}
                      className="h-4 w-4 accent-primary"
                      aria-label={`Select ${plan.name}`}
                      data-testid={`radio-medical-${plan.id}`}
                    />
                    <div className="min-w-0">
                      <div className={cn("truncate font-semibold", selected && "text-primary")}>
                        {plan.name}
                      </div>
                      {plan.note && (
                        <div className="text-xs text-muted-foreground">{plan.note}</div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TierCell value={plan.base.EE} />
                <TierCell value={plan.base.EE_CH} />
                <TierCell value={plan.base.EE_SP} />
                <TierCell value={plan.base.EE_FAM} />
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TierHead({ children }: { children: React.ReactNode }) {
  return (
    <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </TableHead>
  );
}

function TierCell({ value }: { value: number }) {
  return (
    <TableCell className="text-right font-mono text-sm tabular-nums">
      {money(value)}
    </TableCell>
  );
}
