// SquadVibe server — end group-plan fights with Qloo taste intelligence.
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { broadcast, subscribe } from "./events.js";
import { buildItinerary } from "./itinerary.js";
import { narratePlan } from "./narrator.js";
import {
  qlooMode,
  qlooReady,
  squadAffinity,
  squadPlan,
  tasteDNA,
  trending,
  vibeScore,
} from "./qloo.js";
import {
  addMember,
  castVote,
  createDemoSquad,
  createSquad,
  getSavedPlan,
  getSquad,
  getVotes,
  publicSquad,
  removeMember,
  savePlan,
} from "./store.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, qloo: qlooMode(), time: new Date().toISOString() });
});

// Create a squad plan session
app.post("/api/squads", (req, res) => {
  const { name, vibe, location } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const s = createSquad(name, String(vibe ?? "chill"), String(location ?? ""));
  res.json({ squad: publicSquad(s) });
});

// Get squad (by id or share code)
app.get("/api/squads/:id", (req, res) => {
  const s = getSquad(req.params.id);
  if (!s) {
    res.status(404).json({ error: "squad not found" });
    return;
  }
  res.json({ squad: publicSquad(s), qloo: qlooMode() });
});

// Live squad room — Server-Sent Events
app.get("/api/squads/:id/stream", (req, res) => {
  const s = getSquad(req.params.id);
  if (!s) {
    res.status(404).json({ error: "squad not found" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
  const unsub = subscribe(s.id, (ev) => {
    res.write(`data: ${JSON.stringify(ev)}\n\n`);
  });
  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
  }, 25000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsub();
  });
});

// Join squad: add/update a member's taste
app.post("/api/squads/:id/members", (req, res) => {
  const { name, favorites } = req.body ?? {};
  if (typeof name !== "string" || !Array.isArray(favorites)) {
    res.status(400).json({ error: "name and favorites[] are required" });
    return;
  }
  const s = addMember(req.params.id, name, favorites);
  if (!s) {
    res.status(404).json({ error: "squad not found or favorites empty" });
    return;
  }
  const member = s.members[s.members.length - 1];
  broadcast(s.id, {
    type: "member_joined",
    member: member.name,
    memberCount: s.members.length,
  });
  res.json({ squad: publicSquad(s) });
});

// One-click demo squad — judges see the magic in 10 seconds
app.post("/api/demo", (_req, res) => {
  const s = createDemoSquad();
  res.json({ squad: publicSquad(s) });
});

// Remove a member from the squad
app.delete("/api/squads/:id/members/:name", (req, res) => {
  const s = removeMember(req.params.id, req.params.name);
  if (!s) {
    res.status(404).json({ error: "squad or member not found" });
    return;
  }
  broadcast(s.id, {
    type: "member_joined",
    member: `${req.params.name} left`,
    memberCount: s.members.length,
  });
  res.json({ squad: publicSquad(s) });
});

// Generate the squad plan — the Qloo-powered intersection
app.post("/api/squads/:id/plan", async (req, res) => {
  const s = getSquad(req.params.id);
  if (!s) {
    res.status(404).json({ error: "squad not found" });
    return;
  }
  if (s.members.length === 0) {
    res.status(400).json({ error: "add at least one member with favorites first" });
    return;
  }
  if (!qlooReady()) {
    res.status(503).json({ error: "Qloo is not configured (set QLOO_API_KEY or QLOO_MOCK=1)" });
    return;
  }
  try {
    const favorites = s.members.flatMap((m) =>
      m.favorites.map((f) => ({ member: m.name, favorite: f }))
    );
    const result = await squadPlan(favorites, s.location, s.vibe);

    // TRUE intersection: per-member personal top picks -> affinity per candidate
    const affinity = await squadAffinity(
      result.resolved,
      { movie: result.movie, restaurant: result.restaurant, music: result.music },
      s.location
    ).catch(() => new Map<string, number>());

    const [trendLists, itinerary, narration] = await Promise.all([
      Promise.all([
        trending("movie", "", 1).catch(() => []),
        trending("restaurant", s.location, 1).catch(() => []),
        trending("music", "", 1).catch(() => []),
      ]),
      buildItinerary(s.name, s.vibe, s.location, result.movie, result.restaurant, result.music),
      narratePlan(
        s.name,
        s.members.map((m) => m.name),
        result.movie,
        result.restaurant,
        result.music,
        tasteDNA(result.resolved),
        s.vibe
      ).catch(() => ({ narrative: "", ai: false })),
    ]);

    // Vibe scores: Qloo-derived affinity (70%) + popularity (30%)
    const withScores = <T extends { entityId: string }>(hits: T[]) =>
      hits.map((h) => ({
        ...h,
        vibeScore: vibeScore(h as never, affinity.get(h.entityId), s.members.length),
      }));
    const scored = {
      movie: withScores(result.movie),
      restaurant: withScores(result.restaurant),
      music: withScores(result.music),
    };

    // Trending twist: one fresh pick per category
    const twist = {
      movie: trendLists[0][0] ?? null,
      restaurant: trendLists[1][0] ?? null,
      music: trendLists[2][0] ?? null,
    };

    // Squad Taste DNA — visual fingerprint of the combined taste
    const dna = tasteDNA(result.resolved);

    // 3 Vibe Variants — same taste data, three flavors (no extra Qloo calls)
    const pickTop = <T>(arr: T[], n: number) => arr.slice(0, n);
    const pickRandom = <T>(arr: T[], n: number) => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, n);
    };
    const variants = {
      consensus: {
        label: "🎯 Best Match",
        desc: "Highest taste affinity — the safest crowd-pleaser",
        movie: pickTop(scored.movie, 2),
        restaurant: pickTop(scored.restaurant, 2),
        music: pickTop(scored.music, 2),
      },
      trending: {
        label: "🔥 Trending Now",
        desc: "What's hot right now, filtered by your squad's taste",
        movie: twist.movie ? [twist.movie] : [],
        restaurant: twist.restaurant ? [twist.restaurant] : [],
        music: twist.music ? [twist.music] : [],
      },
      wildcard: {
        label: "🎲 Wild Card",
        desc: "Unexpected picks from your taste pool — embrace chaos",
        movie: pickRandom(scored.movie, 2),
        restaurant: pickRandom(scored.restaurant, 2),
        music: pickRandom(scored.music, 2),
      },
    };

    broadcast(s.id, { type: "plan_ready", memberCount: s.members.length });

    const saved = {
      plan: scored,
      trendingTwist: twist,
      variants,
      itinerary: itinerary.stops,
      itineraryAI: itinerary.ai,
      tasteDNA: dna,
      narrative: narration.narrative,
      narrativeAI: narration.ai,
      qloo: qlooMode(),
      members: s.members.length,
      generatedAt: new Date().toISOString(),
    };
    savePlan(s.id, saved);
    res.json(saved);
  } catch (e) {
    res.status(502).json({ error: `plan failed: ${(e as Error).message}` });
  }
});

// Get the saved plan (shareable, consistent) — 404 if not generated yet
app.get("/api/squads/:id/plan", (req, res) => {
  const s = getSquad(req.params.id);
  if (!s) {
    res.status(404).json({ error: "squad not found" });
    return;
  }
  const saved = getSavedPlan(s.id);
  if (!saved) {
    res.status(404).json({ error: "no plan yet — generate one first" });
    return;
  }
  res.json(saved);
});

// ---------- Live voting ----------
// POST /api/squads/:id/votes { member, choice: "love"|"fine"|"veto" }
app.post("/api/squads/:id/votes", (req, res) => {
  const { member, choice } = req.body ?? {};
  if (typeof member !== "string" || typeof choice !== "string") {
    res.status(400).json({ error: "member and choice are required" });
    return;
  }
  const s = getSquad(req.params.id);
  if (!s) {
    res.status(404).json({ error: "squad not found" });
    return;
  }
  if (!s.savedPlan) {
    res.status(400).json({ error: "no plan to vote on yet" });
    return;
  }
  const result = castVote(s.id, member, choice);
  if (!result) {
    res.status(500).json({ error: "vote failed" });
    return;
  }
  broadcast(s.id, {
    type: "vote_cast",
    member: member.trim().slice(0, 30),
    choice,
    tally: result.tally,
  });
  res.json(result);
});

app.get("/api/squads/:id/votes", (req, res) => {
  const v = getVotes(req.params.id);
  if (!v) {
    res.status(404).json({ error: "squad not found" });
    return;
  }
  res.json(v);
});

// Serve the built web app (production)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(__dirname, "..", "web");
app.use(express.static(webDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).json({ error: "not found" });
  });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`SquadVibe on :${PORT} (qloo: ${qlooMode()})`);
});
