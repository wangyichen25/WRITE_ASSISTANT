"use client";

import { useQuery } from "@tanstack/react-query";

export function useSearch(documentId: string | undefined, query: string) {
  return useQuery({
    queryKey: ["search", documentId, query],
    enabled: Boolean(documentId) && query.trim().length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ docId: documentId!, q: query });
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search failed");
      return (await res.json()) as {
        hits: Array<{
          chapterId: string;
          snippet: string;
        }>;
      };
    },
  });
}
