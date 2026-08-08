export type Category = 'laptop' | 'vacuum' | 'headphones';

export interface Offer {
  title: string;
  price_aed: number;
  retailer: 'noon' | 'amazon_ae' | 'sharaf_dg' | 'other';
  url: string;
  in_stock?: boolean;
}

export interface SourceResult {
  source: 'marketplace' | 'reviews' | 'community' | 'warranty';
  status: 'ok' | 'partial' | 'failed';
  facts: string[];
  offers?: Offer[];
  citations?: string[];
  latency_ms?: number;
  error?: string;
}

export interface Recommendation {
  name: string;
  price_aed: number;
  retailer: string;
  url: string;
  why: string[];
  watch_outs: string[];
  warranty_note?: string;
}

export interface Verdict {
  pick: Recommendation;
  runner_up: Recommendation;
  price_note: string;
  confidence: 'high' | 'medium' | 'low';
  sources_used: string[];
  spoken_summary: string;
}
