"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/api/me";

/**
 * Demonstrates the full chain this checkpoint wires up: Clerk token ->
 * typed client -> Zod-validated response -> TanStack Query cache. Not
 * used by any screen yet — the chat UI is explicitly out of scope here.
 */
export function useMe() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["me"],
    queryFn: async () => getMe(await getToken()),
    enabled: isSignedIn === true,
  });
}
