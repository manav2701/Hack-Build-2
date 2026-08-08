/**
 * The picture on a verdict card.
 *
 * Order of preference, most truthful first:
 *   1. `image_url` from the backend — the dish photo the menu page published, or the
 *      order page's own og:image (apps/api/app/services/imagery.py).
 *   2. `screenshot_url` — a context.dev capture of the order page.
 *   3. keyword artwork chosen from the dish name.
 *
 * Layer 3 is decoration, not evidence: it is a stock photo of *that kind of food*, not
 * of that restaurant's plate. `isStockImage` exists so the card can label it as such —
 * a card that looks photographic but isn't is the same class of lie as an invented
 * price, and this project does not tell those.
 */

const STOCK = 'https://images.unsplash.com/';

const KEYWORD_IMAGES: Array<[RegExp, string]> = [
  [/wrap|cigkofte|shawarma|kebab|doner|shish/, 'photo-1626700051175-6818013e1d4f'],
  [/wonton|dumpling|dim sum|bao|gyoza|momo/, 'photo-1496116218417-1a781b1c416c'],
  [/biryani|pulao|mandi|kabsa|rice/, 'photo-1563379091339-03b21ab4a4f8'],
  [/burger|smash|patty|slider/, 'photo-1568901346375-23c9450c58cd'],
  [/taco|burrito|quesadilla|nacho|mexican/, 'photo-1565299585323-38d6b0865b47'],
  [/sushi|sashimi|maki|nigiri|poke/, 'photo-1579871494447-9811cf80d66c'],
  [/pizza|calzone|margherita/, 'photo-1513104890138-7c749659a591'],
  [/pasta|noodle|ramen|spaghetti|penne|linguine/, 'photo-1551183053-bf91a1d81141'],
  [/salad|bowl|healthy|green|vegan|quinoa/, 'photo-1540420773420-3366772f4999'],
  [/curry|masala|tikka|korma|dal/, 'photo-1585937421612-70a008356fbe'],
  [/steak|grill|bbq|ribs|brisket/, 'photo-1546833999-b9f581a1996d'],
  [/chicken|wings|fried|nugget|broast/, 'photo-1562967914-608f82629710'],
  [/breakfast|pancake|waffle|egg|brunch/, 'photo-1533089860892-a7c6f0a88666'],
  [/dessert|cake|chocolate|ice cream|kunafa|baklava/, 'photo-1551024506-0bccd828d307'],
  [/coffee|latte|cappuccino|karak|tea/, 'photo-1509042239860-f550ce710b93'],
  [/sandwich|sub|panini|club/, 'photo-1553909489-cd47e0907980'],
  [/soup|broth|pho|shorba/, 'photo-1547592166-23ac45744acd'],
  [/falafel|hummus|shawarma|manakish|arabic|lebanese/, 'photo-1593001874117-c99c800e3eb7'],
  [/seafood|fish|prawn|shrimp|crab|lobster/, 'photo-1559737558-2f5a35f4523b'],
];

const DEFAULT_IMAGE = 'photo-1504674900247-0877df9cc836';

function unsplash(id: string, width = 900): string {
  return `${STOCK}${id}?auto=format&fit=crop&w=${width}&q=80`;
}

/** True when `url` is our own keyword artwork rather than a real capture of the offer. */
export function isStockImage(url: string | null | undefined): boolean {
  return !!url && url.startsWith(STOCK);
}

export interface ImageSources {
  image_url?: string | null;
  screenshot_url?: string | null;
}

/**
 * The best available image for a pick. Never returns empty — the last resort is
 * labelled artwork, which `isStockImage` identifies.
 */
export function getFoodImage(
  name: string = '',
  restaurant: string = '',
  sources: ImageSources | string | null = null
): string {
  // Tolerates the old `(name, restaurant, rawUrl)` call shape as well as a source object.
  const provided =
    typeof sources === 'string'
      ? { image_url: sources }
      : (sources || {});

  for (const candidate of [provided.image_url, provided.screenshot_url]) {
    if (candidate && /^https?:\/\//.test(candidate.trim())) return candidate.trim();
  }

  const query = `${name} ${restaurant}`.toLowerCase();
  for (const [pattern, id] of KEYWORD_IMAGES) {
    if (pattern.test(query)) return unsplash(id);
  }
  return unsplash(DEFAULT_IMAGE);
}

/** Same ladder, for a small avatar-sized frame (history rows, extension list). */
export function getFoodThumb(
  name: string = '',
  restaurant: string = '',
  sources: ImageSources | string | null = null
): string {
  const full = getFoodImage(name, restaurant, sources);
  return isStockImage(full) ? full.replace('w=900', 'w=320') : full;
}
