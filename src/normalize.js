// Pure helpers that turn raw strings from the page into schema values.

// Values the site uses to mean "nothing here".
const PLACEHOLDERS = new Set(['-', '--', '—', 'n/a', 'na', 'none']);

/** Collapse whitespace; return null for empty, placeholder or non-string input. */
function cleanText(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text && !PLACEHOLDERS.has(text.toLowerCase()) ? text : null;
}

/** "$1,299.99" -> 1299.99, anything unparsable -> null. */
function parsePrice(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

/** Map free-form stock text to in_stock | out_of_stock | pre_order | null. */
function parseAvailability(value) {
  const text = (cleanText(value) || '').toLowerCase();
  if (!text) return null;
  if (/pre-?order|coming soon/.test(text)) return 'pre_order';
  if (/out of stock|sold out|unavailable|notify me/.test(text)) return 'out_of_stock';
  if (/in stock|add to cart/.test(text)) return 'in_stock';
  return null;
}

/** "4.7 (3)" -> { rating: 4.7, count: 3 }. */
function parseRating(value) {
  const text = cleanText(value);
  const match = text && text.match(/(\d+(?:\.\d+)?)\s*\(\s*(\d+)\s*\)/);
  if (!match) return { rating: null, count: null };
  return { rating: Number(match[1]), count: Number(match[2]) };
}

/** Resolve a possibly relative URL against the page URL. */
function absoluteUrl(value, base) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    return new URL(text, base).href;
  } catch {
    return null;
  }
}

function uniqueUrls(urls, base) {
  const seen = new Set();
  for (const url of urls) {
    const abs = absoluteUrl(url, base);
    if (abs) seen.add(abs);
  }
  return [...seen];
}

/** Find the first spec whose name matches the pattern. */
function findSpec(specs, pattern) {
  const spec = specs.find((s) => pattern.test(s.name));
  return spec ? spec.value : null;
}

module.exports = {
  cleanText,
  parsePrice,
  parseAvailability,
  parseRating,
  absoluteUrl,
  uniqueUrls,
  findSpec,
};
