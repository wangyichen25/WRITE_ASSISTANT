import { parse } from "node-html-parser";

export function htmlToPlainText(html: string): string {
  const root = parse(html, {
    lowerCaseTagName: false,
    comment: false,
  });

  const text = root
    .innerText.replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text;
}
