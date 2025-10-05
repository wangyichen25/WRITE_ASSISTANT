"use client";

import { useQuery } from "@tanstack/react-query";

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const res = await fetch("/api/docs");
      if (!res.ok) throw new Error("Failed to load documents");
      return (await res.json()) as {
        documents: Array<{
          id: string;
          originalName: string;
          lang: string;
          charCount: number;
          createdAt: string;
        }>;
      };
    },
  });
}
