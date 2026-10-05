const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const { extractRaw } = require('./extract');
const {
  cleanText,
  parsePrice,
  parseAvailability,
  parseRating,
  absoluteUrl,
  uniqueUrls,
  findSpec,
} = require('./normalize');

const TARGET_URL =
  'https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MAG-Z890-TOMAHAWK-WIFI';
const OUTPUT_FILE = path.join(__dirname, '..', 'output', 'product.json');

// The default headless UA contains "HeadlessChrome", which the site's CDN rejects with 403.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const MAX_ATTEMPTS = 3;
const NAV_TIMEOUT_MS = 60_000;
const REVIEWS_TIMEOUT_MS = 15_000;

async function openProductPage(browser, url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'en-US' });
    const page = await context.newPage();
    try {
      // Rating summary is injected later by an XHR to the reviews endpoint; optional.
      const reviewsLoaded = page
        .waitForResponse((res) => res.url().includes('route=product/product/review'), {
          timeout: REVIEWS_TIMEOUT_MS,
        })
        .catch(() => console.warn('Reviews block did not load; rating fields will be null'));

      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response ? response.status() : 'no response'}`);
      }
      // Title and price block are the minimum content we need.
      await page.waitForSelector('.product-detail h2.title', { timeout: NAV_TIMEOUT_MS });
      await page.waitForSelector('#prices-wrapper', { state: 'attached', timeout: NAV_TIMEOUT_MS });
      await reviewsLoaded;
      // Give the page script a moment to render the XHR response into the DOM.
      await page.waitForSelector('#average-rating-info', { state: 'attached', timeout: 3_000 }).catch(() => {});
      return page;
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message.split('\n')[0]}`);
      await context.close();
    }
  }
  throw new Error(`Could not load product page: ${lastError.message}`);
}

function buildCategoryTree(raw) {
  const fromBreadcrumbs = raw.breadcrumbs
    .map((crumb) => ({ name: cleanText(crumb.name), url: absoluteUrl(crumb.url, raw.url) }))
    .filter((crumb) => crumb.name);
  if (fromBreadcrumbs.length) return fromBreadcrumbs;

  // Fallback: categories from the analytics payload (no URLs there).
  const item = raw.analyticsItem || {};
  return ['item_category', 'item_category2', 'item_category3', 'item_category4', 'item_category5']
    .map((key) => cleanText(item[key]))
    .filter(Boolean)
    .map((name) => ({ name, url: null }));
}

function buildPrices(raw) {
  const current = parsePrice(raw.newPrice) ?? raw.analyticsItem?.price ?? null;
  const old = parsePrice(raw.oldPrice);
  // A visible crossed-out price means the current price is a discount.
  if (old !== null && current !== null && old > current) {
    return { price: old, sale_price: current };
  }
  return { price: current, sale_price: null };
}

function buildSpecs(raw) {
  return raw.specs
    .map((spec) => ({ name: cleanText(spec.name), value: cleanText(spec.value) }))
    .filter((spec) => spec.name);
}

function buildProduct(raw) {
  const categoryTree = buildCategoryTree(raw);
  const specs = buildSpecs(raw);
  const { rating, count } = parseRating(raw.ratingText);
  const imageUrl = absoluteUrl(raw.mainImage, raw.url);
  const title = cleanText(raw.title) || cleanText(raw.analyticsItem?.name) || cleanText(raw.imageAlt);

  return {
    url: raw.url,
    item_id: cleanText(raw.productId),
    title,
    // Single-brand official store; also confirmed by the store domain.
    brand: /(^|\.)msi\.com$/i.test(new URL(raw.url).hostname) ? 'MSI' : null,
    product_category: categoryTree.length ? categoryTree.map((c) => c.name).join(' > ') : null,
    category_tree: categoryTree,
    description: cleanText(raw.description),
    ...buildPrices(raw),
    availability:
      parseAvailability(raw.stockText) ?? (raw.hasAddToCart ? 'in_stock' : null),
    image_url: imageUrl,
    additional_image_urls: uniqueUrls(raw.galleryImages, raw.url).filter((url) => url !== imageUrl),
    specs,
    star_rating: rating,
    review_count: count,
    gtin: findSpec(specs, /\b(gtin|upc|ean)\b/i),
    mpn: findSpec(specs, /manufacturer (part )?number|\bmpn\b|part number/i),
    scraped_at: new Date().toISOString(),
  };
}

async function saveJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  // channel "chromium" runs the full browser in new headless mode, which passes the CDN bot check
  // (the default headless shell gets 403). Installed by `npx playwright install chromium`.
  const browser = await chromium.launch({ channel: 'chromium', headless: true });
  try {
    const page = await openProductPage(browser, TARGET_URL);
    const raw = await page.evaluate(extractRaw);
    const product = buildProduct(raw);

    if (!product.title) throw new Error('Product title not found - page layout may have changed');

    await saveJson(OUTPUT_FILE, product);
    console.log(
      `Saved ${path.relative(process.cwd(), OUTPUT_FILE)}: "${product.title}", ` +
        `price=${product.price}, sale_price=${product.sale_price}, specs=${product.specs.length}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Scrape failed: ${error.message}`);
  process.exitCode = 1;
});
