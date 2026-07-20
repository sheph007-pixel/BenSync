import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SUPPLEMENTAL, money } from "@/lib/kennion-rates";
import type { SupplementalSection } from "@/lib/kennion-rates";

const ORDER: (keyof typeof SUPPLEMENTAL)[] = [
  "life_add",
  "accident",
  "critical",
  "cancer",
  "hospital",
  "std",
];

export function SupplementalTables() {
  return (
    <div className="space-y-6">
      {ORDER.map((key) => (
        <SupplementalBlock key={key} id={key} section={SUPPLEMENTAL[key]} />
      ))}
    </div>
  );
}

function SupplementalBlock({ id, section }: { id: string; section: SupplementalSection }) {
  return (
    <div className="space-y-2" data-testid={`section-supp-${id}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-foreground">{section.label}</h3>
        {section.note && <span className="text-xs text-muted-foreground">{section.note}</span>}
      </div>
      {section.kind === "bands" && <BandsTable section={section} />}
      {section.kind === "flat" && <FlatTable section={section} />}
      {section.kind === "plans" && <PlansTable section={section} />}
    </div>
  );
}

function BandsTable({ section }: { section: Extract<SupplementalSection, { kind: "bands" }> }) {
  const hasFamilyCols = section.bands.some((b) => "EE_CH" in b.rates);
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
            <TableHead>Age Band</TableHead>
            <TierHead>EE Only</TierHead>
            <TierHead>EE + CH</TierHead>
            <TierHead>EE + SP</TierHead>
            <TierHead>EE + FAM</TierHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.bands.map((b, idx) => (
            <TableRow key={idx}>
              <TableCell className="py-2.5 font-semibold">{b.label}</TableCell>
              <TierCell value={b.rates.EE} />
              <TierCell value={hasFamilyCols ? b.rates.EE_CH : undefined} />
              <TierCell value={hasFamilyCols ? b.rates.EE_SP : undefined} />
              <TierCell value={hasFamilyCols ? b.rates.EE_FAM : undefined} />
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FlatTable({ section }: { section: Extract<SupplementalSection, { kind: "flat" }> }) {
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
            <TableHead>Benefit</TableHead>
            <TierHead>EE Only</TierHead>
            <TierHead>EE + CH</TierHead>
            <TierHead>EE + SP</TierHead>
            <TierHead>EE + FAM</TierHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="py-2.5 font-semibold">{section.label}</TableCell>
            <TierCell value={section.rates.EE} />
            <TierCell value={section.rates.EE_CH} />
            <TierCell value={section.rates.EE_SP} />
            <TierCell value={section.rates.EE_FAM} />
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function PlansTable({ section }: { section: Extract<SupplementalSection, { kind: "plans" }> }) {
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
            <TableHead>Plan</TableHead>
            <TierHead>EE Only</TierHead>
            <TierHead>EE + CH</TierHead>
            <TierHead>EE + SP</TierHead>
            <TierHead>EE + FAM</TierHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.plans.map((p, idx) => (
            <TableRow key={idx}>
              <TableCell className="py-2.5 font-semibold">{p.label}</TableCell>
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

function TierCell({ value }: { value: number | undefined }) {
  return (
    <TableCell className="text-right font-mono text-sm tabular-nums">
      {value != null ? money(value) : <span className="text-muted-foreground/50">·</span>}
    </TableCell>
  );
}
