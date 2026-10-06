// Web-enriched venue cards — real-world intel for Qloo's picks.
// Uses Tavily Search API when TAVILY_API_KEY is set. No key (or any API
// failure) -> returns an empty map and the plan works EXACTLY as before.
// Enrichment is never fabricated: snippets come only from real API responses.

const TAVILY_KEY = process.env.TAVILY_API_KEY ?? "";
const TAVILY_URL = "https://api.tavily.com/search";
const FETCH_TIMEOUT_MS = 8000;
const MAX_RESULTS_PER_VENUE = 2;

export interface VenueEnrichment {
  snippets: string[];
  /** always "tavily" — the single honest source */
  source: "tavily";
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

function cleanSnippet(r: TavilyResult): string | null {
  const title = (r.title ?? "").trim();
  const content = (r.content ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  if (!title && !content) return null;
  const text = title && content ? `${title} — ${content}` : title || content;
  return text.length > 200 ? text.slice(0, 200) + "…" : text;
}

async function searchVenue(
  name: string,
  location: string
): Promise<VenueEnrichment | null> {
  const cleanName = name.replace(/^\[MOCK\]\s*/, "").trim();
  if (!cleanName) return null;
  const query = location.trim()
    ? `${cleanName} ${location.trim()} restaurant reviews hours`
    : `${cleanName} restaurant reviews hours`;
  try {
    const res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: "basic",
        max_results: MAX_RESULTS_PER_VENUE,
        include_answer: false,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: TavilyResult[] };
    const snippets = (data.results ?? [])
      .map(cleanSnippet)
      .filter((s): s is string => !!s)
      .slice(0, MAX_RESULTS_PER_VENUE);
    if (snippets.length === 0) return null;
    return { snippets, source: "tavily" };
  } catch {
    return null; // network/timeout -> venue simply stays unenriched
  }
}

/**
 * Enrich up to `maxVenues` venues with real web snippets.
 * Keyed by entityId. Never throws; failures yield an empty/absent entry.
 */
export async function enrichVenues(
  venues: Array<{ entityId: string; name: string }>,
  location: string,
  maxVenues = 3
): Promise<Map<string, VenueEnrichment>> {
  const out = new Map<string, VenueEnrichment>();
  if (!TAVILY_KEY) return out; // no key -> no enrichment, plan unchanged
  const targets = venues.filter((v) => v.entityId).slice(0, maxVenues);
  const results = await Promise.all(
    targets.map((v) => searchVenue(v.name, location))
  );
  targets.forEach((v, i) => {
    if (results[i]) out.set(v.entityId, results[i]!);
  });
  return out;
}
