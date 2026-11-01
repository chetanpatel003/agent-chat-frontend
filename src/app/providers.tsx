"use client";

import { useState } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Full query-key conventions, retry/staleTime policy, etc. land in
// checkpoint 1.4 ("full query integration") — this is just enough to back
// the one demonstration hook this checkpoint adds (useMe).
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ClerkProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </ClerkProvider>
  );
}
