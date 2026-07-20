import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProfileDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open && user) {
      setFullName(user.fullName ?? "");
      setCompanyName(user.companyName ?? "");
      setPhone((user as any).phone ?? "");
    }
  }, [open, user]);

  const mutation = useMutation({
    mutationFn: async (body: { fullName: string; companyName: string; phone: string }) => {
      const res = await apiRequest("PATCH", "/api/auth/me", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      // Group records include companyName separately; refetch so the
      // cockpit group header updates if the user renamed their company.
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ title: "Profile updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        title: "Could not update profile",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSave =
    fullName.trim().length > 0 && companyName.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-profile">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSave) return;
            mutation.mutate({ fullName: fullName.trim(), companyName: companyName.trim(), phone: phone.trim() });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              data-testid="input-profile-name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-company">Company name</Label>
            <Input
              id="profile-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Your company's legal name"
              data-testid="input-profile-company"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              data-testid="input-profile-phone"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
            <p className="text-xs text-muted-foreground">
              Email changes require contacting your advisor.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave} data-testid="button-save-profile">
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
