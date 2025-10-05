import { applySelectionPatch } from "@/lib/diff";
import { getChapter, recordEditOperation, updateChapterContent } from "@/lib/documents";
import { buildOnlineContext } from "@/lib/online";
import { callOpenRouter } from "@/lib/openrouter";
import type { RouterMessage } from "@/lib/openrouter";
import {
  clampMaxTokens,
  clampTemperature,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  resolveContextWindow,
} from "@/lib/rewrite-config";
import { upsertChapterSearch } from "@/lib/search";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
const SYSTEM_PROMPT = `You are a careful literary rewrite assistant.
- Preserve meaning, voice, POV, tense, and continuity unless instructed otherwise.
- Keep names, facts, and timelines intact.
- Retain paragraph breaks and formatting unless the user specifies otherwise.
- Output ONLY the rewritten passage without commentary unless the instructions specify a format.
- When given an explicit output format, follow it exactly.`;
const CONTEXT_REPAIR_SYSTEM_PROMPT = `You are a surgical continuity editor.
- Maintain consistency around a rewritten passage without changing its new content.
- Use the original rewrite conversation as context.
- Propose at most three precise edits per pass.
- Each edit must specify the exact original snippet to replace and the new text.
- Never alter the rewritten selection itself.
- Only operate on complete sentences around the selection (do not truncate sentences at the margins).
- Stop proposing edits when the context is consistent.
- Respond ONLY with strict raw JSON using the schema {"changes": Array<{"region": "before" | "after", "original": string, "replacement": string}>, "notes": string | null}.`;
const CONTEXT_REPAIR_CHAR_WINDOW = 600;
const MAX_CONTEXT_REPAIR_ITERATIONS = 3;
type ContextAdjustmentSummary =
  | false
  | {
      applied: boolean;
      notes: string | null;
      latencyMs: number;
    };
type ContextRepairAdjustment = {
  start: number;
  end: number;
  replacement: string;
  original: string;
  region: "before" | "after";
  iteration: number;
};
type ContextRepairOutcome = {
  applied: boolean;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  adjustments: ContextRepairAdjustment[];
  notes: string | null;
  latencyMs: number;
};
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      chapterId,
      selectionStart,
      selectionEnd,
      instruction,
      model,
      context,
      contextWindow,
      temperature,
      maxTokens,
      repairContext,
    } = body as {
      chapterId: string;
      selectionStart: number;
      selectionEnd: number;
      instruction: string;
      model: string;
      context?: { lang?: string };
      contextWindow?: number;
      temperature?: number;
      maxTokens?: number;
      repairContext?: boolean;
    };
    if (!chapterId || typeof selectionStart !== "number" || typeof selectionEnd !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    if (!instruction || !model) {
      return NextResponse.json({ error: "Missing instruction or model" }, { status: 400 });
    }
    if (selectionEnd <= selectionStart) {
      return NextResponse.json({ error: "Selection range is empty" }, { status: 400 });
    }
    const chapter = await getChapter(chapterId);
    const selectedText = chapter.content.slice(selectionStart, selectionEnd);
    if (!selectedText) {
      return NextResponse.json({ error: "Selection outside chapter bounds" }, { status: 400 });
    }
    const wordsPerSide = resolveContextWindow(contextWindow);
    const { beforeContext, afterContext } = collectContext({
      text: chapter.content,
      selectionStart,
      selectionEnd,
      wordsPerSide,
    });
    const online = model.endsWith(":online");
    const repairModel = online ? model.replace(/:online$/, "") : model;
    const lang = context?.lang ?? chapter.document.lang;
    const resolvedTemperature = clampTemperature(typeof temperature === "number" ? temperature : DEFAULT_TEMPERATURE);
    const resolvedMaxTokens = clampMaxTokens(typeof maxTokens === "number" ? maxTokens : DEFAULT_MAX_TOKENS);
    const shouldRepairContext = Boolean(repairContext);
    console.info("LLM rewrite parameters", {
      chapterId,
      contextWindow: wordsPerSide,
      resolvedTemperature,
      resolvedMaxTokens,
      repairContext: shouldRepairContext,
    });
    const messages: RouterMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
    if (online) {
      const webContext = await buildOnlineContext({ instruction, selection: selectedText });
      messages.push({ role: "user", content: webContext });
    }
    messages.push({
      role: "user",
      content: buildUserPrompt({
        instruction,
        lang,
        online,
        selectedText,
        beforeContext,
        afterContext,
      }),
    });
    console.info("LLM rewrite request payload", {
      model,
      resolvedTemperature,
      resolvedMaxTokens,
      messageCount: messages.length,
      messages,
    });
    const startedAt = Date.now();
    const response = await callOpenRouter({
      model,
      messages,
      temperature: resolvedTemperature,
      stream: false,
      maxTokens: resolvedMaxTokens,
    });
    const payload = await response.json();
    const rawResult = extractResultText(payload);
    if (!rawResult) {
      return NextResponse.json({ error: "Model returned empty output" }, { status: 502 });
    }
    const current = await getChapter(chapterId);
    const patch = applySelectionPatch({
      chapterText: current.content,
      selectionStart,
      selectionEnd,
      originalSlice: selectedText,
      replacement: rawResult,
    });
    if (!patch.success) {
      return NextResponse.json({
        error: "Selection has changed. Please re-select the passage and try again.",
      }, { status: 409 });
    }
    let finalSelectionStart = selectionStart;
    let finalSelectionEnd = selectionStart + rawResult.length;
    let finalChapterText = patch.updatedText;
    let contextSummary: ContextAdjustmentSummary = false;
    let contextDetails: ContextRepairOutcome | null = null;
    if (shouldRepairContext) {
      try {
        const repairOutcome = await repairContextAroundSelection({
          baseText: patch.updatedText,
          instruction,
          rewrittenSelection: rawResult,
          selectionStart: finalSelectionStart,
          selectionEnd: finalSelectionEnd,
          lang,
          model: repairModel,
          firstPassMessages: messages,
          maxTokens: resolvedMaxTokens,
        });
        contextDetails = repairOutcome;
        if (repairOutcome.applied) {
          finalChapterText = repairOutcome.text;
          finalSelectionStart = repairOutcome.selectionStart;
          finalSelectionEnd = repairOutcome.selectionEnd;
          contextSummary = {
            applied: true,
            notes: repairOutcome.notes ?? null,
            latencyMs: repairOutcome.latencyMs,
          };
        } else if (repairOutcome.notes) {
          contextSummary = {
            applied: false,
            notes: repairOutcome.notes,
            latencyMs: repairOutcome.latencyMs,
          };
        }
      } catch (error) {
        console.error("Context repair failed", error);
        contextSummary = {
          applied: false,
          notes: "Context repair failed",
          latencyMs: 0,
        };
      }
    }
    const updated = await updateChapterContent(chapterId, finalChapterText);
    await upsertChapterSearch(chapterId, finalChapterText);
    const latencyMs = Date.now() - startedAt;
    await recordEditOperation({
      chapterId,
      selectionStart: finalSelectionStart,
      selectionEnd: finalSelectionEnd,
      instruction,
      original: selectedText,
      result: rawResult,
      model,
      latencyMs,
    });
    if (contextDetails?.applied) {
      for (const adjustment of contextDetails.adjustments) {
        await recordEditOperation({
          chapterId,
          selectionStart: adjustment.start,
          selectionEnd: adjustment.end,
          instruction: "[auto] Context repair",
          original: adjustment.original,
          result: adjustment.replacement,
          model,
          latencyMs: contextDetails.latencyMs,
        });
      }
    }
    return NextResponse.json({
      result: rawResult,
      originalSnippet: selectedText,
      range: { start: finalSelectionStart, end: finalSelectionEnd },
      latencyMs,
      updatedAt: updated.updatedAt,
      contextAdjustments: contextSummary,
      chapterText: finalChapterText,
    });
  } catch (error) {
    console.error("LLM rewrite failed", error);
    return NextResponse.json({ error: "Rewrite failed" }, { status: 500 });
  }
}
type PromptParams = {
  instruction: string;
  selectedText: string;
  lang: string;
  online: boolean;
  beforeContext: string;
  afterContext: string;
};
function buildUserPrompt({
  instruction,
  selectedText,
  lang,
  online,
  beforeContext,
  afterContext,
}: PromptParams) {
  const langLine = lang === "zh" ? "zh" : "en";
  const zhExtra = langLine === "zh"
    ? "\n- Use Simplified Chinese unless the original uses Traditional. Preserve idioms and honorifics."
    : "";
  const onlineNote = online ? "\nWEB CONTEXT PROVIDED ABOVE." : "";
  const baseConstraints = [
    "- Keep length within ±20% unless instructed otherwise.",
    "- Retain paragraph breaks and spacing.",
    "- Preserve narrative continuity." + onlineNote,
    "- Return ONLY the rewritten selection with no commentary.",
  ];
  return `INSTRUCTION:\n${instruction}\n\nLANGUAGE:\n${langLine}${zhExtra}\n\nCONTEXT BEFORE:\n${beforeContext || "(none)"}\n\nSELECTION:\n${selectedText}\n\nCONTEXT AFTER:\n${afterContext || "(none)"}\n\nCONSTRAINTS:\n${baseConstraints.join("\n")}`;
}
type ContextParams = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  wordsPerSide: number;
};
function collectContext({ text, selectionStart, selectionEnd, wordsPerSide }: ContextParams) {
  if (wordsPerSide <= 0) {
    return { beforeContext: "", afterContext: "" };
  }
  const before = sliceWordsFromEnd(text.slice(0, selectionStart), wordsPerSide);
  const after = sliceWordsFromStart(text.slice(selectionEnd), wordsPerSide);
  return { beforeContext: before, afterContext: after };
}
function sliceWordsFromEnd(segment: string, words: number) {
  if (!segment) return "";
  const tokens = segment.match(/\S+\s*/g);
  if (!tokens) return segment;
  return tokens.slice(-words).join("").trimStart();
}
function sliceWordsFromStart(segment: string, words: number) {
  if (!segment) return "";
  const tokens = segment.match(/\s*\S+/g);
  if (!tokens) return segment;
  return tokens.slice(0, words).join("").trimEnd();
}
function extractResultText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const choice = choices[0];
  if (!choice || typeof choice !== "object") return "";
  const message = (choice as { message?: { content?: unknown } | undefined }).message;
  const delta = (choice as { delta?: { content?: unknown } | undefined }).delta;
  const content = message?.content ?? delta?.content ?? "";
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const maybeText = (part as { text?: unknown }).text;
          if (typeof maybeText === "string") return maybeText;
          const maybeValue = (part as { value?: unknown }).value;
          if (typeof maybeValue === "string") return maybeValue;
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}
type ContextRepairParams = {
  baseText: string;
  selectionStart: number;
  selectionEnd: number;
  rewrittenSelection: string;
  instruction: string;
  lang: string;
  model: string;
  firstPassMessages: RouterMessage[];
  maxTokens: number;
};
type RawContextRepair = {
  changes?: unknown;
  notes?: unknown;
};
type ParsedRepairChange = {
  region: "before" | "after";
  original: string;
  replacement: string;
};
async function repairContextAroundSelection({
  baseText,
  selectionStart,
  selectionEnd,
  rewrittenSelection,
  instruction,
  lang,
  model,
  firstPassMessages,
  maxTokens,
}: ContextRepairParams): Promise<ContextRepairOutcome> {
  let workingText = baseText;
  let workingSelectionStart = selectionStart;
  let workingSelectionEnd = selectionEnd;
  const adjustments: ContextRepairAdjustment[] = [];
  const notesAccumulator: string[] = [];
  let totalLatency = 0;
  for (let iteration = 0; iteration < MAX_CONTEXT_REPAIR_ITERATIONS; iteration += 1) {
    const regions = collectRepairRegions(workingText, workingSelectionStart, workingSelectionEnd);
    const hasBeforeContent = regions.before.text.trim().length > 0;
    const hasAfterContent = regions.after.text.trim().length > 0;
    if (!hasBeforeContent && !hasAfterContent) {
      break;
    }
    const prompt = buildContextRepairPrompt({
      instruction,
      lang,
      rewrittenSelection,
      beforeRegion: regions.before.text,
      afterRegion: regions.after.text,
      firstPassConversation: formatConversationForRepair(firstPassMessages),
    });
    const repairMessages: RouterMessage[] = [
      { role: 'system', content: CONTEXT_REPAIR_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];
    let raw = '';
    const startedAt = Date.now();
    try {
      const response = await callOpenRouter({
        model,
        messages: repairMessages,
        temperature: 0.2,
        stream: false,
        maxTokens,
      });
      const payload = await response.json();
      raw = extractResultText(payload);
    } catch (error) {
      console.error('Context repair LLM call failed', error);
      break;
    }
    const latencyMs = Date.now() - startedAt;
    totalLatency += latencyMs;
    if (!raw) {
      break;
    }
    const parsed = parseContextRepairJson(raw);
    if (!parsed) {
      console.warn('Context repair: unable to parse JSON output', raw);
      break;
    }
    if (parsed.notes) {
      notesAccumulator.push(parsed.notes);
    }
    const cappedChanges = parsed.changes.slice(0, 3);
    if (cappedChanges.length === 0) {
      break;
    }
    let appliedThisRound = 0;
    let afterBoundaryEnd = regions.after.end;
    for (const change of cappedChanges) {
      if (!isValidRepairChange(change)) continue;
      if (appliedThisRound >= 3) break;
      const application = applyContextRepairChange({
        change,
        text: workingText,
        selectionStart: workingSelectionStart,
        selectionEnd: workingSelectionEnd,
        beforeBoundaryStart: regions.before.start,
        afterBoundaryEnd,
      });
      if (!application) continue;
      const { text, selectionStart: nextStart, selectionEnd: nextEnd, adjustment, nextAfterBoundaryEnd } = application;
      workingText = text;
      workingSelectionStart = nextStart;
      workingSelectionEnd = nextEnd;
      afterBoundaryEnd = nextAfterBoundaryEnd;
      adjustments.push({ ...adjustment, iteration });
      appliedThisRound += 1;
    }
    if (appliedThisRound === 0) {
      break;
    }
  }
  const notes = notesAccumulator.length > 0 ? notesAccumulator.join(' | ') : null;
  return {
    applied: adjustments.length > 0,
    text: workingText,
    selectionStart: workingSelectionStart,
    selectionEnd: workingSelectionEnd,
    adjustments,
    notes,
    latencyMs: totalLatency,
  };
}
type ContextRepairPromptParams = {
  instruction: string;
  lang: string;
  rewrittenSelection: string;
  beforeRegion: string;
  afterRegion: string;
  firstPassConversation: string;
};
function buildContextRepairPrompt({
  instruction,
  lang,
  rewrittenSelection,
  beforeRegion,
  afterRegion,
  firstPassConversation,
}: ContextRepairPromptParams): string {
  const langLine = lang === 'zh' ? 'Chinese' : 'English';
  const beforeBlock = beforeRegion || '(none)';
  const afterBlock = afterRegion || '(none)';
  const selectionBlock = rewrittenSelection || '(empty)';
  return `You must repair continuity issues caused by the latest rewrite without touching the rewritten selection.
First-pass conversation (for context):
${firstPassConversation || '(not available)'}
Instruction for the rewrite:
${instruction}
Language: ${langLine}
Immutable rewritten selection:
<<<SELECTION>>>
${selectionBlock}
<<<END-SELECTION>>>
Editable context before the selection (use whole sentences only):
<<<BEFORE>>>
${beforeBlock}
<<<END-BEFORE>>>
Editable context after the selection (use whole sentences only):
<<<AFTER>>>
${afterBlock}
<<<END-AFTER>>>
Task:
- Inspect the before/after context for inconsistencies with the rewritten selection.
- Propose at most three precise edits.
- Each edit must specify the exact original text to replace and the new text.
- Keep every edit self-contained within a single sentence boundary.
- Do not modify or duplicate the rewritten selection.
- If no edits are required, return an empty array.
Respond with STRICT JSON in this schema:
{
  "changes": [
    { "region": "before" | "after", "original": string, "replacement": string }
  ],
  "notes": string | null
}`;
}
function parseContextRepairJson(raw: string): { changes: ParsedRepairChange[]; notes: string | null } | null {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  if (!cleaned) return null;
  const direct = tryParseContextRepairObject(cleaned);
  if (direct) return direct;
  const candidate = extractFirstJsonObject(cleaned);
  if (candidate) {
    const parsedCandidate = tryParseContextRepairObject(candidate);
    if (parsedCandidate) return parsedCandidate;
    const sanitizedCandidate = sanitizeJsonLike(candidate);
    const parsedSanitizedCandidate = tryParseContextRepairObject(sanitizedCandidate);
    if (parsedSanitizedCandidate) return parsedSanitizedCandidate;
  }
  const sanitized = sanitizeJsonLike(cleaned);
  const parsedSanitized = tryParseContextRepairObject(sanitized);
  if (parsedSanitized) return parsedSanitized;
  return parseLooseContextRepair(cleaned);
}
function tryParseContextRepairObject(input: string): { changes: ParsedRepairChange[]; notes: string | null } | null {
  try {
    const parsed = JSON.parse(input) as RawContextRepair;
    return normalizeContextRepair(parsed);
  } catch (error) {
    console.warn('Context repair: JSON parse failed', error);
    return null;
  }
}
function normalizeContextRepair(parsed: RawContextRepair | null): { changes: ParsedRepairChange[]; notes: string | null } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const changesRaw = Array.isArray(parsed.changes) ? parsed.changes : [];
  const changes: ParsedRepairChange[] = [];
  for (const candidate of changesRaw) {
    const normalized = coerceRepairChange(candidate);
    if (normalized) {
      changes.push(normalized);
    }
  }
  const notesValue = typeof parsed.notes === 'string' ? parsed.notes.trim() : null;
  const notes = notesValue && notesValue.length > 0 ? notesValue : null;
  return { changes, notes };
}
function unescapeLooseValue(value: string): string {
  try {
    const normalized = value.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (match, seq) => {
      if (!seq) return match;
      switch (seq) {
        case 'n':
          return '\n';
        case 'r':
          return '\r';
        case 't':
          return '\t';
        case '\\':
          return '\\';
        case '"':
          return '"';
        default:
          if (/^u[0-9a-fA-F]{4}$/.test(seq)) {
            return String.fromCharCode(parseInt(seq.slice(1), 16));
          }
          if (/^x[0-9a-fA-F]{2}$/.test(seq)) {
            return String.fromCharCode(parseInt(seq.slice(1), 16));
          }
          return seq;
      }
    });
    return normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } catch (error) {
    console.warn("Context repair: failed to unescape value", error);
    return value;
  }
}
function coerceRepairChange(candidate: unknown): ParsedRepairChange | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const regionValue = (candidate as { region?: unknown }).region;
  const originalValue = (candidate as { original?: unknown }).original;
  const replacementValue = (candidate as { replacement?: unknown }).replacement;
  if (regionValue !== 'before' && regionValue !== 'after') {
    return null;
  }
  if (typeof originalValue !== 'string' || typeof replacementValue !== 'string') {
    return null;
  }
  return {
    region: regionValue,
    original: unescapeLooseValue(originalValue),
    replacement: unescapeLooseValue(replacementValue),
  };
}
function sanitizeJsonLike(input: string): string {
  let sanitized = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (escaped) {
      sanitized += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      sanitized += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      sanitized += char;
      continue;
    }
    if (inString && char === "\n") {
      sanitized += "\\n";
      continue;
    }
    if (inString && char === "\r") {
      sanitized += "\\r";
      continue;
    }
    sanitized += char;
  }
  return sanitized;
}
function parseLooseContextRepair(source: string): { changes: ParsedRepairChange[]; notes: string | null } | null {
  const changes: ParsedRepairChange[] = [];
  const changePattern = /"region"\s*:\s*"(before|after)"[\s\S]*?"original"\s*:\s*"([\s\S]*?)"[\s\S]*?"replacement"\s*:\s*"([\s\S]*?)"/gi;
  let match: RegExpExecArray | null;
  while ((match = changePattern.exec(source)) !== null) {
    const region = match[1] as 'before' | 'after';
    const original = unescapeLooseValue(match[2]);
    const replacement = unescapeLooseValue(match[3]);
    if (!original || !replacement) continue;
    changes.push({ region, original, replacement });
    if (changes.length >= 3) break;
  }
  if (changes.length === 0) {
    return null;
  }
  const notesMatch = /"notes"\s*:\s*"([\s\S]*?)"/.exec(source);
  const notes = notesMatch ? unescapeLooseValue(notesMatch[1]).trim() : '';
  return {
    changes,
    notes: notes.length > 0 ? notes : null,
  };
}
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  return null;
}
function isValidRepairChange(change: ParsedRepairChange | null | undefined): change is ParsedRepairChange {
  return Boolean(
    change &&
    (change.region === 'before' || change.region === 'after') &&
    typeof change.original === 'string' &&
    change.original.length > 0 &&
    typeof change.replacement === 'string' &&
    change.replacement.length > 0,
  );
}
type ApplyContextRepairChangeParams = {
  change: ParsedRepairChange;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  beforeBoundaryStart: number;
  afterBoundaryEnd: number;
};
type ApplyContextRepairChangeResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  adjustment: Omit<ContextRepairAdjustment, 'iteration'>;
  nextAfterBoundaryEnd: number;
};
function applyContextRepairChange({
  change,
  text,
  selectionStart,
  selectionEnd,
  beforeBoundaryStart,
  afterBoundaryEnd,
}: ApplyContextRepairChangeParams): ApplyContextRepairChangeResult | null {
  if (change.region === 'before') {
    const regionText = text.slice(beforeBoundaryStart, selectionStart);
    const relativeIndex = regionText.indexOf(change.original);
    if (relativeIndex === -1) {
      return null;
    }
    const absoluteStart = beforeBoundaryStart + relativeIndex;
    const absoluteEnd = absoluteStart + change.original.length;
    if (absoluteEnd > selectionStart) {
      return null;
    }
    const updatedText = `${text.slice(0, absoluteStart)}${change.replacement}${text.slice(absoluteEnd)}`;
    const delta = change.replacement.length - change.original.length;
    return {
      text: updatedText,
      selectionStart: selectionStart + delta,
      selectionEnd: selectionEnd + delta,
      nextAfterBoundaryEnd: afterBoundaryEnd + delta,
      adjustment: {
        start: absoluteStart,
        end: absoluteEnd,
        original: change.original,
        replacement: change.replacement,
        region: 'before',
      },
    };
  }
  const regionText = text.slice(selectionEnd, afterBoundaryEnd);
  const relativeIndex = regionText.indexOf(change.original);
  if (relativeIndex === -1) {
    return null;
  }
  const absoluteStart = selectionEnd + relativeIndex;
  const absoluteEnd = absoluteStart + change.original.length;
  if (absoluteStart < selectionEnd || absoluteEnd > afterBoundaryEnd) {
    return null;
  }
  const updatedText = `${text.slice(0, absoluteStart)}${change.replacement}${text.slice(absoluteEnd)}`;
  const delta = change.replacement.length - change.original.length;
  return {
    text: updatedText,
    selectionStart,
    selectionEnd,
    nextAfterBoundaryEnd: afterBoundaryEnd + delta,
    adjustment: {
      start: absoluteStart,
      end: absoluteEnd,
      original: change.original,
      replacement: change.replacement,
      region: 'after',
    },
  };
}
type ContextRegions = {
  before: { start: number; end: number; text: string };
  after: { start: number; end: number; text: string };
};
const SENTENCE_BOUNDARY_CHARS = new Set(['.', '!', '?', '。', '！', '？', ';', '；', '…']);
function collectRepairRegions(text: string, selectionStart: number, selectionEnd: number): ContextRegions {
  const beforeWindowStart = Math.max(0, selectionStart - CONTEXT_REPAIR_CHAR_WINDOW);
  const beforeStart = findSentenceBoundaryLeft(text, beforeWindowStart);
  const beforeEnd = selectionStart;
  const afterWindowEnd = Math.min(text.length, selectionEnd + CONTEXT_REPAIR_CHAR_WINDOW);
  const afterEnd = findSentenceBoundaryRight(text, afterWindowEnd);
  const afterStart = selectionEnd;
  return {
    before: {
      start: beforeStart,
      end: beforeEnd,
      text: text.slice(beforeStart, beforeEnd),
    },
    after: {
      start: afterStart,
      end: afterEnd,
      text: text.slice(afterStart, afterEnd),
    },
  };
}
function findSentenceBoundaryLeft(text: string, index: number): number {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (SENTENCE_BOUNDARY_CHARS.has(char)) {
      let nextIndex = cursor + 1;
      while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
        nextIndex += 1;
      }
      return nextIndex;
    }
  }
  return 0;
}
function findSentenceBoundaryRight(text: string, index: number): number {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (SENTENCE_BOUNDARY_CHARS.has(char)) {
      let nextIndex = cursor + 1;
      while (nextIndex < text.length && /\s/.test(text[nextIndex])) {
        nextIndex += 1;
      }
      return nextIndex;
    }
  }
  return text.length;
}
function formatConversationForRepair(messages: RouterMessage[]): string {
  if (!messages || messages.length === 0) {
    return "(empty)";
  }
  return messages
    .map((message, index) => {
      const header = `#${index + 1} ${message.role.toUpperCase()}`;
      return `${header}\n${serializeMessageContent(message.content)}`;
    })
    .join("\n\n");
}
function serializeMessageContent(content: RouterMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return JSON.stringify(part);
      })
      .join("\n");
  }
  if (content && typeof content === 'object') {
    return JSON.stringify(content);
  }
  return String(content ?? '');
}
