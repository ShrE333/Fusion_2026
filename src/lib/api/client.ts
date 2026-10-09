import { config } from "@/lib/config";
import type { SearchResponse } from "@/types/geo";

/** Contract awaiting backend confirmation. No successful responses are fabricated. */
export async function searchAtlas(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  if (!config.apiBaseUrl) throw new Error("Backend endpoint awaiting confirmation.");
  const response = await fetch(`${config.apiBaseUrl}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal });
  if (!response.ok) throw new Error(`Search request failed (${response.status}).`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) throw new Error("Backend response does not match the pending search contract.");
  return data as SearchResponse;
}
