"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ModelSettings } from "@/components/model-settings";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings className="mr-2 size-4" />
        Settings
      </Button>
      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur"
              onClick={close}
              role="presentation"
            >
              <div
                className="relative flex h-full max-h-[75vh] w-full max-w-lg flex-col rounded-lg border bg-card shadow-xl min-h-0"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Editor Settings</h2>
                    <p className="text-sm text-muted-foreground">
                      Adjust the defaults used when you open the rewrite bubble.
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={close} aria-label="Close settings">
                    <X className="size-4" />
                  </Button>
                </div>
                <ScrollArea className="flex-1 min-h-0 px-6 pb-6 pt-2">
                  <ModelSettings className="space-y-6" />
                </ScrollArea>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
