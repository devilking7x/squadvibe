// SquadVibe API client
// Real web intel for a venue pick — present ONLY when Tavily enrichment
// ran (TAVILY_API_KEY set). Absent otherwise; never fabricated.
export interface VenueEnrichment {
  snippets: string[];
  source: string;
}

export interface TasteHit {
  name: string;
  entityId: string;
  category: string;
  description: string;
  popularity: number;
  matchedFavorites?: string[];
  vibeScore?: number;
  enrichment?: VenueEnrichment;
}

export interface ItineraryStop {
  time: string;
  emoji: string;
  title: string;
  detail: string;
}

export interface TasteDNA {
  categories: Array<{ key: string; emoji: string; label: string; percent: number }>;
  members: Array<{ name: string; topCategory: string; favorites: number }>;
  totalFavorites: number;
}

export interface PlanVariant {
  label: string;
  desc: string;
  movie: TasteHit[];
  restaurant: TasteHit[];
  music: TasteHit[];
}

export interface PlanResult {
  plan: Plan;
  variants?: { consensus: PlanVariant; gems: PlanVariant; wildcard: PlanVariant };
  itinerary: ItineraryStop[];
  itineraryAI: boolean;
  tasteDNA: TasteDNA;
  narrative?: string;
  narrativeAI?: boolean;
  qloo: string;
  engine?: string;
  members: number;
}

export interface ConsensusNarrative {
  text: string;
  ai: boolean;
}

export interface VoteTally {
  tally: Record<string, number>;
  votes: Array<{ member: string; choice: string; at: string }>;
  /** What the votes honestly say — null until the first vote. */
  consensus?: ConsensusNarrative | null;
}

export interface Member {
  name: string;
  favorites: string[];
  joinedAt: string;
}

export interface Squad {
  id: string;
  code: string;
  name: string;
  vibe: string;
  location: string;
  createdAt: string;
  members: Member[];
}

export interface Plan {
  movie: TasteHit[];
  restaurant: TasteHit[];
  music: TasteHit[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  health: () => req<{ ok: boolean; qloo: string }>("/api/health"),
  createSquad: (name: string, vibe: string, location: string) =>
    req<{ squad: Squad }>("/api/squads", {
      method: "POST",
      body: JSON.stringify({ name, vibe, location }),
    }),
  getSquad: (id: string) =>
    req<{ squad: Squad; qloo: string }>(`/api/squads/${encodeURIComponent(id)}`),
  addMember: (id: string, name: string, favorites: string[]) =>
    req<{ squad: Squad }>(`/api/squads/${encodeURIComponent(id)}/members`, {
      method: "POST",
      body: JSON.stringify({ name, favorites }),
    }),
  plan: (id: string) =>
    req<PlanResult>(
      `/api/squads/${encodeURIComponent(id)}/plan`,
      { method: "POST" }
    ),
  /** Saved plan (shareable, consistent). Throws 404 if not generated yet. */
  getPlan: (id: string) =>
    req<PlanResult>(`/api/squads/${encodeURIComponent(id)}/plan`),
  /** One-click demo squad for instant judge-friendly magic. */
  demo: () => req<{ squad: Squad }>("/api/demo", { method: "POST" }),
  /** Remove a member from the squad. */
  removeMember: (id: string, name: string) =>
    req<{ squad: Squad }>(
      `/api/squads/${encodeURIComponent(id)}/members/${encodeURIComponent(name)}`,
      { method: "DELETE" }
    ),
  /** Live squad room events (SSE). Returns a cleanup function. */
  stream: (id: string, onEvent: (ev: { type: string; member?: string; memberCount?: number; choice?: string; tally?: Record<string, number> }) => void) => {
    const es = new EventSource(`/api/squads/${encodeURIComponent(id)}/stream`);
    es.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  },
  /** Cast a vote on the current plan. */
  vote: (id: string, member: string, choice: string) =>
    req<VoteTally>(`/api/squads/${encodeURIComponent(id)}/votes`, {
      method: "POST",
      body: JSON.stringify({ member, choice }),
    }),
  /** Get current votes. */
  getVotes: (id: string) =>
    req<VoteTally>(`/api/squads/${encodeURIComponent(id)}/votes`),
};
