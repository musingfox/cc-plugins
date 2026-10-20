const TITLE_MAX = 200;

const clip = (text: string): string => Array.from(text).slice(0, TITLE_MAX).join("");

// The ticket's first line with its leading hashes stripped: the title until the worker names one.
export function ticketTitle(ticket: string): string {
  for (const raw of ticket.split(/\r?\n/)) {
    const line = raw.replace(/^[#\s]+/, "").trim();
    if (line) return clip(line);
  }
  return "";
}
