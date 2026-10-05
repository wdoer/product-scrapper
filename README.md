# MSI Product Page Scraper

Playwright (Node.js, plain JavaScript) scraper for one product page of the MSI US store:
<https://us-store.msi.com/Motherboards/Intel-Platform-Motherboard/INTEL-Z890/MAG-Z890-TOMAHAWK-WIFI>

It opens the page in headless Chromium, reads the product data from the live DOM and writes
`output/product.json`.

## Run

Requires Node.js 18+.

```bash
npm install
npx playwright install chromium
npm run scrape
```

`output/product.json` is created or overwritten. If the page can't be loaded, the script exits
with code 1 and the old file is left untouched.

Unit tests for the normalization helpers: `npm test`.

## Project structure

```
src/
  scrape.js     entry point: browser, navigation + retries, building the final JSON
  extract.js    reads raw values from the DOM (runs inside the page)
  normalize.js  pure helpers: prices, availability, rating, URLs, text cleanup
test/
  normalize.test.js
output/
  product.json  sample output
```

## Where each field comes from

The page has no JSON-LD or microdata, so the values come from the DOM. The `gtag("view_item", …)`
analytics payload in the HTML is used as a fallback for price, title and categories.

| Field | Source |
| --- | --- |
| `item_id` | hidden `input[name="product_id"]` (store product id) |
| `title` | `.product-detail h2.title` |
| `brand` | `MSI` if the page is on `*.msi.com` (single-brand official store) |
| `category_tree` / `product_category` | `ol.breadcrumb` links, without "Home" and the product itself |
| `description` | short summary paragraph right after the title |
| `price` / `sale_price` | `#prices-wrapper`. If a crossed-out old price is shown, `price` = old price and `sale_price` = current price. Otherwise `sale_price` is `null` |
| `availability` | stock text in `#prices-wrapper` ("In Stock", "Out of Stock", "Pre-Order"), mapped to the enum |
| `image_url` | `#imagePopup` (main 1024px image) |
| `additional_image_urls` | `popup_img` of the gallery thumbnails, skipping swiper loop clones and the main image |
| `specs` | "Detail specification" table rows (`th[scope=row]` + `td`). Multi-line values are joined with `; ` |
| `star_rating` / `review_count` | `#average-rating-info` ("4.7 (3)"), which an XHR to the reviews endpoint loads after page load |
| `mpn` | the "Manufacturer Number" spec |
| `gtin` | a GTIN/UPC/EAN spec. This page doesn't show one, so it's `null` |

Normalization: prices are numbers, missing values and placeholders like `"-"` are `null`, and
list fields are empty arrays when nothing is found.

## Notes

- **Bot protection.** The site is behind Akamai. The default Playwright headless shell (and
  plain `curl`) gets `403 Access Denied`. Two things get the scraper through: it launches the full
  Chromium build in the new headless mode (`channel: 'chromium'`), and it sends a regular desktop
  User-Agent (the default one contains `HeadlessChrome`). It doesn't use stealth plugins or
  proxies. A failed navigation is retried up to 3 times.
- The page also offers bundle options (for example "+ SSD"). The scraper reports the base product
  price shown by default.
