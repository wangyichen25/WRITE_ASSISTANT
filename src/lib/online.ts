import { htmlToPlainText } from "@/lib/html2text";
import { parse } from "node-html-parser";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";
const MAX_RESULTS = 3;
const FETCH_TIMEOUT_MS = 7000;

export type OnlineContextParams = {
  instruction: string;
  selection: string;
};

type SearchResult = {
  title: string;
  url: string;
};

type ContextSnippet = {
  title: string;
  url: string;
  snippet: string;
};

export async function buildOnlineContext({ instruction, selection }: OnlineContextParams) {
  const query = createQuery(instruction, selection);
  if (!query) return "WEB CONTEXT:\n";

  const results = await search(query);
  const snippets = await Promise.all(results.map(fetchSnippet));

  const filtered = snippets.filter((item): item is ContextSnippet => Boolean(item?.snippet));
  if (filtered.length === 0) {
    return `WEB CONTEXT:\n[No context retrieved for query: ${query}]`;
  }

  const payload = filtered
    .map((item, index) => {
      const header = `[${index + 1}] ${item.title} — ${item.url}`;
      return `${header}\n${item.snippet}`;
    })
    .join("\n\n");

  return `WEB CONTEXT:\n${payload}`;
}

function createQuery(instruction: string, selection: string) {
  const cleanedInstruction = instruction.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const selectionSummary = selection.slice(0, 160).replace(/\s+/g, " ");
  const base = `${cleanedInstruction} ${selectionSummary}`.trim();
  return base.slice(0, 200);
}

async function search(query: string): Promise<SearchResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(`${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&ia=web`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WriteAssistantBot/1.0 (+https://localhost)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const html = await response.text();
    const root = parse(html);
    const anchors = root.querySelectorAll("a.result__a").slice(0, MAX_RESULTS);
    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute("href") ?? "";
        const title = anchor.innerText.trim();
        try {
          const url = new URL(href);
          const uddg = url.searchParams.get("uddg");
          return uddg
            ? {
                title,
                url: decodeURIComponent(uddg),
              }
            : null;
        } catch {
          return null;
        }
      })
      .filter((item): item is SearchResult => Boolean(item));
  } catch (error) {
    console.warn("Online search failed", error);
    return [];
  }
}

async function fetchSnippet(result: SearchResult): Promise<ContextSnippet | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(result.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "WriteAssistantBot/1.0 (+https://localhost)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const text = htmlToPlainText(html).slice(0, 1200);
    return {
      title: result.title,
      url: result.url,
      snippet: text,
    };
  } catch (error) {
    console.warn("Failed to fetch snippet", result.url, error);
    return null;
  }
}
