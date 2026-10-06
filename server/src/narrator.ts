// AI Squad Narrator — generates a fun, personalized "why this plan works"
// story for the squad. Uses NVIDIA Nemotron via Nebius when NEBIUS_API_KEY
// is set; otherwise a smart template. Makes demos memorable.

import type { TasteHit } from "./qloo.js";
import type { TasteDNA } from "./qloo.js";
import type { Vote } from "./store.js";

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

// ---------- Consensus narrator ----------
// Explains what the squad's votes ACTUALLY say — including honest trade-offs
// when votes are split. Rule-based over real vote data; Nebius (when
// configured) only rewords, never invents. No fake consensus, ever.

export interface ConsensusNarrative {
  text: string;
  /** true only if Nebius successfully reworded the rule-based draft */
  ai: boolean;
}

export interface ConsensusPicks {
  movie?: string;
  restaurant?: string;
  music?: string;
}

function pickName(n?: string): string {
  return (n ?? "").replace(/^\[MOCK\]\s*/, "").trim();
}

function names(list: string[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function ruleBasedConsensus(votes: Vote[], picks: ConsensusPicks): string {
  const lovers = votes.filter((v) => v.choice === "love").map((v) => v.member);
  const finers = votes.filter((v) => v.choice === "fine").map((v) => v.member);
  const vetoers = votes.filter((v) => v.choice === "veto").map((v) => v.member);
  const total = votes.length;
  const r = pickName(picks.restaurant) || "dinner";
  const m = pickName(picks.movie) || "a movie";
  const mu = pickName(picks.music) || "music";

  // Single vote — just report, don't declare anything.
  if (total === 1) {
    const v = votes[0];
    const word = v.choice === "love" ? "loves it 😍" : v.choice === "veto" ? "vetoed it 🚫" : "says it's fine 👍";
    return `🗳️ Only ${v.member} has voted so far — ${word}. Waiting on the rest of the squad before calling it.`;
  }

  // Veto on the table — the honest headline.
  if (vetoers.length > 0) {
    const lovePart =
      lovers.length > 0
        ? `${names(lovers)} ${lovers.length === 1 ? "is" : "are"} all in 😍`
        : "nobody's in love with it yet";
    return (
      `⚖️ Split squad: ${lovePart}, but ${names(vetoers)} hit veto 🚫. ` +
      `The plan leans ${r} + ${m} — worth a 2-minute huddle before anyone commits. ` +
      `No fake consensus here: the veto stands until ${vetoers[0]} is convinced.`
    );
  }

  const lovePct = Math.round((lovers.length / total) * 100);

  // Clear majority love — genuine consensus.
  if (lovePct >= 60) {
    const finePart =
      finers.length > 0
        ? ` ${names(finers)} ${finers.length === 1 ? "says" : "say"} it's fine — no objections.`
        : "";
    return (
      `🎉 Full send — ${lovers.length}/${total} of the squad love this plan.${finePart} ` +
      `${r} → ${m} → ${mu}. No debates needed, just go.`
    );
  }

  // Dead tie between love and fine — name both sides.
  if (lovers.length > 0 && lovers.length === finers.length) {
    return (
      `⚖️ Dead tie — ${names(lovers)} love${lovers.length === 1 ? "s" : ""} it, ${names(finers)} say${finers.length === 1 ? "s" : ""} fine. ` +
      `Nobody's vetoing, so it's genuinely 50/50: let ${lovers[0]} make the final call on ${r} and call it a night.`
    );
  }

  // Split: some love, some merely fine — name the trade-off.
  if (lovers.length > 0 && finers.length > 0) {
    return (
      `🤔 ${names(lovers)} love${lovers.length === 1 ? "s" : ""} this plan, ${names(finers)} think${finers.length === 1 ? "s" : ""} it's fine — ` +
      `nobody hates it, nobody's obsessed. Compromise: lead with ${r} (the crowd-pleaser) and keep ${m} as the flexible slot.`
    );
  }

  // All fine, no love, no veto.
  return (
    `👍 Nobody's in love, nobody's vetoing — ${total} × "fine". ` +
    `It's a safe plan: ${r} + ${m}. Good enough is good.`
  );
}

async function polishWithNebius(draft: string): Promise<string | null> {
  if (!NEBIUS_KEY) return null;
  try {
    const res = await fetch(`${NEBIUS_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NEBIUS_KEY}`,
      },
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        messages: [
          {
            role: "user",
            content:
              `Reword this squad vote summary into 1-2 punchy sentences. ` +
              `Keep ALL facts (names, vote counts, picks) EXACTLY the same — do not invent, drop, or soften any of them. ` +
              `Max 60 words. ONLY the reworded text, no preamble.\n\n${draft}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    return text.length >= 20 ? text.slice(0, 400) : null;
  } catch {
    return null;
  }
}

/**
 * Narrate what the votes say. Returns null when nobody has voted yet.
 * Rule-based draft is always the source of truth; Nebius only rewords.
 */
export async function narrateConsensus(
  votes: Vote[],
  picks: ConsensusPicks
): Promise<ConsensusNarrative | null> {
  if (!votes || votes.length === 0) return null;
  const draft = ruleBasedConsensus(votes, picks);
  const polished = await polishWithNebius(draft);
  if (polished) return { text: polished, ai: true };
  return { text: draft, ai: false };
}
