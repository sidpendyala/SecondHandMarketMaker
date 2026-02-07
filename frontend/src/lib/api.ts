import {
  AnalyzeResponse,
  SellAdvisorResponse,
  ConditionResponse,
  ConditionResult,
  ProductFieldsResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function analyzeProduct(query: string): Promise<AnalyzeResponse> {
  const res = await fetch(
    `${API_BASE}/api/market-maker?query=${encodeURIComponent(query)}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sellAdvisor(
  query: string,
  condition?: number,
  details?: Record<string, string>
): Promise<SellAdvisorResponse> {
  const res = await fetch(`${API_BASE}/api/sell-advisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, condition, details }),
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Sell analysis failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function uploadImage(file: File): Promise<ConditionResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/analyze-upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Image analysis failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getProductFields(
  query: string
): Promise<ProductFieldsResponse> {
  const res = await fetch(`${API_BASE}/api/product-fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Failed to generate fields" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function verifyCondition(
  imageUrl: string
): Promise<ConditionResponse> {
  const res = await fetch(`${API_BASE}/api/verify-condition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: "Condition check failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}
