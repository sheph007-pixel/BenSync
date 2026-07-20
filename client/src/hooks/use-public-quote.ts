import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Group } from "@shared/schema";
import type { MedicalPlan, TierKey } from "@/lib/kennion-rates";

// Hooks for the logged-out /q/:token public quote view. Mirrors the
// session-mode hooks in use-proposal.ts but talks to /api/quote/:token
// instead of /api/groups + /api/rate. No PHI is fetched (the public
// route doesn't expose individual census rows).

export type TierMix = { EE: number; EE_CH: number; EE_SP: number; EE_FAM: number };

type PublicQuotePayload = {
  group: Group;
  mix: TierMix;
};

export function usePublicQuote(token: string | undefined) {
  return useQuery<PublicQuotePayload>({
    queryKey: ["/api/quote", token],
    queryFn: async () => {
      const res = await fetch(`/api/quote/${token}`, { credentials: "omit" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Quote not found (${res.status})`);
      }
      return res.json();
    },
    enabled: Boolean(token),
    retry: false,
  });
}

type RawPlanRate = { EE: number; EC: number; ES: number; EF: number };
type RateEngineResult = {
  engine_version: string;
  factor_tables_version: string;
  rating_area: string;
  effective_date: string;
  trend_adjustment: number;
  n_members: number;
  n_employees: number;
  avg_age: number;
  group_age_factor_ee: number;
  plan_rates: Record<string, RawPlanRate>;
};

// Same plan order + filter as useGroupRates so the public cockpit
// renders an identical table to what an authed customer would see.
const MEDICAL_PLAN_ORDER: { serverName: string; displayName?: string; tier: string; note?: string }[] = [
  { serverName: "Deluxe Platinum", tier: "Platinum" },
  { serverName: "Choice Gold", tier: "Gold" },
  { serverName: "Basic Gold", tier: "Gold" },
  { serverName: "Preferred Silver", tier: "Silver" },
  { serverName: "Enhanced Silver", tier: "Silver" },
  { serverName: "Classic Silver", tier: "Silver" },
  { serverName: "Saver HSA", tier: "Silver", note: "Health Savings Account" },
  { serverName: "Elite Health Plan", displayName: "Elite Health", tier: "Bronze" },
  { serverName: "Premier Health Plan", displayName: "Premier Health", tier: "Bronze" },
  { serverName: "Select Health Plan", displayName: "Select Health", tier: "Bronze" },
  { serverName: "Core Health Plan", displayName: "Core Health", tier: "Bronze" },
  { serverName: "Freedom Platinum", tier: "Generic Rx", note: "Generic Rx" },
  { serverName: "Freedom Gold", tier: "Generic Rx", note: "Generic Rx" },
  { serverName: "Freedom Silver", tier: "Generic Rx", note: "Generic Rx" },
  { serverName: "Freedom Bronze", tier: "Generic Rx", note: "Generic Rx" },
];

function slugifyPlanName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function usePublicQuoteRates(token: string | undefined, effectiveDate: string | null) {
  return useQuery<{ plans: MedicalPlan[]; result: RateEngineResult }>({
    queryKey: ["/api/quote", token, "price-group", effectiveDate],
    queryFn: async () => {
      const res = await fetch(`/api/quote/${token}/price-group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effective_date: effectiveDate }),
        credentials: "omit",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Pricing failed");
      }
      const result = (await res.json()) as RateEngineResult;
      const plans: MedicalPlan[] = [];
      for (const entry of MEDICAL_PLAN_ORDER) {
        const r = result.plan_rates[entry.serverName];
        if (!r) continue;
        plans.push({
          id: slugifyPlanName(entry.serverName),
          name: entry.displayName ?? entry.serverName,
          tier: entry.tier,
          note: entry.note,
          base: {
            EE: r.EE,
            EE_CH: r.EC,
            EE_SP: r.ES,
            EE_FAM: r.EF,
          } as Record<TierKey, number>,
        });
      }
      return { plans, result };
    },
    enabled: Boolean(token && effectiveDate),
    placeholderData: keepPreviousData,
  });
}
