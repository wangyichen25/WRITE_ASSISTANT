"use client";

import { useQuery } from "@tanstack/react-query";

import { useCustomModels } from "@/store/editor-store";
import { DEFAULT_MODELS } from "@/lib/rewrite-config";

export function useModels() {
  const customModels = useCustomModels();

  return useQuery({
    queryKey: ["models", customModels],
    queryFn: async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error("Failed to load models");
        const data = (await res.json()) as { models: string[]; supportsOnlineSuffix: boolean };
        const merged = mergeModels(data.models, customModels);
        return { ...data, models: merged };
      } catch {
        const merged = mergeModels([], customModels);
        return { models: merged, supportsOnlineSuffix: false };
      }
    },
  });
}

function mergeModels(remote: string[], local: string[]): string[] {
  const base = remote.length > 0 ? remote : DEFAULT_MODELS;
  const combined = [...base, ...local];
  return Array.from(new Set(combined.filter((item) => item.trim().length > 0)));
}
