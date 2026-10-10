// SquadVibe Qloo client — Taste Intelligence for group plans.
// QLOO_API_KEY from dashboard.qloo.com (never commit, never chat).
// QLOO_MOCK=1 -> canned [MOCK] results, no network (demo/testing).

const API_KEY = process.env.QLOO_API_KEY ?? "";
const MOCK = process.env.QLOO_MOCK === "1";
const BASE = (process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com/v2").replace(/\/+$/, "");

// Rate limiter: Qloo 429s on burst fan-out. Max 4 concurrent, 150ms between starts.
let active = 0;
const queue: Array<() => void> = [];
async function throttle<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((res) => queue.push(res));
  active++;
  try {
    await new Promise((r) => setTimeout(r, 150));
    return await fn();
  } finally {
    active--;
    const next = queue.shift();
    if (next) next();
  }
}

async function qlooFetch(url: string, timeoutMs = 20000): Promise<Response> {
  return throttle(() =>
    fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs) })
  );
}

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

/** Full taste profile of one Qloo entity, from Search API properties. */
export interface EntityTaste {
  id: string;
  name: string;
  types: string[];
  genres: string[];
  keywords: string[];
  popularity: number;
  description: string;
}

const norm = (s: string): string => s.toLowerCase().trim();

function pushStr(v: unknown, set: Set<string>): void {
  if (typeof v === "string" && v.trim()) set.add(norm(v));
}
function pushArr(v: unknown, set: Set<string>): void {
  if (Array.isArray(v)) for (const x of v) pushStr(x, set);
}

/** Extract taste signals from a Search entity's properties, per category. */
function extractTaste(
  e: Record<string, unknown>,
  category: "movie" | "music" | "restaurant"
): { genres: string[]; keywords: string[] } {
  const props = (e.properties ?? {}) as Record<string, unknown>;
  const genres = new Set<string>();
  const keywords = new Set<string>();
  if (category === "movie") {
    pushArr(props.genres, genres);
    pushArr(props.keywords, keywords);
  } else if (category === "music") {
    pushArr(props.genre_categories, genres);
    pushArr(props.cultural_genres, genres);
    pushArr(props.music_characteristics, keywords);
    pushArr(props.adjectives_for_performance_style, keywords);
  } else {
    pushStr(props.primary_genre, genres);
    const kw = props.keywords;
    if (Array.isArray(kw))
      for (const k of kw) pushStr((k as Record<string, unknown>).name, keywords);
    pushStr(props.good_for, keywords);
  }
  return { genres: [...genres], keywords: [...keywords] };
}

function categoryForTypes(types: string[]): "movie" | "music" | "restaurant" | null {
  const j = types.join(" ").toLowerCase();
  if (/(movie|tv_series|tv show)/.test(j)) return "movie";
  if (/(artist|album|track|music)/.test(j)) return "music";
  if (/(place|restaurant|dining)/.test(j)) return "restaurant";
  return null;
}

function toTaste(e: Record<string, unknown>): EntityTaste {
  const types: string[] = [];
  if (typeof e.type === "string") types.push(e.type);
  if (typeof e.subtype === "string") types.push(e.subtype);
  if (Array.isArray(e.types)) types.push(...(e.types as string[]));
  const uniq = [...new Set(types)];
  const cat = categoryForTypes(uniq) ?? "movie";
  const { genres, keywords } = extractTaste(e, cat);
  const props = (e.properties ?? {}) as Record<string, unknown>;
  return {
    id: String(e.entity_id ?? ""),
    name: String(e.name ?? "Untitled"),
    types: uniq,
    genres,
    keywords,
    popularity: typeof e.popularity === "number" ? e.popularity : 0,
    description: String(props.short_description ?? props.description ?? "").slice(0, 280),
  };
}

/** Search with full taste extraction. Literal matching — scoring happens later. */
async function searchDetailed(
  query: string,
  category: "movie" | "music" | "restaurant",
  limit = 12
): Promise<EntityTaste[]> {
  const params = new URLSearchParams({
    query,
    types: URNS[category],
    limit: String(limit),
  });
  const res = await qlooFetch(`${BASE}/search?${params}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).map(toTaste).filter((t) => t.id);
}

// Detailed taste cache — same TTL discipline as entityCache.
const tasteCache = new Map<string, { at: number; taste: EntityTaste[] }>();

async function cachedTaste(query: string): Promise<EntityTaste[]> {
  const key = query.toLowerCase().trim();
  const hit = tasteCache.get(key);
  if (hit && Date.now() - hit.at < ENTITY_TTL) return hit.taste;
  let taste: EntityTaste[] = [];
  try {
    const res = await qlooFetch(
      `${BASE}/search?query=${encodeURIComponent(query)}&limit=3`
    );
    if (res.ok) {
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      taste = (data.results ?? []).map(toTaste).filter((t) => t.id);
    }
  } catch {
    taste = [];
  }
  if (tasteCache.size > 500) tasteCache.clear();
  tasteCache.set(key, { at: Date.now(), taste });
  return taste;
}

function tasteHit(t: EntityTaste, category: string, matchedFavorites?: string[]): TasteHit {
  // Restaurants: filter out non-dining places (malls, zoos, hotels, etc.)
  return {
    name: t.name,
    entityId: t.id,
    category,
    description: t.description,
    popularity: t.popularity,
    matchedFavorites,
  };
}

const NON_DINING = /mall|zoo|hotel|park|museum|theater|theatre|campus|hospital|airport|station|fort|ghat|mountain|temple|beach|waterfall|garden|lake|dam|bridge|birthplace|memorial|monument|palace|church|mosque|shrine/i;

interface BlendInput {
  member: string;
  favorite: string;
  taste: EntityTaste;
  category: "movie" | "music" | "restaurant";
}

/**
 * Taste Blend — SquadVibe's Search-powered recommendation engine.
 *
 * The hackathon Insights endpoint returns 0 results for valid signals, so we
 * blend instead: resolve every favorite to Qloo taste data (genres, keywords,
 * popularity), build a per-category squad genre profile, generate candidates
 * by searching the squad's top genres, then score each candidate by
 * member coverage (fraction of members whose taste it touches) blended with
 * genre overlap and Qloo popularity. All entities, genres and popularity
 * scores are real Qloo data — the blending math is ours, and labeled as such.
 */
async function tasteBlend(
  favorites: { member: string; favorite: string }[],
  location: string
): Promise<SquadPlanResult> {
  // 1. Resolve every favorite -> detailed taste (parallel, cached).
  // Take the single best result per favorite: exact name match wins, then
  // highest popularity, preferring results with real taste data. Taking top-N
  // pollutes categories — e.g. there is an *artist* named "Interstellar"
  // alongside the film, and one named "Dune" too.
  const resolved: ResolvedFavorite[] = [];
  const inputs: BlendInput[] = [];
  await Promise.all(
    favorites.map(async (f) => {
      const details = await cachedTaste(f.favorite);
      const q = norm(f.favorite);
      const withTaste = details.filter((d) => d.genres.length + d.keywords.length > 0);
      const pool = withTaste.length ? withTaste : details;
      const richness = (t: EntityTaste): number => t.genres.length + t.keywords.length;
      const best = [...pool].sort((a, b) => {
        // Entities without types are useless (can't categorize) — sink them.
        const aTyped = a.types.length ? 0 : 1;
        const bTyped = b.types.length ? 0 : 1;
        if (aTyped !== bTyped) return aTyped - bTyped;
        const aExact = norm(a.name) === q ? 0 : 1;
        const bExact = norm(b.name) === q ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        // Richer taste data wins ties (movie Dune: 253 signals vs artist Dune: 3)
        const r = richness(b) - richness(a);
        return r !== 0 ? r : b.popularity - a.popularity;
      })[0];
      const r: ResolvedFavorite = { member: f.member, favorite: f.favorite, ids: [], types: [] };
      if (best) {
        r.ids.push(best.id);
        r.types.push(...best.types);
        const cat = categoryForTypes(best.types);
        if (cat) inputs.push({ member: f.member, favorite: f.favorite, taste: best, category: cat });
      }
      r.types = [...new Set(r.types)];
      resolved.push(r);
    })
  );

  // 2. Per category: profile -> candidates -> scored picks.
  // Sequential (not Promise.all): Qloo rate-limits burst fan-out.
  const out: SquadPlanResult = { movie: [], restaurant: [], music: [], resolved, engine: "blend" };
  for (const cat of ["movie", "restaurant", "music"] as const) {
    out[cat] = await blendCategory(
      cat,
      inputs.filter((i) => i.category === cat),
      location
    );
  }
  return out;
}

async function blendCategory(
  category: "movie" | "music" | "restaurant",
  catInputs: BlendInput[],
  location: string
): Promise<TasteHit[]> {
  // If no category-specific favorites, do a generic popular search —
  // NEVER blend other categories' taste (space movies ≠ space centers).
  if (!catInputs.length) {
    const fallbackQuery =
      category === "movie" ? "award winning film"
      : category === "music" ? "popular music"
      : location ? `best restaurants ${location.trim()}` : "popular restaurants";
    const cands = await searchDetailed(fallbackQuery, category, 10);
    return cands.slice(0, 5).map((c) => tasteHit(c, category));
  }
  const useInputs = catInputs;

  // Squad genre profile: genre -> how many favorites carry it.
  // CORE genres (shared by 2+ favorites, e.g. Sci-Fi for Interstellar+Dune)
  // are the strong signal; generic one-off genres (Drama) are weak.
  const genreCount = new Map<string, number>();
  for (const inp of useInputs)
    for (const g of inp.taste.genres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  const coreGenres = new Set(
    [...genreCount.entries()].filter(([, c]) => c > 1).map(([g]) => g)
  );
  const effectiveCore = coreGenres.size ? coreGenres : new Set(genreCount.keys());
  // Candidate-generation queries.
  // Shared keywords (2+ favorites, e.g. "space travel") are the strongest
  // thematic signal. Single-favorite keywords are noisy ("title directed by
  // male") — only use them for single-input categories, minus junk patterns.
  // Genres backstop everything ("sci-fi" as a query is weak, but harmless).
  const kwCount = new Map<string, number>();
  const JUNK_KW = /directed by|written by|^title\b|loss of |father|mother|\bson\b|daughter|husband|wife/i;
  for (const inp of useInputs)
    for (const k of inp.taste.keywords) {
      if (JUNK_KW.test(k)) continue; // "title directed by male" etc. are noise
      kwCount.set(k, (kwCount.get(k) ?? 0) + 1);
    }
  // Terms with source tracking: {term, member} — member=null means squad-wide.
  // This lets a candidate found via B's "sushi" query count as covering B,
  // even without keyword overlap (the query itself is the relevance signal).
  let termSources: Array<{ term: string; member: string | null }>;
  const sharedKw = [...kwCount.entries()].filter(([, c]) => c > 1);
  if (sharedKw.length) {
    termSources = sharedKw
      .sort((a, b) => b[1] - a[1] || b[0].split(/\s+/).length - a[0].split(/\s+/).length)
      .slice(0, 4)
      .map(([k]) => ({ term: k, member: null }));
  } else if (useInputs.length <= 1) {
    termSources = [...kwCount.keys()]
      .filter((k) => !JUNK_KW.test(k) && k.split(/\s+/).length <= 4)
      .slice(0, 4)
      .map((k) => ({ term: k, member: null }));
  } else {
    // Diverse squad: per-member terms, raw favorite text first.
    // Round-robin: every member gets their favorite as a query FIRST,
    // then keywords. (Promise.all resolves inputs in random order, so a
    // global cap would starve some members.)
    termSources = [];
    const seenTerms = new Set<string>();
    // Round 1: each member's favorite text
    for (const inp of useInputs) {
      if (inp.favorite.split(/\s+/).length <= 3 && !seenTerms.has(inp.favorite)) {
        seenTerms.add(inp.favorite);
        termSources.push({ term: inp.favorite, member: inp.member });
      }
    }
    // Round 2: keywords, round-robin per member
    const kwByMember = useInputs.map((inp) =>
      inp.taste.keywords.filter((k) => !JUNK_KW.test(k)).slice(0, 2)
    );
    let added = true;
    while (added && termSources.length < 6) {
      added = false;
      for (let i = 0; i < useInputs.length && termSources.length < 6; i++) {
        const kws = kwByMember[i];
        if (kws.length) {
          const k = kws.shift()!;
          if (!seenTerms.has(k)) {
            seenTerms.add(k);
            termSources.push({ term: k, member: useInputs[i].member });
            added = true;
          }
        }
      }
    }
  }
  // Genres backstop (squad-wide).
  for (const [g] of [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    if (!termSources.some((ts) => ts.term === g)) termSources.push({ term: g, member: null });
  }
  const topTerms = termSources.slice(0, 6);
  if (!topTerms.length)
    topTerms.push({
      term: category === "restaurant" ? location || "restaurant" : category,
      member: null,
    });

  const seen = new Map<string, EntityTaste>();
  const sourceMembers = new Map<string, Set<string>>(); // entityId -> members whose query found it
  const localHits = new Set<string>(); // entityId -> found via location-biased query
  const excludeIds = new Set(useInputs.map((i) => i.taste.id));
  const excludeNames = new Set(useInputs.map((i) => norm(i.taste.name)));
  await Promise.all(
    topTerms.map(async ({ term, member }, idx) => {
      let cands = await searchDetailed(term, category, 10);
      // Restaurants: bias top terms with location (not all — saves API calls)
      if (category === "restaurant" && location.trim() && idx < 2) {
        const loc = await searchDetailed(`${term} ${location.trim()}`, category, 8);
        for (const c of loc) localHits.add(c.id);
        cands = [...cands, ...loc];
      }
      for (const c of cands) {
        if (category === "restaurant" && NON_DINING.test(c.name + " " + c.description)) continue;
        // Music: skip generic single-word "artists" that are just genre names
        // ("Folk", "Rock") — junk entities, not real recommendations.
        if (category === "music" && /^[a-z]+$/i.test(c.name.trim()) && c.name.trim().length <= 12) {
          const w = norm(c.name);
          if (genreCount.has(w) || kwCount.has(w)) continue;
        }
        if (excludeIds.has(c.id) || excludeNames.has(norm(c.name))) continue;
        if (!seen.has(c.id)) seen.set(c.id, c);
        if (member) {
          const sm = sourceMembers.get(c.id) ?? new Set<string>();
          sm.add(member);
          sourceMembers.set(c.id, sm);
        }
      }
    })
  );

  // Score: member coverage (40%) + core-genre match (40%) + popularity (20%).
  // Quality gates: movies/music MUST share a core squad genre (kills literal
  // keyword noise like father-themed dramas for sci-fi fans); restaurants may
  // match on cuisine keywords instead.
  const members = [...new Set(useInputs.map((i) => i.member))];
  const tagsOf = (t: EntityTaste): Set<string> => new Set([...t.genres, ...t.keywords]);
  const scored = [...seen.values()].map((cand) => {
    const candTags = tagsOf(cand);
    const coveredMembers = new Set<string>();
    const matchedFav: string[] = [];
    // Query-source signal: found via this member's own query ("sushi" query
    // -> sushi places cover that member, even without keyword overlap).
    for (const m of sourceMembers.get(cand.id) ?? []) {
      coveredMembers.add(m);
      const inp = useInputs.find((u) => u.member === m);
      if (inp) {
        const label = `${m}: ${inp.favorite}`;
        if (!matchedFav.includes(label)) matchedFav.push(label);
      }
    }
    for (const inp of useInputs) {
      const inpTags = tagsOf(inp.taste);
      if ([...candTags].some((t) => inpTags.has(t))) {
        coveredMembers.add(inp.member);
        const label = `${inp.member}: ${inp.favorite}`;
        if (!matchedFav.includes(label)) matchedFav.push(label);
      }
    }
    const coverage = members.length ? coveredMembers.size / members.length : 0;
    let coreHits = 0;
    for (const g of cand.genres) if (effectiveCore.has(g)) coreHits++;
    const coreMatch = cand.genres.length ? coreHits / cand.genres.length : 0;
    let kwOverlap = 0;
    for (const k of cand.keywords) if (kwCount.has(k)) kwOverlap++;
    const keywordOverlap = cand.keywords.length ? kwOverlap / cand.keywords.length : 0;
    const fromQuery = (sourceMembers.get(cand.id)?.size ?? 0) > 0;
    // Restaurants: location-relevant picks get a bonus (a Mumbai biryani joint
    // beats a Polish Pizza Hut for a Mumbai squad).
    const localBonus = category === "restaurant" && localHits.has(cand.id) ? 0.15 : 0;
    const score = coverage * 0.4 + coreMatch * 0.4 + cand.popularity * 0.2 + localBonus;
    return { cand, score, coreMatch, keywordOverlap, fromQuery, matchedFav: matchedFav.slice(0, 4) };
  });
  scored.sort((a, b) => b.score - a.score);
  const gated = scored.filter((s) =>
    category === "restaurant"
      ? s.coreMatch > 0 || s.keywordOverlap > 0 || s.fromQuery
      : category === "music"
        ? s.coreMatch > 0 || s.fromQuery  // diverse artists: query-source counts
        : s.coreMatch > 0
  );
  if (process.env.BLEND_DEBUG) {
    console.log(`[blend:${category}] core=${[...effectiveCore].join(",")} terms=${topTerms.map((t) => t.term).join("|")} seen=${seen.size} gated=${gated.length}`);
  }
  // Diversity pass: every member deserves at least one pick in the top 5.
  // (A diverse squad's "intersection" is honest per-person representation,
  // not five copies of one member's taste.)
  const memberOf = (mf: string): string => mf.split(":")[0].trim();
  const top = gated.slice(0, 5);
  const covered = new Set<string>();
  for (const s of top) for (const mf of s.matchedFav) covered.add(memberOf(mf));
  for (const member of members) {
    if (covered.has(member)) continue;
    const best = gated.find((s) => s.matchedFav.some((mf) => memberOf(mf) === member));
    if (best && !top.includes(best)) {
      top[top.length - 1] = best;
      covered.add(member);
    }
  }
  top.sort((a, b) => b.score - a.score);
  return top.map((s) => tasteHit(s.cand, category, s.matchedFav));
}

async function searchEntitiesWithTypes(
  query: string,
  limit = 3
): Promise<Array<{ id: string; types: string[] }>> {
  const res = await qlooFetch(
    `${BASE}/search?query=${encodeURIComponent(query)}&limit=${limit}`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  return (data.results ?? [])
    .map((e) => {
      const types: string[] = [];
      if (typeof e.type === "string") types.push(e.type);
      if (typeof e.subtype === "string") types.push(e.subtype);
      if (Array.isArray(e.types)) types.push(...(e.types as string[]));
      return {
        id: String(e.entity_id ?? ""),
        types: [...new Set(types)],
      };
    })
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
  // Qloo hackathon API: GET with query-string params (not POST + JSON body),
  // and `take` (not `limit`) controls result count. Confirmed by Qloo Support.
  // NOTE: signal.interests.entities must use LITERAL commas, not %2C-encoded.
  // URLSearchParams encodes commas, so we build the entities param manually.
  const params = new URLSearchParams({
    "filter.type": URNS[category],
    take: String(limit * 2), // fetch extra to allow filtering
  });
  if (location.trim()) params.set("filter.location.query", location.trim());
  let queryString = params.toString();
  if (signalIds.length) {
    // Append with literal commas (not URL-encoded)
    const entitiesParam = `signal.interests.entities=${signalIds.join(",")}`;
    queryString = queryString ? `${queryString}&${entitiesParam}` : entitiesParam;
  }
  const res = await qlooFetch(`${BASE}/insights?${queryString}`, 30000);
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Qloo insights ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  const resultsArray = Array.isArray(data.results) ? data.results : [];
  const hits = resultsArray
    .slice(0, limit * 2) // fetch extra to allow filtering
    .map((e) => mapEntity(e, category));
  // For restaurants, filter out non-dining places (malls, zoos, hotels, etc.)
  if (category === "restaurant") {
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

/** Qloo Trends API — 404 on the hackathon endpoint; kept as a stub so the
 *  plan pipeline never throws. The "Hidden Gems" variant replaces it. */
export async function trending(
  category: string,
  location: string,
  limit = 3
): Promise<TasteHit[]> {
  void category;
  void location;
  void limit;
  if (MOCK) return (MOCK_TRENDS[category] ?? []).slice(0, limit);
  return [];
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
  /** which recommendation engine produced this plan */
  engine?: "insights" | "blend" | "mock";
}

/** Insights path — kept for when/if Qloo fixes the hackathon endpoint. */
async function squadPlanViaInsights(
  favorites: { member: string; favorite: string }[],
  location: string
): Promise<SquadPlanResult> {
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
  return {
    movie: movie.map(tag),
    restaurant: restaurant.map(tag),
    music: music.map(tag),
    resolved,
    engine: "insights",
  };
}

/**
 * Core SquadVibe mechanic: resolve EVERY member's favorites to Qloo taste
 * data, then find the intersection the whole squad will love.
 *
 * Tries Qloo Insights first; the hackathon endpoint currently returns 0
 * results for valid signals, so we fall back to the Taste Blend engine
 * (Search-powered, same Qloo taste data). matchedFavorites tracks which
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
      engine: "mock",
    };
  }
  if (!API_KEY) throw new Error("QLOO_API_KEY not configured");

  void vibe;
  // Taste Blend directly — the hackathon Insights endpoint returns 0 for
  // valid signals (verified Oct 2026). squadPlanViaInsights stays for when/if
  // Qloo fixes it; /api/debug/qloo monitors the endpoint.
  return tasteBlend(favorites, location);
}

/**
 * Squad affinity — the intersection score.
 * Derived from each pick's matchedFavorites (which member favorites share
 * taste tags with it): a pick touching 3/3 members scores 100. No extra API
 * calls — the blend engine already computed the taste overlap.
 */
export async function squadAffinity(
  resolved: ResolvedFavorite[],
  candidates: { movie: TasteHit[]; restaurant: TasteHit[]; music: TasteHit[] },
  location: string
): Promise<Map<string, number>> {
  void location;
  const scores = new Map<string, number>();
  const members = [...new Set(resolved.map((r) => r.member))];
  if (members.length === 0) return scores;
  const byLower = new Map(members.map((m) => [m.toLowerCase(), m]));

  for (const hits of [candidates.movie, candidates.restaurant, candidates.music]) {
    for (const h of hits) {
      if (!h.entityId) continue;
      const matched = new Set<string>();
      for (const mf of h.matchedFavorites ?? []) {
        const full = byLower.get(mf.split(":")[0].trim().toLowerCase());
        if (full) matched.add(full);
      }
      scores.set(h.entityId, Math.round((matched.size / members.length) * 100));
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
      const res = await qlooFetch(url);
      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* raw */ }
      const entities = (parsed as { results?: unknown[] })?.results ?? [];
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
  // 2. Taste Blend end-to-end: demo squad -> real picks (no Insights needed)
  try {
    const demoFavs = [
      { member: "A", favorite: "Interstellar" },
      { member: "B", favorite: "Dune" },
      { member: "A", favorite: "biryani" },
      { member: "B", favorite: "A.R. Rahman" },
    ];
    const t0 = Date.now();
    const plan = await tasteBlend(demoFavs, "Pune");
    const blendOut: Record<string, unknown> = {
      ok: true,
      engine: plan.engine,
      ms: Date.now() - t0,
      resolved: plan.resolved.map((r) => `${r.favorite}:${r.types.join("+")}`),
    };
    for (const cat of ["movie", "restaurant", "music"] as const) {
      const hits = plan[cat];
      blendOut[cat] = {
        count: hits.length,
        first: hits[0]?.name?.slice(0, 50) ?? null,
        affinity: hits[0]?.matchedFavorites?.length ?? 0,
      };
    }
    out.taste_blend = blendOut;
  } catch (e) {
    out.taste_blend = { ok: false, error: (e as Error).message.slice(0, 200) };
  }
  // 3. Insights status (known-broken on hackathon endpoint — informational)
  try {
    const demoFavs = ["Interstellar", "A.R. Rahman", "biryani"];
    const resolvedIds: string[] = [];
    for (const fav of demoFavs) {
      const r = await cachedResolve(fav);
      resolvedIds.push(...r.ids.slice(0, 2));
    }
    out.resolved_ids = { count: resolvedIds.length, sample: resolvedIds[0]?.slice(0, 8) ?? null };
    // Test insights WITH signals
    for (const cat of ["movie", "restaurant", "music"] as const) {
      try {
        const hits = await insights(cat, resolvedIds.slice(0, 10), cat === "restaurant" ? "Pune" : "", 3);
        (out as Record<string, unknown>)[`insights_${cat}_with_signals`] = {
          ok: true,
          count: hits.length,
          first: hits[0]?.name?.slice(0, 40) ?? null,
        };
      } catch (e) {
        (out as Record<string, unknown>)[`insights_${cat}_with_signals`] = {
          ok: false,
          error: (e as Error).message.slice(0, 200),
        };
      }
    }
  } catch (e) {
    out.resolve_error = (e as Error).message.slice(0, 120);
  }
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
