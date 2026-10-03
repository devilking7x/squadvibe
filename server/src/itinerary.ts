// AI Itinerary — turns Qloo picks into a "perfect evening" timeline.
// Uses NVIDIA Nemotron via Nebius (OpenAI-compatible) when NEBIUS_API_KEY is
// set; otherwise falls back to a smart template. Either way the frontend gets
// a timed narrative: dinner -> movie -> after-party playlist.

import type { TasteHit } from "./qloo.js";

export interface ItineraryStop {
  time: string;
  emoji: string;
  title: string;
  detail: string;
}

const NEBIUS_KEY = process.env.NEBIUS_API_KEY ?? "";
const NEBIUS_URL =
  process.env.NEBIUS_API_URL ?? "https://api.tokenfactory.nebius.com/v1";
const NEBIUS_MODEL =
  process.env.NEBIUS_MODEL ?? "nvidia/NVIDIA-Nemotron-Nano-9B-v2";

function cleanName(h: TasteHit): string {
  return h.name.replace(/^\[MOCK\]\s*/, "");
}

function templateItinerary(
  squadName: string,
  vibe: string,
  location: string,
  movie: TasteHit[],
  restaurant: TasteHit[],
  music: TasteHit[]
): ItineraryStop[] {
  const m = movie[0] ? cleanName(movie[0]) : "a great film";
  const r = restaurant[0] ? cleanName(restaurant[0]) : "a cozy dinner spot";
  const mu = music[0] ? cleanName(music[0]) : "a killer playlist";
  const where = location ? ` in ${location}` : "";
  const vibeLine: Record<string, string> = {
    chill: "low-key, no-rush night",
    party: "high-energy night out",
    cozy: "warm, intimate evening",
    adventure: "spontaneous adventure",
  };
  return [
    {
      time: "7:00 PM",
      emoji: "🍽️",
      title: `Dinner at ${r}`,
      detail: `Kick off your ${vibeLine[vibe] ?? "squad night"}${where} — the whole crew's taste says this spot hits.`,
    },
    {
      time: "9:15 PM",
      emoji: "🎬",
      title: `Watch: ${m}`,
      detail: `Qloo matched this to everyone's favorites — zero "boring yaar" complaints expected.`,
    },
    {
      time: "11:30 PM",
      emoji: "🎵",
      title: `After-party: ${mu}`,
      detail: `Ride-home / late-night playlist energy, tuned to the squad's combined music DNA.`,
    },
  ];
}

export async function buildItinerary(
  squadName: string,
  vibe: string,
  location: string,
  movie: TasteHit[],
  restaurant: TasteHit[],
  music: TasteHit[]
): Promise<{ stops: ItineraryStop[]; ai: boolean }> {
  const fallback = () =>
    ({ stops: templateItinerary(squadName, vibe, location, movie, restaurant, music), ai: false });

  if (!NEBIUS_KEY) return fallback();

  const picks = [
    `movies: ${movie.map(cleanName).join(", ") || "n/a"}`,
    `restaurants: ${restaurant.map(cleanName).join(", ") || "n/a"}`,
    `music: ${music.map(cleanName).join(", ") || "n/a"}`,
  ].join("\n");

  const prompt = `You are SquadVibe's evening planner. Squad "${squadName}" (${vibe} vibe${location ? ` in ${location}` : ""}) got these Qloo taste-matched picks:\n${picks}\n\nWrite a fun 3-stop evening itinerary as JSON: [{"time":"7:00 PM","emoji":"🍽️","title":"...","detail":"..."}]. Times realistic for an evening out. Titles use the pick names. Details are 1 playful line each, Roman Hindi+English mix is fine. ONLY JSON, no other text.`;

  try {
    const res = await fetch(`${NEBIUS_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NEBIUS_KEY}`,
      },
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return fallback();
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const json = raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1);
    const stops = JSON.parse(json) as ItineraryStop[];
    if (!Array.isArray(stops) || stops.length === 0) return fallback();
    return {
      stops: stops.slice(0, 4).map((s) => ({
        time: String(s.time ?? ""),
        emoji: String(s.emoji ?? "✨"),
        title: String(s.title ?? "").slice(0, 120),
        detail: String(s.detail ?? "").slice(0, 280),
      })),
      ai: true,
    };
  } catch {
    return fallback();
  }
}
