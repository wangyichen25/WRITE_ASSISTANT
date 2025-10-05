"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareText, X } from "lucide-react";

import { useEditorStore } from "@/store/editor-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function PromptPresetsButton() {
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
        <MessageSquareText className="mr-2 size-4" />
        Prompts
      </Button>
      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur"
              onClick={close}
              role="presentation"
            >
              <div
                className="relative w-full max-w-lg rounded-lg border bg-card p-6 shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Prompt presets</h2>
                    <p className="text-sm text-muted-foreground">
                      Save reusable instructions and reuse them from the rewrite bubble.
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={close} aria-label="Close prompt manager">
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="mt-6">
                  <PromptPresetsPanel />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function PromptPresetsPanel() {
  const promptPresets = useEditorStore((state) => state.promptPresets);
  const addPromptPreset = useEditorStore((state) => state.addPromptPreset);
  const updatePromptPreset = useEditorStore((state) => state.updatePromptPreset);
  const removePromptPreset = useEditorStore((state) => state.removePromptPreset);

  const [presetName, setPresetName] = useState("");
  const [presetContent, setPresetContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingContent, setEditingContent] = useState("");

  const handleAdd = () => {
    if (!presetName.trim() || !presetContent.trim()) return;
    addPromptPreset({ name: presetName, content: presetContent });
    setPresetName("");
    setPresetContent("");
  };

  const handleStartEdit = (presetId: string) => {
    const preset = promptPresets.find((entry) => entry.id === presetId);
    if (!preset) return;
    setEditingId(presetId);
    setEditingName(preset.name);
    setEditingContent(preset.content);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingContent.trim()) return;
    updatePromptPreset({ id: editingId, name: editingName, content: editingContent });
    setEditingId(null);
    setEditingName("");
    setEditingContent("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingContent("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 p-3">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Create preset</Label>
          <Input
            placeholder="Preset name"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            className="h-9"
          />
          <Textarea
            placeholder="Describe what the rewrite should do…"
            value={presetContent}
            onChange={(event) => setPresetContent(event.target.value)}
            rows={3}
          />
          <Button type="button" onClick={handleAdd} disabled={!presetName.trim() || !presetContent.trim()}>
            Add preset
          </Button>
        </div>
      </div>

      {promptPresets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No presets yet. Create one above to get started.</p>
      ) : (
        <div className="space-y-3">
          {promptPresets.map((preset) => {
            const isEditing = editingId === preset.id;
            return (
              <div key={preset.id} className="space-y-2 rounded-md border border-border/60 p-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} className="h-8" />
                    <Textarea
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      rows={4}
                    />
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" onClick={handleSaveEdit} disabled={!editingContent.trim()}>
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={handleCancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{preset.name}</p>
                      <p className="text-xs text-muted-foreground whitespace-pre-line">{preset.content}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => handleStartEdit(preset.id)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => removePromptPreset(preset.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
