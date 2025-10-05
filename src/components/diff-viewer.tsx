"use client";

import { useMemo } from "react";
import { diff_match_patch, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from "diff-match-patch";

import { cn } from "@/lib/utils";

type DiffViewerProps = {
  original: string;
  revised: string;
  className?: string;
};

export function DiffViewer({ original, revised, className }: DiffViewerProps) {
  const segments = useMemo(() => {
    const instance = new diff_match_patch();
    const diff = instance.diff_main(original, revised);
    instance.diff_cleanupSemantic(diff);
    return diff;
  }, [original, revised]);

  return (
    <pre className={cn("whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-xs leading-5", className)}>
      {segments.map(([operation, text], index) => {
        if (!text) return null;
        if (operation === DIFF_EQUAL) {
          return (
            <span key={index} className="text-muted-foreground">
              {text}
            </span>
          );
        }
        if (operation === DIFF_INSERT) {
          return (
            <span key={index} className="bg-emerald-500/20 text-emerald-500">
              {text}
            </span>
          );
        }
        if (operation === DIFF_DELETE) {
          return (
            <span key={index} className="bg-rose-500/20 text-rose-500 line-through">
              {text}
            </span>
          );
        }
        return (
          <span key={index} className="text-muted-foreground">
            {text}
          </span>
        );
      })}
    </pre>
  );
}
