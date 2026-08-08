/**
 * The picture on a verdict card — mirrors apps/web/lib/foodImages.ts.
 *
 * Preference order: the dish photo the backend extracted from the menu page, then the
 * order page's own og:image, then keyword artwork. The last is decoration rather than
 * evidence, so `isStock` lets the card label it — a stock photo presented as the real
 * plate is the same class of lie as an invented price.
 */

const STOCK = 'https://images.unsplash.com/';

const KEYWORDS = [
  [/wrap|cigkofte|shawarma|kebab|doner/, 'photo-1626700051175-6818013e1d4f'],
  [/wonton|dumpling|dim sum|bao|gyoza/, 'photo-1496116218417-1a781b1c416c'],
  [/biryani|pulao|mandi|kabsa|rice/, 'photo-1563379091339-03b21ab4a4f8'],
  [/burger|smash|patty/, 'photo-1568901346375-23c9450c58cd'],
  [/taco|burrito|quesadilla|mexican/, 'photo-1565299585323-38d6b0865b47'],
  [/sushi|sashimi|maki|poke/, 'photo-1579871494447-9811cf80d66c'],
  [/pizza|calzone/, 'photo-1513104890138-7c749659a591'],
  [/pasta|noodle|ramen|spaghetti/, 'photo-1551183053-bf91a1d81141'],
  [/salad|bowl|healthy|vegan/, 'photo-1540420773420-3366772f4999'],
  [/curry|masala|tikka|korma/, 'photo-1585937421612-70a008356fbe'],
  [/steak|grill|bbq|ribs/, 'photo-1546833999-b9f581a1996d'],
  [/chicken|wings|fried|broast/, 'photo-1562967914-608f82629710'],
  [/dessert|cake|kunafa|baklava/, 'photo-1551024506-0bccd828d307'],
  [/falafel|hummus|manakish|arabic|lebanese/, 'photo-1593001874117-c99c800e3eb7'],
  [/seafood|fish|prawn|shrimp/, 'photo-1559737558-2f5a35f4523b'],
];

const DEFAULT_ID = 'photo-1504674900247-0877df9cc836';

export function isStock(url) {
  return typeof url === 'string' && url.startsWith(STOCK);
}

export function foodImage(pick) {
  for (const candidate of [pick?.image_url, pick?.screenshot_url]) {
    if (typeof candidate === 'string' && /^https?:\/\//.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  const query = `${pick?.name || ''} ${pick?.restaurant || pick?.retailer || ''}`.toLowerCase();
  const hit = KEYWORDS.find(([pattern]) => pattern.test(query));
  return `${STOCK}${hit ? hit[1] : DEFAULT_ID}?auto=format&fit=crop&w=640&q=80`;
}
