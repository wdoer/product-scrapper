// Reads raw values from the live DOM. Runs inside the browser via page.evaluate,
// so it must be self-contained (no closures over Node variables).
function extractRaw() {
  const text = (el) => (el ? el.innerText : null);
  const attr = (el, name) => (el ? el.getAttribute(name) : null);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Product block = the right column that holds the title.
  const titleEl = $('.product-detail h2.title');

  // Breadcrumb: skip "Home" and the current product (active, no link).
  const breadcrumbs = $$('ol.breadcrumb li.breadcrumb-item')
    .filter((li) => !li.classList.contains('active'))
    .map((li) => ({ name: text(li), url: attr($('a', li), 'href') }))
    .filter((c) => c.name && c.name.trim().toLowerCase() !== 'home');

  // Short marketing description directly follows the title.
  const descriptionEl = titleEl && titleEl.nextElementSibling;

  const pricesWrapper = $('#prices-wrapper');
  const newPriceEl = pricesWrapper && $('.prices-new, .price-new', pricesWrapper);
  const oldPriceEl = pricesWrapper && $('[class*="price-old"], [class*="prices-old"]', pricesWrapper);

  // Analytics event embedded in the HTML carries price + category as a fallback.
  let analyticsItem = null;
  for (const script of $$('script:not([src])')) {
    const match = script.textContent.match(/gtag\(\s*["']event["']\s*,\s*["']view_item["']\s*,\s*(\{[\s\S]*?\})\s*\);/);
    if (match) {
      try {
        analyticsItem = JSON.parse(match[1]).items?.[0] ?? null;
      } catch {
        /* ignore malformed analytics payload */
      }
      break;
    }
  }

  // Spec table rows: <th scope="row">Name</th><td>Value</td>.
  const specs = $$('table tr')
    .map((tr) => ({ th: $(':scope > th[scope="row"]', tr), td: $(':scope > td', tr) }))
    .filter(({ th, td }) => th && td)
    .map(({ th, td }) => ({
      // th is CSS-uppercased; textContent keeps the source casing.
      name: th.textContent,
      // Multi-line values (<br>, <li>) are joined with "; ".
      value: td.innerText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join('; ')
        .replace(/:;/g, ':'),
    }));

  return {
    url: location.href,
    productId: attr($('input[name="product_id"]'), 'value'),
    title: text(titleEl),
    imageAlt: attr($('#imagePopup'), 'alt'),
    breadcrumbs,
    description: text(descriptionEl),
    newPrice: text(newPriceEl),
    oldPrice: text(oldPriceEl),
    stockText: text(pricesWrapper),
    hasAddToCart: Boolean($('#button-cart')),
    analyticsItem,
    mainImage: attr($('#imagePopup'), 'src'),
    // Thumbnails link to the full-size image via popup_img; skip swiper's loop clones.
    galleryImages: $$('.swiper-slide:not(.swiper-slide-duplicate) .product-detail-thumb-bto').map(
      (img) => attr(img, 'popup_img') || attr(img, 'src'),
    ),
    ratingText: text($('#average-rating-info')),
    specs,
  };
}

module.exports = { extractRaw };
