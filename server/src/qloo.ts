// SquadVibe Qloo client — Taste Intelligence for group plans.
// QLOO_API_KEY from dashboard.qloo.com (never commit, never chat).
// QLOO_MOCK=1 -> canned [MOCK] results, no network (demo/testing).

const API_KEY = process.env.QLOO_API_KEY ?? "";
const MOCK = process.env.QLOO_MOCK === "1";
const BASE = (process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com/v2").replace(/\/+$/, "");

export interface TasteHit {
  name: string;
  entityId: string;
  category: string;
  description: string;
  popularity: number;
  /** which member favorites fed this pick (for "why this works" explanations) */
  matchedFavorites?: string[];
}

const URNS: Record<string, string> = {
  movie: "urn:entity:movie",
  restaurant: "urn:entity:place",
  music: "urn:entity:artist",
};

function headers(): Record<string, string> {
  return { "X-Api-Key": API_KEY, accept: "application/json" };
}

function mapEntity(e: Record<string, unknown>, category: string): TasteHit {
  const props = (e.properties ?? {}) as Record<string, unknown>;
  return {
    name: String(e.name ?? "Untitled"),
    entityId: String(e.entity_id ?? ""),
    category,
    description: String(
      props.short_description ?? props.description ?? ""
    ).slice(0, 280),
    popularity: typeof e.popularity === "number" ? e.popularity : 0,
  };
}

async function searchEntities(query: string, limit = 3): Promise<string[]> {
  const host = BASE.replace(/\/v2\/?$/, "");
  const res = await fetch(
    `${host}/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    { headers: headers(), signal: AbortSignal.timeout(20000) }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { entities?: Array<Record<string, unknown>> };
  };
  return (data.results?.entities ?? [])
    .map((e) => String(e.entity_id ?? ""))
    .filter(Boolean);
}

async function insights(
  category: string,
  signalIds: string[],
  location: string,
  limit: number
): Promise<TasteHit[]> {
  const body: Record<string, unknown> = {
    "filter.type": URNS[category],
    limit,
  };
  if (signalIds.length) body["signal.interests.entities"] = signalIds.join(",");
  if (location.trim()) body["filter.location.query"] = location.trim();
  const res = await fetch(`${BASE}/insights`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok)
    throw new Error(`Qloo insights ${res.status}`);
  const data = (await res.json()) as {
    results?: { entities?: Array<Record<string, unknown>> };
  };
  return (data.results?.entities ?? [])
    .slice(0, limit)
    .map((e) => mapEntity(e, category));
}

// --- Mock data (clearly labeled, never real) ---
const MOCK_PLAN: Record<string, TasteHit[]> = {
  movie: [
    { name: "[MOCK] Dune: Part Two", entityId: "m1", category: "movie", description: "[MOCK] Epic sci-fi that action fans and drama lovers both rate highly.", popularity: 0.98 },
    { name: "[MOCK] Spider-Man: Across the Spider-Verse", entityId: "m2", category: "movie", description: "[MOCK] Animation + heart + multiverse madness — crowd-pleaser.", popularity: 0.96 },
    { name: "[MOCK] The Grand Budapest Hotel", entityId: "m3", category: "movie", description: "[MOCK] Quirky, gorgeous, funny — the 'everyone agrees' pick.", popularity: 0.93 },
  ],
  restaurant: [
    { name: "[MOCK] The Midnight Diner", entityId: "r1", category: "restaurant", description: "[MOCK] Cozy spot with crowd-pleasing comfort food.", popularity: 0.91 },
    { name: "[MOCK] Spice Route Kitchen", entityId: "r2", category: "restaurant", description: "[MOCK] North Indian + Chinese — something for every palate.", popularity: 0.89 },
    { name: "[MOCK] Cafe Aaram", entityId: "r3", category: "restaurant", description: "[MOCK] Chill cafe, great for long squad addas.", popularity: 0.87 },
  ],
  music: [
    { name: "[MOCK] A. R. Rahman", entityId: "mu1", category: "music", description: "[MOCK] From soulful to party — bridges every music taste.", popularity: 0.97 },
    { name: "[MOCK] The Weeknd", entityId: "mu2", category: "music", description: "[MOCK] Global pop energy for the drive/after-party.", popularity: 0.94 },
    { name: "[MOCK] Prateek Kuhad", entityId: "mu3", category: "music", description: "[MOCK] Mellow indie for the chill part of the night.", popularity: 0.9 },
  ],
};

export function qlooReady(): boolean {
  return MOCK || API_KEY.length > 0;
}

export function qlooMode(): "mock" | "live" | "none" {
  if (MOCK) return "mock";
  return API_KEY ? "live" : "none";
}

/**
 * Core SquadVibe mechanic: resolve EVERY member's favorites to Qloo entity
 * ids, then ask Insights for picks matching the COMBINED taste — the
 * intersection the whole squad will love. matchedFavorites tracks which
 * inputs influenced each pick so the UI can explain "why this works".
 */
export async function squadPlan(
  favorites: { member: string; favorite: string }[],
  location: string,
  vibe: string
): Promise<{ movie: TasteHit[]; restaurant: TasteHit[]; music: TasteHit[] }> {
  if (MOCK) {
    const tag = (h: TasteHit): TasteHit => ({
      ...h,
      matchedFavorites: favorites.slice(0, 3).map((f) => `${f.member}: ${f.favorite}`),
    });
    return {
      movie: MOCK_PLAN.movie.map(tag),
      restaurant: MOCK_PLAN.restaurant.map(tag),
      music: MOCK_PLAN.music.map(tag),
    };
  }
  if (!API_KEY) throw new Error("QLOO_API_KEY not configured");

  // 1. Resolve all favorites -> entity ids (parallel, keep member mapping)
  const resolved = await Promise.all(
    favorites.map(async (f) => ({
      ...f,
      ids: await searchEntities(f.favorite).catch(() => [] as string[]),
    }))
  );
  const allIds = [...new Set(resolved.flatMap((r) => r.ids))].slice(0, 20);

  // 2. Per-category insights over the combined signals = squad intersection
  const [movie, restaurant, music] = await Promise.all([
    insights("movie", allIds, "", 3).catch(() => [] as TasteHit[]),
    insights("restaurant", allIds, location, 3).catch(() => [] as TasteHit[]),
    insights("music", allIds, "", 3).catch(() => [] as TasteHit[]),
  ]);

  // 3. Tag each pick with contributing favorites (simple heuristic: all)
  const tag = (h: TasteHit): TasteHit => ({
    ...h,
    matchedFavorites: resolved
      .filter((r) => r.ids.length > 0)
      .slice(0, 4)
      .map((r) => `${r.member}: ${r.favorite}`),
  });
  void vibe;
  return {
    movie: movie.map(tag),
    restaurant: restaurant.map(tag),
    music: music.map(tag),
  };
}
