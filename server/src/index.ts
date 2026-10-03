// SquadVibe server — end group-plan fights with Qloo taste intelligence.
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { broadcast, subscribe } from "./events.js";
import { buildItinerary } from "./itinerary.js";
import { qlooMode, qlooReady, squadPlan, trending, vibeScore } from "./qloo.js";
import {
  addMember,
  createDemoSquad,
  createSquad,
  getSavedPlan,
  getSquad,
  publicSquad,
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
    const [plan, trends] = await Promise.all([
      squadPlan(favorites, s.location, s.vibe),
      Promise.all([
        trending("movie", "", 1).catch(() => []),
        trending("restaurant", s.location, 1).catch(() => []),
        trending("music", "", 1).catch(() => []),
      ]),
    ]);

    // Vibe scores per pick
    const scored = Object.fromEntries(
      Object.entries(plan).map(([cat, hits]) => [
        cat,
        hits.map((h) => ({ ...h, vibeScore: vibeScore(h, s.members.length) })),
      ])
    );

    // Trending twist: one fresh pick per category
    const twist = {
      movie: trends[0][0] ?? null,
      restaurant: trends[1][0] ?? null,
      music: trends[2][0] ?? null,
    };

    // AI evening itinerary
    const itinerary = await buildItinerary(
      s.name,
      s.vibe,
      s.location,
      plan.movie,
      plan.restaurant,
      plan.music
    );

    broadcast(s.id, { type: "plan_ready", memberCount: s.members.length });

    const saved = {
      plan: scored,
      trendingTwist: twist,
      itinerary: itinerary.stops,
      itineraryAI: itinerary.ai,
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
