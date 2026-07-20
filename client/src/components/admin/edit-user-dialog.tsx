import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

type Props = {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Admin-only: edit a user's profile, role, verification, and send a
// password reset email. Lifted out of the old users.tsx page so the
// new unified admin list can trigger it from a row action.
export function EditUserDialog({ user, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    companyName: "",
    phone: "",
    role: "client",
    verified: false,
  });
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        fullName: user.fullName ?? "",
        email: user.email ?? "",
        companyName: user.companyName ?? "",
        phone: user.phone ?? "",
        role: user.role ?? "client",
        verified: user.verified ?? false,
      });
    }
  }, [user]);

  const save = useMutation({
    mutationFn: async (data: typeof form) => {
      if (!user) throw new Error("No user selected");
      return apiRequest("PATCH", `/api/admin/users/${user.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  async function handleReset() {
    if (!user) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to send reset email");
      }
      toast({ title: "Password reset sent", description: `Email sent to ${user.email}` });
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-user">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update profile, role, and verification status.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field
            id="fullName"
            label="Full name"
            value={form.fullName}
            onChange={(v) => setForm({ ...form, fullName: v })}
          />
          <Field
            id="email"
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
          />
          <Field
            id="companyName"
            label="Company"
            value={form.companyName}
            onChange={(v) => setForm({ ...form, companyName: v })}
          />
          <Field
            id="phone"
            label="Phone"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Client</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.verified}
              onChange={(e) => setForm({ ...form, verified: e.target.checked })}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="text-sm">Verified</span>
          </label>
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium">Password reset</p>
              <p className="text-xs text-muted-foreground">Email a reset link to this user.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={resetting || save.isPending}
              data-testid="button-send-reset"
            >
              {resetting ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-3 w-3" />
                  Send reset email
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate(form)} disabled={save.isPending} data-testid="button-save-user">
            {save.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
