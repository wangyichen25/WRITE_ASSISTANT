export type SupportedLang = "en" | "zh";

export type ChapterSegment = {
  index: number;
  title: string;
  start: number;
  end: number;
  content: string;
};

const EN_HEADINGS = [
  /\n?^\s*(chapter|book|part)\s+([0-9ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b.*$/gim,
  /\n?^\s*(prologue|epilogue|interlude)\b.*$/gim,
];

const ZH_HEADINGS = [
  /\n?^\s*第[一二三四五六七八九十百千0-9]+[章回节卷]\s*.*$/gim,
  /\n?^\s*(序章|序幕|楔子|尾声)\s*.*$/gim,
];

const SCENE_FENCE = /\n?^\s*([*]{3,}|—{3,}|-{3,}|#\s+.+)\s*$/gm;

const TARGET_SEGMENT_SIZE = 4500; // characters
const MIN_FRAGMENT_SIZE = 800; // characters

export function detectLang(text: string): SupportedLang {
  let cjk = 0;
  let latin = 0;
  const sample = text.slice(0, 50_000);
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df)
    ) {
      cjk += 1;
    } else if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
    ) {
      latin += 1;
    }
  }
  return cjk > latin ? "zh" : "en";
}

export function chapterize(text: string, lang: SupportedLang): ChapterSegment[] {
  if (!text.trim()) {
    return [];
  }

  const patterns = lang === "zh" ? ZH_HEADINGS : EN_HEADINGS;
  const headings = collectHeadings(text, patterns);

  const ranges = headings.length > 0
    ? buildRangesFromHeadings(text, headings)
    : fallbackRanges(text);

  const normalized = mergeShortRanges(ranges);

  return normalized.map((range, index) => ({
    index,
    title: range.title.trim() || `Chapter ${index + 1}`,
    start: range.start,
    end: range.end,
    content: text.slice(range.start, range.end).trimStart(),
  }));
}

type HeadingHit = {
  start: number;
  title: string;
};

type Range = {
  start: number;
  end: number;
  title: string;
};

function collectHeadings(text: string, patterns: RegExp[]): HeadingHit[] {
  const matches: HeadingHit[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      matches.push({ start: index, title: match[0] ?? "" });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const deduped: HeadingHit[] = [];
  for (const hit of matches) {
    const prev = deduped[deduped.length - 1];
    if (!prev || hit.start - prev.start > 5) {
      deduped.push(hit);
    } else if (hit.title.length > prev.title.length) {
      deduped[deduped.length - 1] = hit;
    }
  }

  return deduped;
}

function buildRangesFromHeadings(text: string, headings: HeadingHit[]): Range[] {
  const ranges: Range[] = [];
  if (headings[0]?.start && headings[0].start > MIN_FRAGMENT_SIZE) {
    ranges.push({
      start: 0,
      end: headings[0].start,
      title: "Preface",
    });
  }

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i]!;
    const next = headings[i + 1];
    const end = next ? next.start : text.length;
    if (end <= current.start) continue;
    ranges.push({ start: current.start, end, title: current.title });
  }

  return ranges;
}

function mergeShortRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return ranges;
  const merged: Range[] = [];
  for (const range of ranges) {
    const currentLength = range.end - range.start;
    if (merged.length === 0) {
      merged.push(range);
      continue;
    }
    if (currentLength < MIN_FRAGMENT_SIZE) {
      const prev = merged[merged.length - 1]!;
      merged[merged.length - 1] = {
        start: prev.start,
        end: range.end,
        title: prev.title,
      };
    } else {
      merged.push(range);
    }
  }
  return merged.filter((range) => range.end > range.start);
}

function fallbackRanges(text: string): Range[] {
  const length = text.length;
  const boundaries = Array.from(text.matchAll(SCENE_FENCE)).map((match) => match.index ?? 0);
  boundaries.push(length);

  const ranges: Range[] = [];
  let last = 0;
  let chapter = 1;

  const pushRange = (end: number) => {
    const start = last;
    if (end - start <= 0) return;
    ranges.push({
      start,
      end,
      title: `Chapter ${chapter}`,
    });
    chapter += 1;
    last = end;
  };

  for (const boundary of boundaries) {
    if (boundary - last >= TARGET_SEGMENT_SIZE) {
      const nearestBreak = findParagraphBreak(text, boundary);
      pushRange(nearestBreak);
    }
  }

  if (length - last > MIN_FRAGMENT_SIZE || ranges.length === 0) {
    ranges.push({
      start: last,
      end: length,
      title: `Chapter ${chapter}`,
    });
  }

  return ranges;
}

function findParagraphBreak(text: string, approxIndex: number): number {
  for (let i = approxIndex; i < text.length; i += 1) {
    if (text[i] === "\n" && text[i + 1] === "\n") {
      return i + 2;
    }
  }
  return Math.min(text.length, approxIndex);
}
