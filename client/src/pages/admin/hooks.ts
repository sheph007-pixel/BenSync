import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Group, Proposal, User } from "@shared/schema";

export function useGroups() {
  return useQuery<Group[]>({
    queryKey: ["/api/admin/groups"],
  });
}

// TODO: Once /api/admin/groups/:id exists, swap this client-side filter
// for a dedicated fetch keyed by ["/api/admin/groups", id] so detail
// pages don't require the full list to be loaded.
export function useGroup(id: string | undefined) {
  const { data: groups, ...rest } = useGroups();
  const group = useMemo(
    () => (id ? groups?.find((g) => g.id === id) : undefined),
    [groups, id],
  );
  return { ...rest, data: group };
}

export function useUsers() {
  return useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });
}

export function useProposalsForGroup(groupId: string | undefined) {
  return useQuery<Proposal[]>({
    queryKey: ["/api/admin/proposal/group", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const res = await fetch(`/api/admin/proposal/group/${groupId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
  });
}

export function useTemplateInfo() {
  return useQuery<{
    uploaded: boolean;
    fileName?: string;
    fileSize?: number;
    uploadedAt?: string;
  }>({
    queryKey: ["/api/admin/proposal/template-info"],
  });
}

export function useTemplateSheets(enabled: boolean) {
  return useQuery<{ sheets: string[] }>({
    queryKey: ["/api/admin/proposal/sheets"],
    enabled,
  });
}
