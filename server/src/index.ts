// SquadVibe server — end group-plan fights with Qloo taste intelligence.
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qlooMode, qlooReady, squadPlan } from "./qloo.js";
import { addMember, createSquad, getSquad, publicSquad } from "./store.js";

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
    const plan = await squadPlan(favorites, s.location, s.vibe);
    res.json({
      plan,
      qloo: qlooMode(),
      members: s.members.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    res.status(502).json({ error: `plan failed: ${(e as Error).message}` });
  }
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
