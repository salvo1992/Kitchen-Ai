import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export type Member = { user_id: string; name?: string | null; email: string; diet?: string | null };

/** Household members (empty when the user has no family). Sorted with the current user first. */
export function useMembers() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["household"],
    queryFn: () => api<{ household: any; members: Member[] }>("/api/household"),
    enabled: !!user?.household_id,
  });
  const members: Member[] = user?.household_id
    ? [...(q.data?.members || [])].sort((a, b) => (a.user_id === user.user_id ? -1 : b.user_id === user.user_id ? 1 : 0))
    : [];
  return { members, hasFamily: members.length > 1, isLoading: q.isLoading };
}

export function memberLabel(m: Member | undefined, meId?: string) {
  if (!m) return "Tutti";
  const n = m.name || m.email.split("@")[0];
  return m.user_id === meId ? `${n} (tu)` : n;
}
