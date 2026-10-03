// SquadVibe API client
export interface TasteHit {
  name: string;
  entityId: string;
  category: string;
  description: string;
  popularity: number;
  matchedFavorites?: string[];
  vibeScore?: number;
}

export interface ItineraryStop {
  time: string;
  emoji: string;
  title: string;
  detail: string;
}

export interface PlanResult {
  plan: Plan;
  trendingTwist: { movie: TasteHit | null; restaurant: TasteHit | null; music: TasteHit | null };
  itinerary: ItineraryStop[];
  itineraryAI: boolean;
  qloo: string;
  members: number;
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
  /** Live squad room events (SSE). Returns a cleanup function. */
  stream: (id: string, onEvent: (ev: { type: string; member?: string; memberCount?: number }) => void) => {
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
};
