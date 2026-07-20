import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProposalNav } from "@/components/proposal/proposal-nav";
import { ProposalFooter } from "@/components/proposal/proposal-footer";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { US_STATES } from "@shared/schema";

type Props = {
  onContinue: () => void;
};

// Captures the group's identity (name + state + ZIP) for a second or
// later group. The server stashes it in the session and the confirm
// endpoint reads it back so the new group record carries the right
// business address, not the account's default.
export function NewGroupDetails({ onContinue }: Props) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/groups/pending-details", {
        companyName: companyName.trim(),
        state: state.trim().toUpperCase(),
        zipCode: zipCode.trim(),
      });
    },
    onSuccess: onContinue,
    onError: (err: any) => {
      toast({ title: "Check the form", description: err?.message, variant: "destructive" });
    },
  });

  const zipValid = /^\d{5}(-\d{4})?$/.test(zipCode.trim());
  const stateValid = /^[A-Za-z]{2}$/.test(state.trim());
  const canContinue =
    companyName.trim().length > 0 && stateValid && zipValid && !mutation.isPending;

  return (
    <div className="min-h-screen bg-background">
      <ProposalNav />
      <div className="mx-auto max-w-xl px-6 py-12">
        <div className="mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Step 1 of 3 · New group
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-primary">
            Tell us about this group
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            We'll use the business's state and ZIP to set the rating area for your quote. Both
            become part of the group's record so the proposal is consistent across all plans.
          </p>
        </div>

        <Card className="p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canContinue) mutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="companyName">Group / company name</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Holdings, LLC"
                  className="pl-9"
                  data-testid="input-new-group-name"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_1.4fr] gap-3">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger id="state" data-testid="input-new-group-state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_STATES.map((s) => (
                      <SelectItem key={s.code} value={s.code}>
                        {s.code}, {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP code</Label>
                <Input
                  id="zipCode"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  placeholder="35243"
                  data-testid="input-new-group-zip"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={!canContinue}
              className="w-full gap-1.5"
              data-testid="button-new-group-continue"
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Continue to census upload
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          You can change the group name, state, or ZIP later with your BenSync advisor if anything
          needs updating.
        </p>
      </div>
      <ProposalFooter />
    </div>
  );
}
