export const CUSTOMER_SOURCES = [
  "Facebook", "Facebook Ad", "Instagram", "Instagram Ad", "LinkedIn", "LinkedIn Ad", "TikTok", "TikTok Ad",
  "YouTube", "X (Twitter)", "WhatsApp", "Messenger", "Telegram", "Direct Call", "SMS", "Email",
  "Cold Email", "Outreach", "Referral", "Existing Client", "Website", "Landing Page", "Google",
  "Google Ad", "SEO", "AI", "ChatGPT", "Fiverr", "Upwork", "Event", "Walk-in", "Partner", "Other",
] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]/g, "");

/** Roles matching the typed text: prefix matches first, then word/contains matches ("CEO" matches "C.E.O"). */
export function matchRoles(options: string[], query: string): string[] {
  const q = norm(query);
  if (!q) return options.slice();
  const starts: string[] = [];
  const contains: string[] = [];
  for (const o of options) {
    const n = norm(o);
    const words = o.toLowerCase().split(/[\s/&-]+/).map(norm);
    if (n.startsWith(q)) starts.push(o);
    else if (words.some((w) => w.startsWith(q)) || n.includes(q)) contains.push(o);
  }
  return [...starts, ...contains];
}

export const bdPhoneOk = (v: string) => /^01[3-9]\d{8}$/.test(v);
