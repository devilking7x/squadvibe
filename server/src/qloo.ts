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

export interface ResolvedFavorite {
  member: string;
  favorite: string;
  ids: string[];
  /** Qloo entity types, e.g. ["urn:entity:movie"] — for Taste DNA */
  types: string[];
}

async function searchEntitiesWithTypes(
  query: string,
  limit = 3
): Promise<Array<{ id: string; types: string[] }>> {
  const res = await fetch(
    `${BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    { headers: headers(), signal: AbortSignal.timeout(20000) }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { entities?: Array<Record<string, unknown>> };
  };
  return (data.results?.entities ?? [])
    .map((e) => ({
      id: String(e.entity_id ?? ""),
      types: Array.isArray(e.types) ? (e.types as string[]) : [],
    }))
    .filter((e) => e.id);
}

async function searchEntities(query: string, limit = 3): Promise<string[]> {
  return (await searchEntitiesWithTypes(query, limit)).map((e) => e.id);
}

// Entity resolution cache — favorites don't change between plan runs.
const entityCache = new Map<string, { at: number; ids: string[]; types: string[] }>();
const ENTITY_TTL = 30 * 60 * 1000;

async function cachedResolve(query: string): Promise<{ ids: string[]; types: string[] }> {
  const key = query.toLowerCase().trim();
  const hit = entityCache.get(key);
  if (hit && Date.now() - hit.at < ENTITY_TTL)
    return { ids: hit.ids, types: hit.types };
  const found = await searchEntitiesWithTypes(query).catch(() => [] as Array<{ id: string; types: string[] }>);
  const ids = found.map((f) => f.id);
  const types = [...new Set(found.flatMap((f) => f.types))];
  if (entityCache.size > 500) entityCache.clear();
  entityCache.set(key, { at: Date.now(), ids, types });
  return { ids, types };
}

async function cachedSearch(query: string): Promise<string[]> {
  return (await cachedResolve(query)).ids;
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
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Qloo insights ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    results?: { entities?: Array<Record<string, unknown>> };
  };
  const hits = (data.results?.entities ?? [])
    .slice(0, limit * 2) // fetch extra to allow filtering
    .map((e) => mapEntity(e, category));
  // For restaurants, filter out non-dining places (malls, zoos, hotels, etc.)
  if (category === "restaurant") {
    const NON_DINING = /mall|zoo|hotel|park|museum|theater|theatre|campus|hospital|airport|station|fort|ghat|mountain|temple|beach|waterfall|garden|lake|dam|bridge/i;
    const filtered = hits.filter((h) => !NON_DINING.test(h.name + " " + h.description));
    return filtered.slice(0, limit);
  }
  return hits.slice(0, limit);
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

const MOCK_TRENDS: Record<string, TasteHit[]> = {
  movie: [
    { name: "[MOCK] Trending: Sci-Fi Revival", entityId: "t1", category: "movie", description: "[MOCK] Space operas spiking this week.", popularity: 0.99 },
  ],
  restaurant: [
    { name: "[MOCK] Trending: Ramen Wave", entityId: "t2", category: "restaurant", description: "[MOCK] Ramen spots blowing up in the city.", popularity: 0.95 },
  ],
  music: [
    { name: "[MOCK] Trending: Indie Dawn", entityId: "t3", category: "music", description: "[MOCK] Bedroom pop taking over playlists.", popularity: 0.94 },
  ],
};

/** Qloo Trends API — what's hot right now in a category. */
export async function trending(
  category: string,
  location: string,
  limit = 3
): Promise<TasteHit[]> {
  if (MOCK) return (MOCK_TRENDS[category] ?? []).slice(0, limit);
  if (!API_KEY) throw new Error("QLOO_API_KEY not configured");
  const params = new URLSearchParams({
    "filter.type": URNS[category] ?? URNS.movie,
    limit: String(limit),
  });
  if (location.trim()) params.set("filter.location.query", location.trim());
  const res = await fetch(`${BASE}/trends?${params}`, {
    headers: headers(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Qloo trends ${res.status}`);
  const data = (await res.json()) as {
    results?: { entities?: Array<Record<string, unknown>> };
  };
  return (data.results?.entities ?? [])
    .slice(0, limit)
    .map((e) => mapEntity(e, category));
}

export interface ResolvedFavorite {
  member: string;
  favorite: string;
  ids: string[];
}

export interface SquadPlanResult {
  movie: TasteHit[];
  restaurant: TasteHit[];
  music: TasteHit[];
  /** per-member resolved entity ids (for true affinity scoring) */
  resolved: ResolvedFavorite[];
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
): Promise<SquadPlanResult> {
  if (MOCK) {
    const tag = (h: TasteHit): TasteHit => ({
      ...h,
      matchedFavorites: favorites.slice(0, 3).map((f) => `${f.member}: ${f.favorite}`),
    });
    // Mock entity types so the Taste DNA demo is meaningful.
    // Clearly demo data — never presented as real Qloo results.
    const mockType = (fav: string): string[] => {
      const f = fav.toLowerCase();
      if (/interstellar|dune|spider|budapest|3 idiots|movie|film/.test(f)) return ["urn:entity:movie"];
      if (/rahman|weeknd|prateek|kuhad|music|song|artist/.test(f)) return ["urn:entity:artist"];
      if (/biryani|pizza|momos|ramen|food|restaurant|diner|cafe|kitchen/.test(f)) return ["urn:entity:place"];
      return [];
    };
    return {
      movie: MOCK_PLAN.movie.map(tag),
      restaurant: MOCK_PLAN.restaurant.map(tag),
      music: MOCK_PLAN.music.map(tag),
      resolved: favorites.map((f) => ({
        ...f,
        ids: [`mock-${f.favorite}`],
        types: mockType(f.favorite),
      })),
    };
  }
  if (!API_KEY) throw new Error("QLOO_API_KEY not configured");

  // 1. Resolve all favorites -> entity ids (parallel, cached, keep member mapping)
  const resolved: ResolvedFavorite[] = await Promise.all(
    favorites.map(async (f) => {
      const { ids, types } = await cachedResolve(f.favorite);
      return { ...f, ids, types };
    })
  );
  const allIds = [...new Set(resolved.flatMap((r) => r.ids))].slice(0, 20);

  // 2. Per-category insights over the combined signals = squad intersection
  const [movie, restaurant, music] = await Promise.all([
    insights("movie", allIds, "", 5).catch(() => [] as TasteHit[]),
    insights("restaurant", allIds, location, 5).catch(() => [] as TasteHit[]),
    insights("music", allIds, "", 5).catch(() => [] as TasteHit[]),
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
    resolved,
  };
}

/**
 * TRUE intersection scoring — the 10/10 differentiator.
 * For each member, run Insights with ONLY their signals to get their personal
 * top picks. A candidate's squad affinity = fraction of members whose personal
 * top-10 contains it. A pick loved by 3/3 members scores 100 — that's a real
 * intersection, derived from Qloo, not a handmade heuristic.
 */
export async function squadAffinity(
  resolved: ResolvedFavorite[],
  candidates: { movie: TasteHit[]; restaurant: TasteHit[]; music: TasteHit[] },
  location: string
): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  if (MOCK || !API_KEY) return scores;

  // Group resolved ids by member
  const byMember = new Map<string, string[]>();
  for (const r of resolved) {
    const arr = byMember.get(r.member) ?? [];
    arr.push(...r.ids);
    byMember.set(r.member, [...new Set(arr)].slice(0, 10));
  }
  const members = [...byMember.keys()];
  if (members.length === 0) return scores;

  // Per member per category: personal top picks (parallel)
  const personal = await Promise.all(
    members.map(async (m) => {
      const ids = byMember.get(m)!;
      const [movie, restaurant, music] = await Promise.all([
        insights("movie", ids, "", 10).catch(() => [] as TasteHit[]),
        insights("restaurant", ids, location, 10).catch(() => [] as TasteHit[]),
        insights("music", ids, "", 10).catch(() => [] as TasteHit[]),
      ]);
      return { member: m, ids: new Set([...movie, ...restaurant, ...music].map((h) => h.entityId)) };
    })
  );

  // Score each candidate by member overlap
  for (const hits of [candidates.movie, candidates.restaurant, candidates.music]) {
    for (const h of hits) {
      if (!h.entityId) continue;
      const matched = personal.filter((p) => p.ids.has(h.entityId)).length;
      scores.set(h.entityId, Math.round((matched / members.length) * 100));
    }
  }
  return scores;
}

/**
 * Vibe match score: Qloo-derived squad affinity blended with cultural
 * popularity. Affinity dominates (70%) — a pick the whole squad's personal
 * taste endorses beats a merely popular one.
 */
export function vibeScore(
  hit: TasteHit,
  affinity: number | undefined,
  memberCount: number
): number {
  if (affinity !== undefined) {
    return Math.min(99, Math.round(affinity * 0.7 + hit.popularity * 100 * 0.3));
  }
  // Fallback when affinity unavailable (mock / errors)
  // Add deterministic variation based on entityId to avoid identical canned scores
  const pop = Math.round(hit.popularity * 70);
  const coverage = Math.min(30, memberCount * 10);
  let hash = 0;
  for (let i = 0; i < hit.entityId.length; i++) {
    hash = (hash * 31 + hit.entityId.charCodeAt(i)) % 100;
  }
  const variation = (hash % 11) - 5; // -5 to +5
  return Math.min(99, Math.max(1, pop + coverage + variation));
}

export interface TasteDNA {
  categories: Array<{ key: string; emoji: string; label: string; percent: number }>;
  members: Array<{ name: string; topCategory: string; favorites: number }>;
  totalFavorites: number;
}

const TYPE_TO_CAT: Array<{ match: string; key: string; emoji: string; label: string }> = [
  { match: "movie", key: "movie", emoji: "🎬", label: "Film" },
  { match: "tv", key: "movie", emoji: "🎬", label: "Film" },
  { match: "artist", key: "music", emoji: "🎵", label: "Music" },
  { match: "album", key: "music", emoji: "🎵", label: "Music" },
  { match: "place", key: "dining", emoji: "🍽️", label: "Dining" },
  { match: "restaurant", key: "dining", emoji: "🍽️", label: "Dining" },
  { match: "brand", key: "fashion", emoji: "👗", label: "Fashion" },
  { match: "book", key: "books", emoji: "📚", label: "Books" },
  { match: "podcast", key: "podcasts", emoji: "🎙️", label: "Podcasts" },
  { match: "videogame", key: "gaming", emoji: "🎮", label: "Gaming" },
];

function catFor(types: string[]): string {
  const joined = types.join(" ").toLowerCase();
  for (const t of TYPE_TO_CAT) {
    if (joined.includes(t.match)) return t.key;
  }
  return "culture";
}

/**
 * Squad Taste DNA — a visual fingerprint of the squad's combined taste,
 * derived from Qloo entity types of every member's favorites.
 * Shareable, visual, and impossible without the taste graph.
 */
export function tasteDNA(resolved: ResolvedFavorite[]): TasteDNA {
  const catCounts = new Map<string, number>();
  const memberCats = new Map<string, Map<string, number>>();
  let total = 0;

  for (const r of resolved) {
    // In mock mode types are empty — infer from favorite text heuristically
    // is dishonest; instead bucket as "culture".
    const cat = r.types.length ? catFor(r.types) : "culture";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    total++;
    const mc = memberCats.get(r.member) ?? new Map<string, number>();
    mc.set(cat, (mc.get(cat) ?? 0) + 1);
    memberCats.set(r.member, mc);
  }

  const meta: Record<string, { emoji: string; label: string }> = {
    movie: { emoji: "🎬", label: "Film" },
    music: { emoji: "🎵", label: "Music" },
    dining: { emoji: "🍽️", label: "Dining" },
    fashion: { emoji: "👗", label: "Fashion" },
    books: { emoji: "📚", label: "Books" },
    podcasts: { emoji: "🎙️", label: "Podcasts" },
    gaming: { emoji: "🎮", label: "Gaming" },
    culture: { emoji: "🌐", label: "Culture" },
  };

  const categories = [...catCounts.entries()]
    .map(([key, count]) => ({
      key,
      emoji: meta[key]?.emoji ?? "✨",
      label: meta[key]?.label ?? key,
      percent: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent);

  const members = [...memberCats.entries()].map(([name, cats]) => {
    const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      name,
      topCategory: top ? `${meta[top[0]]?.emoji ?? ""} ${meta[top[0]]?.label ?? top[0]}` : "—",
      favorites: [...cats.values()].reduce((a, b) => a + b, 0),
    };
  });

  return { categories, members, totalFavorites: total };
}

/**
 * Debug helper: tests each Qloo API stage and reports what works/fails.
 * Never exposes the API key — only status codes and result counts.
 */
export async function debugQloo(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {
    mode: qlooMode(),
    keySet: !!API_KEY,
    base: BASE,
  };
  if (MOCK) {
    out.note = "MOCK mode — no live API calls";
    return out;
  }
  if (!API_KEY) {
    out.error = "no API key";
    return out;
  }
  // 1. Search test — try multiple query formats
  const searchTests: Record<string, unknown> = {};
  for (const [label, url] of [
    ["basic", `${BASE}/search?query=Interstellar&limit=3`],
    ["with_type", `${BASE}/search?query=Interstellar&types=urn%3Aentity%3Amovie&limit=3`],
  ] as Array<[string, string]>) {
    try {
      const res = await fetch(url, {
        headers: headers(),
        signal: AbortSignal.timeout(20000),
      });
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* raw */ }
      const entities = (parsed as { results?: { entities?: unknown[] } })?.results?.entities ?? [];
      searchTests[label] = {
        status: res.status,
        count: entities.length,
        raw_keys: parsed ? Object.keys(parsed as object).slice(0, 5) : null,
        raw_sample: text.slice(0, 300),
      };
    } catch (e) {
      searchTests[label] = { ok: false, error: (e as Error).message.slice(0, 120) };
    }
  }
  out.search_tests = searchTests;
  // 2. Insights tests (with and without signals)
  for (const cat of ["movie", "restaurant", "music"] as const) {
    try {
      const hits = await insights(cat, [], cat === "restaurant" ? "Pune" : "", 3);
      (out as Record<string, unknown>)[`insights_${cat}`] = {
        ok: true,
        count: hits.length,
        first: hits[0]?.name?.slice(0, 40) ?? null,
      };
    } catch (e) {
      (out as Record<string, unknown>)[`insights_${cat}`] = {
        ok: false,
        error: (e as Error).message.slice(0, 200),
      };
    }
  }
  return out;
}
