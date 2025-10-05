export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function plainTextToHtml(text: string): string {
  if (!text) return "<p></p>";
  const blocks = text.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const safe = escapeHtml(block);
      return `<p>${safe.replace(/\n/g, "<br />")}</p>`;
    })
    .join("");
  return html || "<p></p>";
}
