import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";

/**
 * Fetches the group's latest BenSync Risk Screen result. If the group is
 * High Risk, no rates should be shown anywhere on the proposal page -
 * the carrier program will not quote.
 *
 * Returns:
 *   isHighRisk:    boolean        true if the latest screen tier === "High Risk"
 *   isLoading:     boolean        the latest-screen fetch state
 *   screen:        result object  the latest screen result (or null)
 *   hasBeenScreened: boolean      false if the group has never been screened
 */
export function useHighRiskGate(groupId: string | undefined) {
  const q = useQuery({
    queryKey: ["/api/screen/latest", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      try {
        const r = await fetch(`/api/screen/latest/${groupId}`, { credentials: "include" });
        if (r.status === 404) return null;        // never been screened
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
  const latest = q.data as any;
  return {
    isHighRisk: latest?.tier === "High Risk",
    isLoading: q.isLoading,
    screen: latest,
    hasBeenScreened: !!latest,
  };
}

export function HighRiskNotice({ groupName, score }: { groupName?: string; score?: number }) {
  return (
    <div className="rounded-lg border-2 border-red-600 bg-red-50 p-6 text-center">
      <div className="flex justify-center mb-3">
        <ShieldAlert className="h-12 w-12 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-red-700 mb-2">
        No Quote Available
      </h2>
      <p className="text-base text-red-900 mb-3">
        {groupName ? <span className="font-semibold">{groupName}</span> : "This group"}{" "}
        was screened by the BenSync Underwriting Portal and scored
        <span className="font-mono font-bold"> {score?.toFixed(2) ?? "-"} </span>
        (High Risk).
      </p>
      <p className="text-sm text-red-800">
        Per BenSync underwriting policy, High Risk groups are not eligible for a
        quote. Open the Risk Screen report (PDF) for the full score breakdown
        and decline reasoning.
      </p>
    </div>
  );
}
