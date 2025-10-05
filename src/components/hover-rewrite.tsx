"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useModels } from "@/hooks/use-models";
import { toast } from "sonner";
import { plainTextToHtml } from "@/lib/text-utils";
import { useEditorStore } from "@/store/editor-store";

const MAX_SELECTION_LENGTH = 8000;

function docPosFromPlainTextOffset(editor: Editor, targetOffset: number): number | null {
  const { doc } = editor.state;
  if (targetOffset < 0) return 0;
  const fullTextLength = doc.textBetween(0, doc.content.size, "\n\n", "\n").length;
  if (targetOffset > fullTextLength) return null;

  let low = 0;
  let high = doc.content.size;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const length = doc.textBetween(0, mid, "\n\n", "\n").length;
    if (length < targetOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

type SelectionRange = { from: number; to: number } | null;

export type HoverRewriteProps = {
  editor: Editor;
  chapterId: string;
  lang: string;
  defaultModel: string;
  onlineMode: boolean;
  contextWindow: number;
  temperature: number;
  maxTokens: number;
  onApply: (nextContent: string) => Promise<void> | void;
};

export function HoverRewrite({
  editor,
  chapterId,
  lang,
  defaultModel,
  onlineMode,
  contextWindow,
  temperature,
  maxTokens,
  onApply,
}: HoverRewriteProps) {
  const { data: modelData } = useModels();
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [online, setOnline] = useState(onlineMode);
  const contextRepairEnabled = useEditorStore((state) => state.contextRepairEnabled);
  const setContextRepairEnabled = useEditorStore((state) => state.setContextRepairEnabled);
  const promptPresets = useEditorStore((state) => state.promptPresets);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [lastSelection, setLastSelection] = useState<SelectionRange>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPinnedRef = useRef(isPinned);

  useEffect(() => {
    setModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    setOnline(onlineMode);
  }, [onlineMode]);

  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);

  useEffect(() => {
    if (!selectedPresetId) return;
    if (!promptPresets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId(null);
    }
  }, [promptPresets, selectedPresetId]);

  useEffect(() => {
    const updateSelection = () => {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      setLastSelection({ from, to });
    };
    editor.on("selectionUpdate", updateSelection);
    return () => {
      editor.off("selectionUpdate", updateSelection);
    };
  }, [editor]);

  useEffect(() => () => {
    if (blurTimeout.current) {
      clearTimeout(blurTimeout.current);
    }
  }, []);

  const models = useMemo(() => modelData?.models ?? [defaultModel], [modelData?.models, defaultModel]);

  const getActiveRange = (): SelectionRange => {
    const { from, to } = editor.state.selection;
    if (from !== to) {
      return { from, to };
    }
    return lastSelection;
  };

  const handleRewrite = async () => {
    const range = getActiveRange();
    if (!range) {
      toast.info("Select text to rewrite");
      return;
    }

    const doc = editor.state.doc;
    const before = doc.textBetween(0, range.from, "\n\n", "\n");
    const selected = doc.textBetween(range.from, range.to, "\n\n", "\n");
    const start = before.length;
    const end = start + selected.length;

    if (selected.length === 0) {
      toast.info("Select text to rewrite");
      return;
    }

    if (selected.length > MAX_SELECTION_LENGTH) {
      toast.warning("Selection is too long. Please select a smaller passage.");
      return;
    }

    if (!instruction.trim()) {
      toast.info("Add a brief instruction for the rewrite");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/llm/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          selectionStart: start,
          selectionEnd: end,
          instruction,
          model: online ? `${model}:online` : model,
          context: { lang },
          contextWindow,
          temperature,
          maxTokens,
          repairContext: contextRepairEnabled,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Rewrite failed" }));
        throw new Error(error.error ?? "Rewrite failed");
      }

      const payload = await response.json();
      const resultText = typeof payload.result === "string" ? payload.result : "";
      if (!resultText) {
        toast.error("Model returned empty text");
        return;
      }

      const currentDoc = editor.state.doc;
      const fallbackText = currentDoc.textBetween(0, currentDoc.content.size, "\n\n", "\n");
      const finalText =
        typeof payload.chapterText === "string" && payload.chapterText.length > 0
          ? payload.chapterText
          : fallbackText;

      editor.commands.setContent(plainTextToHtml(finalText), { emitUpdate: false });

      const responseRange = payload.range as { start: number; end: number } | undefined;
      if (responseRange) {
        const mappedFrom = docPosFromPlainTextOffset(editor, responseRange.start);
        const mappedTo = docPosFromPlainTextOffset(editor, responseRange.end);
        if (mappedFrom !== null && mappedTo !== null) {
          editor.chain().focus().setTextSelection({ from: mappedFrom, to: mappedTo }).run();
        } else {
          editor.chain().focus().run();
        }
      } else {
        editor.chain().focus().run();
      }

      await onApply(finalText);
      setIsPinned(true);

      const contextInfoRaw = payload.contextAdjustments as
        | { applied?: boolean; notes?: string | null }
        | false
        | undefined;
      const contextInfo =
        contextInfoRaw && typeof contextInfoRaw === "object"
          ? {
              applied: Boolean(contextInfoRaw.applied),
              notes:
                typeof contextInfoRaw.notes === "string" && contextInfoRaw.notes.trim().length > 0
                  ? contextInfoRaw.notes.trim()
                  : null,
            }
          : null;

      let toastMessage = "Rewrite applied";
      if (contextInfo?.applied) {
        toastMessage = contextInfo.notes
          ? `Rewrite applied · context repaired (${contextInfo.notes})`
          : "Rewrite applied · context repaired";
      } else if (contextInfo?.notes) {
        toastMessage = `Rewrite applied · ${contextInfo.notes}`;
      }
      toast.success(toastMessage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rewrite failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const pinBubble = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    if (!isPinnedRef.current) {
      isPinnedRef.current = true;
    }
    if (!isPinned) setIsPinned(true);
  };

  const unpinBubble = () => {
    if (blurTimeout.current) clearTimeout(blurTimeout.current);
    blurTimeout.current = setTimeout(() => {
      isPinnedRef.current = false;
      setIsPinned(false);
    }, 150);
  };

  const bubbleMenuOptions = useMemo(
    () => ({
      placement: "top-start" as const,
      offset: 12,
    }),
    []
  );

  const range = getActiveRange();

  return (
    <BubbleMenu
      editor={editor}
      className="z-30"
      options={bubbleMenuOptions}
      shouldShow={() => true}
    >
      <div
        className="w-80 rounded-lg border bg-popover p-3 text-popover-foreground shadow"
        style={{ maxWidth: 360 }}
        
        
        
      >
        <div className="space-y-2">
          {promptPresets.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="preset" className="text-xs text-muted-foreground">
                Prompt preset
              </Label>
              <Select
                value={selectedPresetId ?? "__none__"}
                onValueChange={(value) => {
                  if (value === "__none__") {
                    setSelectedPresetId(null);
                    return;
                  }
                  const preset = promptPresets.find((entry) => entry.id === value);
                  if (!preset) return;
                  setSelectedPresetId(value);
                  setInstruction(preset.content);
                }}
              >
                <SelectTrigger id="preset" className="h-8 text-xs">
                  <SelectValue placeholder="Select preset" />
                </SelectTrigger>
                <SelectContent  >
                  <SelectItem value="__none__" className="text-xs text-muted-foreground">
                    Custom instruction
                  </SelectItem>
                  {promptPresets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id} className="text-xs">
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Textarea
            placeholder="e.g. Tighten the prose while keeping the narrator's voice."
            value={instruction}
            onChange={(event) => {
              const value = event.target.value;
              setInstruction(value);
              if (promptPresets.length > 0) {
                const matched = promptPresets.find((preset) => preset.content === value.trim());
                setSelectedPresetId(matched ? matched.id : null);
              }
            }}
            rows={3}
            className="resize-none text-sm"
            onFocus={() => {
              pinBubble();
              const activeRange = range ?? getActiveRange();
              if (activeRange) {
                editor.chain().setTextSelection(activeRange).run();
              }
            }}
            onBlur={unpinBubble}
          />
          <div className="flex items-center gap-2">
            <Label htmlFor="model" className="text-xs font-medium text-muted-foreground">
              Model
            </Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model" className="h-8 flex-1 text-xs">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent  >
                {models.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="online" className="text-xs text-muted-foreground">
              Enable online context
            </Label>
            <Switch id="online" checked={online} onCheckedChange={setOnline}  />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="repair-context" className="text-xs text-muted-foreground">
              Modify context inconsistencies
            </Label>
            <Switch
              id="repair-context"
              checked={contextRepairEnabled}
              onCheckedChange={setContextRepairEnabled}
              
            />
          </div>
          <Button size="sm" className="w-full" onClick={handleRewrite} disabled={loading}>
            {loading ? "Rewriting…" : "Rewrite Selection"}
          </Button>
        </div>
      </div>
    </BubbleMenu>
  );
}
