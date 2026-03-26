const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9\s="'\-_./:]*>/g;
const MD_IMAGE = /!\[[^\]]*\]\([^)]+\)/g;
const MD_LINK = /\[([^\]]*)\]\([^)]+\)/g;
const BARE_URL = /(?<!\()https?:\/\/\S+/g;

export function sanitize(text: string): string {
  return text
    .replace(HTML_TAG, "")
    .replace(MD_IMAGE, "")
    .replace(MD_LINK, "$1")
    .replace(BARE_URL, "[link removed]")
    .trim();
}
