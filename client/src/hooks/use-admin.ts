import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Group, User } from "@shared/schema";

// Admin impersonation view: fetch the target group without going through
// useMyGroups (which filters to the admin's own account). The server's
// GET /api/groups/:id already admin-bypasses ownership.
export function useGroupForAdmin(id: string | undefined) {
  return useQuery<Group>({
    queryKey: ["/api/groups", id],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${id}`, { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Failed to load group (${res.status})`);
      }
      return res.json();
    },
    enabled: Boolean(id),
  });
}

// Full user list. Thin wrapper over the existing /api/admin/users.
export function useAllUsers() {
  return useQuery<User[]>({ queryKey: ["/api/admin/users"] });
}

// All groups across all users (admin view).
export function useAllGroups() {
  return useQuery<Group[]>({ queryKey: ["/api/admin/groups"] });
}

// Combined "users with their groups nested" for the unified admin
// list. Joins the two TanStack Query results client-side by userId so
// we don't need a new server endpoint.
export type UserWithGroups = User & { groups: Group[] };

export function useAdminUsersWithGroups() {
  const usersQuery = useAllUsers();
  const groupsQuery = useAllGroups();

  const combined = useMemo<UserWithGroups[]>(() => {
    if (!usersQuery.data) return [];
    const groupsByUser = new Map<string, Group[]>();
    for (const g of groupsQuery.data ?? []) {
      // Skip orphan groups (internal-sales quotes have userId=null).
      // The /api/admin/groups endpoint already filters those out, but
      // guard here too so the type narrows to non-null.
      if (!g.userId) continue;
      const list = groupsByUser.get(g.userId) ?? [];
      list.push(g);
      groupsByUser.set(g.userId, list);
    }
    groupsByUser.forEach((list) => {
      list.sort((a: Group, b: Group) => {
        const aT = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bT = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bT - aT;
      });
    });
    return [...usersQuery.data]
      .sort((a, b) => {
        const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bT - aT;
      })
      .map((u) => ({ ...u, groups: groupsByUser.get(u.id) ?? [] }));
  }, [usersQuery.data, groupsQuery.data]);

  return {
    users: combined,
    isLoading: usersQuery.isLoading || groupsQuery.isLoading,
    isError: usersQuery.isError || groupsQuery.isError,
  };
}
