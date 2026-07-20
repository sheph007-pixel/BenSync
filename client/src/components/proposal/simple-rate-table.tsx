import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/kennion-rates";
import type { SimplePlan } from "@/lib/kennion-rates";

type Props = {
  plans: SimplePlan[];
  label?: string;
};

// Read-only table for dental and vision. Same 5-column layout as the
// medical table so column widths stay locked when tabs switch.
export function SimpleRateTable({ plans, label = "Plan Name" }: Props) {
  return (
    <div className="overflow-hidden rounded-md border bg-card">
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
            <TableHead>{label}</TableHead>
            <TierHead>EE Only</TierHead>
            <TierHead>EE + CH</TierHead>
            <TierHead>EE + SP</TierHead>
            <TierHead>EE + FAM</TierHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((p) => (
            <TableRow key={p.id} data-testid={`row-rate-${p.id}`}>
              <TableCell className="py-3 font-semibold">{p.name}</TableCell>
              <TierCell value={p.rates.EE} />
              <TierCell value={p.rates.EE_CH} />
              <TierCell value={p.rates.EE_SP} />
              <TierCell value={p.rates.EE_FAM} />
            </TableRow>
          ))}
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
