// AI Squad Narrator — generates a fun, personalized "why this plan works"
// story for the squad. Uses NVIDIA Nemotron via Nebius when NEBIUS_API_KEY
// is set; otherwise a smart template. Makes demos memorable.

import type { TasteHit } from "./qloo.js";
import type { TasteDNA } from "./qloo.js";

const NEBIUS_KEY = process.env.NEBIUS_API_KEY ?? "";
const NEBIUS_URL =
  process.env.NEBIUS_API_URL ?? "https://api.tokenfactory.nebius.com/v1";
const NEBIUS_MODEL =
  process.env.NEBIUS_MODEL ?? "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";

function cleanName(h: TasteHit): string {
  return h.name.replace(/^\[MOCK\]\s*/, "");
}

function templateNarrative(
  squadName: string,
  memberNames: string[],
  movie: TasteHit[],
  restaurant: TasteHit[],
  music: TasteHit[],
  dna: TasteDNA | null
): string {
  const m = movie[0] ? cleanName(movie[0]) : "a great film";
  const r = restaurant[0] ? cleanName(restaurant[0]) : "a cozy dinner spot";
  const mu = music[0] ? cleanName(music[0]) : "a killer playlist";
  const crew = memberNames.length > 0 ? memberNames.join(", ") : "the crew";
  const topCat = dna?.categories?.[0]?.label ?? "great taste";
  return (
    `Here's the thing about ${crew} — Qloo looked at everyone's favorites and found the overlap nobody expected. ` +
    `Dinner at ${r}, then ${m}, closing the night with ${mu}. ` +
    `Your squad's DNA screams "${topCat}" and this plan hits it dead-on. No debates, no "tum decide karo" — just go. 🎉`
  );
}

export async function narratePlan(
  squadName: string,
  memberNames: string[],
  movie: TasteHit[],
  restaurant: TasteHit[],
  music: TasteHit[],
  dna: TasteDNA | null,
  vibe: string
): Promise<{ narrative: string; ai: boolean }> {
  const fallback = () => ({
    narrative: templateNarrative(squadName, memberNames, movie, restaurant, music, dna),
    ai: false,
  });
  if (!NEBIUS_KEY) return fallback();

  const picks = [
    `movies: ${movie.map(cleanName).slice(0, 3).join(", ") || "n/a"}`,
    `restaurants: ${restaurant.map(cleanName).slice(0, 3).join(", ") || "n/a"}`,
    `music: ${music.map(cleanName).slice(0, 3).join(", ") || "n/a"}`,
  ].join("\n");
  const members = memberNames.join(", ") || "the squad";

  const prompt =
    `You are SquadVibe's hype narrator. Squad "${squadName}" (${members}, ${vibe} vibe) got these Qloo taste-matched picks:\n${picks}\n\n` +
    `Write a fun 3-4 sentence "why this plan is perfect for YOUR squad" story. ` +
    `Mention 1-2 member names naturally. Playful tone, Roman Hindi + English mix is welcome (like "scene set hai"). ` +
    `No bullet points, just flowing text. Max 80 words. ONLY the story, no preamble.`;

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
        max_tokens: 250,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return fallback();
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (text.length < 20) return fallback();
    return { narrative: text.slice(0, 600), ai: true };
  } catch {
    return fallback();
  }
}
