const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanText, parsePrice, parseAvailability, parseRating, uniqueUrls } = require('../src/normalize');

test('parsePrice', () => {
  assert.equal(parsePrice('$299.99'), 299.99);
  assert.equal(parsePrice(' $1,299.00 '), 1299);
  assert.equal(parsePrice('Call for price'), null);
  assert.equal(parsePrice(null), null);
});

test('parseAvailability', () => {
  assert.equal(parseAvailability('$259.99\nIn Stock'), 'in_stock');
  assert.equal(parseAvailability('Out of Stock'), 'out_of_stock');
  assert.equal(parseAvailability('Pre-Order'), 'pre_order');
  assert.equal(parseAvailability(''), null);
});

test('parseRating', () => {
  assert.deepEqual(parseRating(' 4.7 (3)'), { rating: 4.7, count: 3 });
  assert.deepEqual(parseRating(null), { rating: null, count: null });
});

test('cleanText and uniqueUrls', () => {
  assert.equal(cleanText('  a \n b '), 'a b');
  assert.equal(cleanText('-'), null);
  assert.deepEqual(uniqueUrls(['/a.png', 'https://x.com/a.png', ''], 'https://x.com/p'), ['https://x.com/a.png']);
});
