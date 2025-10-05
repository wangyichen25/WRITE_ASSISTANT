"use client";

import { useState } from "react";

import { useEditorStore } from "@/store/editor-store";
import { useModels } from "@/hooks/use-models";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_CONTEXT_WINDOW, MAX_MAX_TOKENS, MAX_TEMPERATURE, MIN_MAX_TOKENS, MIN_TEMPERATURE } from "@/lib/rewrite-config";
import { Textarea } from "@/components/ui/textarea";

type ModelSettingsProps = {
  className?: string;
};

export function ModelSettings({ className }: ModelSettingsProps) {
  const { data } = useModels();
  const defaultModel = useEditorStore((state) => state.defaultModel);
  const setDefaultModel = useEditorStore((state) => state.setDefaultModel);
  const customModels = useEditorStore((state) => state.customModels);
  const setCustomModels = useEditorStore((state) => state.setCustomModels);
  const onlineMode = useEditorStore((state) => state.onlineMode);
  const setOnlineMode = useEditorStore((state) => state.setOnlineMode);
  const contextRepairEnabled = useEditorStore((state) => state.contextRepairEnabled);
  const setContextRepairEnabled = useEditorStore((state) => state.setContextRepairEnabled);
  const contextWindow = useEditorStore((state) => state.contextWindow);
  const setContextWindow = useEditorStore((state) => state.setContextWindow);
  const temperature = useEditorStore((state) => state.temperature);
  const setTemperature = useEditorStore((state) => state.setTemperature);
  const maxTokens = useEditorStore((state) => state.maxTokens);
  const setMaxTokens = useEditorStore((state) => state.setMaxTokens);
  const promptPresets = useEditorStore((state) => state.promptPresets);
  const addPromptPreset = useEditorStore((state) => state.addPromptPreset);
  const updatePromptPreset = useEditorStore((state) => state.updatePromptPreset);
  const removePromptPreset = useEditorStore((state) => state.removePromptPreset);
  const models = data?.models && data.models.length > 0 ? data.models : Array.from(new Set([...customModels, defaultModel]));
  const [newModel, setNewModel] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetContent, setPresetContent] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingContent, setEditingContent] = useState("");

  const handleAddModel = () => {
    const trimmed = newModel.trim();
    if (!trimmed) return;
    if (models.includes(trimmed)) {
      setNewModel("");
      return;
    }
    setCustomModels([...customModels, trimmed]);
    setNewModel("");
  };

  const handleRemoveModel = (model: string) => {
    const remaining = customModels.filter((entry) => entry !== model);
    setCustomModels(remaining);
    if (defaultModel === model) {
      const available = Array.from(new Set([...(data?.models ?? []), ...remaining])).filter((item) => item !== model);
      if (available.length > 0) {
        setDefaultModel(available[0]);
      }
    }
  };

  const handleAddPreset = () => {
    if (!presetName.trim() || !presetContent.trim()) return;
    addPromptPreset({ name: presetName, content: presetContent });
    setPresetName("");
    setPresetContent("");
  };

  const handleStartEdit = (presetId: string) => {
    const preset = promptPresets.find((entry) => entry.id === presetId);
    if (!preset) return;
    setEditingPresetId(presetId);
    setEditingName(preset.name);
    setEditingContent(preset.content);
  };

  const handleSaveEdit = () => {
    if (!editingPresetId) return;
    updatePromptPreset({ id: editingPresetId, name: editingName, content: editingContent });
    setEditingPresetId(null);
    setEditingName("");
    setEditingContent("");
  };

  const handleCancelEdit = () => {
    setEditingPresetId(null);
    setEditingName("");
    setEditingContent("");
  };

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-2">
        <Label htmlFor="global-model" className="text-sm font-medium">
          Default model
        </Label>
        <p className="text-xs text-muted-foreground">
          Choose which model to use when opening the rewrite bubble. You can still switch per rewrite.
        </p>
        <Select value={defaultModel} onValueChange={setDefaultModel}>
          <SelectTrigger id="global-model" className="h-9 w-full">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model} value={model} className="text-sm">
                {model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-2">
            <Label htmlFor="custom-model" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Custom models
            </Label>
            <div className="flex gap-2">
              <Input
                id="custom-model"
                placeholder="provider/model:variant"
                value={newModel}
                onChange={(event) => setNewModel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddModel();
                  }
                }}
                className="h-9 flex-1"
              />
              <Button type="button" onClick={handleAddModel} className="h-9" disabled={!newModel.trim()}>
                Add
              </Button>
            </div>
          </div>
          {customModels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customModels.map((model) => (
                <div key={model} className="flex items-center gap-2 rounded-full border border-muted px-3 py-1 text-xs">
                  <span>{model}</span>
                  <button
                    type="button"
                    className="text-muted-foreground transition hover:text-foreground"
                    onClick={() => handleRemoveModel(model)}
                    aria-label={`Remove ${model}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add model slugs here to make them available in the rewrite bubble.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="global-online" className="text-sm font-medium">
              Online context default
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, rewrites request live web context unless you toggle it off for a specific edit.
            </p>
          </div>
          <Switch id="global-online" checked={onlineMode} onCheckedChange={setOnlineMode} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="global-context-repair" className="text-sm font-medium">
              Context repair default
            </Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the assistant runs the secondary continuity pass automatically after each rewrite.
            </p>
          </div>
          <Switch
            id="global-context-repair"
            checked={contextRepairEnabled}
            onCheckedChange={setContextRepairEnabled}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Prompt presets</Label>
          <p className="text-xs text-muted-foreground">
            Save reusable instructions and insert them quickly from the rewrite bubble.
          </p>
        </div>
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid gap-2">
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
            <Button type="button" onClick={handleAddPreset} disabled={!presetName.trim() || !presetContent.trim()}>
              Add preset
            </Button>
          </div>
          {promptPresets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No presets yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {promptPresets.map((preset) => {
                const isEditing = editingPresetId === preset.id;
                return (
                  <div key={preset.id} className="rounded-md border border-border/60 p-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <Input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          className="h-8"
                        />
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
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm">{preset.name}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{preset.content}</p>
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="global-context-window" className="text-sm font-medium">
          Context window (words per side)
        </Label>
        <p className="text-xs text-muted-foreground">
          Determines how many words before and after the selection are sent to the model as extra context.
        </p>
        <Input
          id="global-context-window"
          type="number"
          min={0}
          max={MAX_CONTEXT_WINDOW}
          step={10}
          value={contextWindow}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isNaN(value)) return;
            setContextWindow(value);
          }}
          onBlur={(event) => {
            const value = Number(event.target.value);
            setContextWindow(Number.isNaN(value) ? contextWindow : value);
          }}
          className="h-9 w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="global-temperature" className="text-sm font-medium">
          Model temperature
        </Label>
        <p className="text-xs text-muted-foreground">
          Controls creativity. Lower values keep results conservative; higher values add variation.
        </p>
        <Input
          id="global-temperature"
          type="number"
          min={MIN_TEMPERATURE}
          max={MAX_TEMPERATURE}
          step={0.05}
          value={temperature}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isNaN(value)) return;
            setTemperature(value);
          }}
          onBlur={(event) => {
            const value = Number(event.target.value);
            setTemperature(Number.isNaN(value) ? temperature : value);
          }}
          className="h-9 w-full"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="global-max-tokens" className="text-sm font-medium">
          Max response tokens
        </Label>
        <p className="text-xs text-muted-foreground">
          Increase to allow longer rewrites. Higher values may consume more credits.
        </p>
        <Input
          id="global-max-tokens"
          type="number"
          min={MIN_MAX_TOKENS}
          max={MAX_MAX_TOKENS}
          step={64}
          value={maxTokens}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isNaN(value)) return;
            setMaxTokens(value);
          }}
          onBlur={(event) => {
            const value = Number(event.target.value);
            setMaxTokens(Number.isNaN(value) ? maxTokens : value);
          }}
          className="h-9 w-full"
        />
      </div>

    </div>
  );
}
