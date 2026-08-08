export type Category = 'laptop' | 'vacuum' | 'headphones';

export interface Offer {
  title: string;
  price_aed: number;
  retailer: 'noon' | 'amazon_ae' | 'sharaf_dg' | 'other';
  url: string;
  in_stock?: boolean;
}

export interface SourceResult {
  source: 'marketplace' | 'reviews' | 'community' | 'warranty' | 'delivery_app' | 'restaurant_reviews';
  status: 'ok' | 'partial' | 'failed';
  facts: string[];
  offers?: Offer[];
  citations?: string[];
  latency_ms?: number;
  error?: string;
}

/** A real customer review body. Only Zomato/TripAdvisor supply these — the delivery
 *  apps expose an aggregate rating number and no text at all. */
export interface RestaurantReview {
  source: 'zomato' | 'tripadvisor' | 'other';
  author?: string | null;
  rating?: number | null;
  text: string;
  date?: string | null;
  url: string;
}

/** Legacy shopping pick — kept so the original product flow still type-checks. */
export interface Recommendation {
  name: string;
  price_aed: number;
  retailer: string;
  url: string;
  why: string[];
  watch_outs: string[];
  warranty_note?: string | null;
  image_url?: string | null;
  tags?: string[];
}

/**
 * The food pick.
 *
 * Every optional field really can be null — a menu page may not print an address, an
 * app may not publish a fee, and no review may be attributable. Render an em dash
 * rather than inventing a value.
 */
export interface DishRecommendation {
  name: string;              // the dish as listed on the menu
  restaurant: string;
  address?: string | null;
  price_aed: number;
  app: string;               // talabat | deliveroo | eateasy | noon_food
  url: string;               // deep link -> open_order_page
  why: string[];
  watch_outs: string[];
  rating?: number | null;
  review_count?: number | null;
  authenticity_note?: string | null;
  top_review?: RestaurantReview | null;
  /** The app's PUBLISHED estimate, never the user's checkout total. */
  delivery_estimate?: string | null;
  screenshot_url?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  tags?: string[];
}

export type Pick = DishRecommendation | Recommendation;

export function isDish(pick: Pick): pick is DishRecommendation {
  return (pick as DishRecommendation).restaurant !== undefined;
}

export interface Verdict {
  pick: Pick;
  /** Null when only one place carried the dish. */
  runner_up?: Pick | null;
  price_note: string;
  confidence: 'high' | 'medium' | 'low';
  sources_used: string[];
  /** True -> the UI MUST show a "sample data" badge. Never present fixtures as live. */
  is_fixture?: boolean;
  spoken_summary: string;
  status?: 'running' | 'done';
  job_id?: string;
}
