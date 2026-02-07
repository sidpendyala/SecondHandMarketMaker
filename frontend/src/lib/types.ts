// API Response types

export interface DealItem {
  title: string;
  price: number;
  image: string;
  url: string;
  status: string;
  discount_pct: number;
  fair_value: number;
  flip_profit: number;
  flip_roi: number;
  condition_rating: number | null;
  condition_label: string | null;
  condition_notes: string | null;
  condition_adjusted_discount: number | null;
  condition_flag: "top_pick" | "fair_warning" | null;
}

export interface FilteredItem {
  title: string;
  price: number;
  url: string;
  image: string;
  reason: string;
  filter_type: "scam" | "mismatch" | "poor_condition";
}

export interface AnalyzeResponse {
  query: string;
  fair_value: number;
  mean_price: number;
  min_price: number;
  max_price: number;
  sample_size: number;
  std_dev: number;
  confidence: "high" | "medium" | "low";
  deals: DealItem[];
  total_active: number;
  deals_eliminated: number;
  filtered_items: FilteredItem[];
  /** Lowest "New" condition listing price (if still sold new) — reference for what a new one costs */
  manufacturer_price?: number | null;
}

export interface PriceTier {
  name: string;
  list_price: number;
  ebay_fee: number;
  shipping: number;
  net_payout: number;
}

export interface SellAdvisorResponse {
  query: string;
  fair_value: number;
  mean_price: number;
  min_price: number;
  max_price: number;
  sample_size: number;
  std_dev: number;
  confidence: "high" | "medium" | "low";
  tiers: PriceTier[];
  recommended_tier: string | null;
}

export interface ConditionResponse {
  analysis: string;
  source: "ai" | "mock";
}

export interface ConditionResult {
  rating: number;
  label: string;
  notes: string;
  source?: "ai" | "gemini" | "mock";
  detected_product?: string;
  detected_attributes?: Record<string, string>;
}

export interface ProductField {
  name: string;
  key: string;
  type: "select" | "boolean";
  options: string[];
}

export interface ProductFieldsResponse {
  query: string;
  fields: ProductField[];
}

export interface RefinementResponse {
  query: string;
  needs_refinement: boolean;
  fields: ProductField[];
}
