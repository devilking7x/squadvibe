// SquadVibe upgrade tests — enrichment + consensus narrator.
// Run: npx tsx --test tests/upgrades.test.ts   (from server/)
import { test } from "node:test";
import assert from "node:assert/strict";

// Guarantee the honest no-key paths (modules read env at import time).
delete process.env.TAVILY_API_KEY;
delete process.env.NEBIUS_API_KEY;

const { enrichVenues } = await import("../src/enrich.js");
const { narrateConsensus } = await import("../src/narrator.js");

const PICKS = {
  movie: "[MOCK] Dune: Part Two",
  restaurant: "[MOCK] The Midnight Diner",
  music: "[MOCK] A. R. Rahman",
};

const v = (member: string, choice: "love" | "fine" | "veto") => ({
  member,
  choice,
  at: new Date().toISOString(),
});

// ---------- Enrichment ----------

test("enrichment: no TAVILY_API_KEY -> empty map, fast, no throw", async () => {
  const t0 = Date.now();
  const out = await enrichVenues(
    [
      { entityId: "r1", name: "Some Restaurant" },
      { entityId: "r2", name: "Another Place" },
    ],
    "Pune"
  );
  assert.ok(Date.now() - t0 < 2000, "must not hit the network without a key");
  assert.ok(out instanceof Map);
  assert.equal(out.size, 0);
});

test("enrichment: empty venues list -> empty map", async () => {
  const out = await enrichVenues([], "Pune");
  assert.equal(out.size, 0);
});

test("plan structure unchanged when enrichment skipped", () => {
  // Simulates index.ts wiring with an empty enrichment map.
  const hits = [
    { entityId: "r1", name: "A", category: "restaurant", description: "d", popularity: 0.9 },
    { entityId: "r2", name: "B", category: "restaurant", description: "d", popularity: 0.8 },
  ];
  const enrichment = new Map<string, { snippets: string[]; source: "tavily" }>();
  const out = hits.map((h) => {
    const e = enrichment.get(h.entityId);
    return e ? { ...h, enrichment: e } : h;
  });
  assert.deepEqual(out, hits, "hits must pass through byte-identical");
  assert.ok(!("enrichment" in out[0]), "enrichment field must be ABSENT, not null/faked");
});

// ---------- Consensus narrator ----------

test("consensus: no votes -> null", async () => {
  assert.equal(await narrateConsensus([], PICKS), null);
});

test("consensus: split love/fine mentions BOTH sides, no fake winner", async () => {
  const r = await narrateConsensus([v("Aarav", "love"), v("Diya", "fine")], PICKS);
  assert.ok(r, "expected a narrative");
  assert.ok(r.text.includes("Aarav"), "must name the lover");
  assert.ok(r.text.includes("Diya"), "must name the fence-sitter");
  assert.ok(!r.text.includes("Full send"), "must NOT declare consensus on a split");
  assert.equal(r.ai, false, "no Nebius key -> rule-based, ai=false");
});

test("consensus: dead tie is called a tie", async () => {
  const r = await narrateConsensus(
    [v("Aarav", "love"), v("Kabir", "love"), v("Diya", "fine"), v("Meera", "fine")],
    PICKS
  );
  assert.ok(r);
  assert.ok(/tie/i.test(r.text), `expected "tie" in: ${r.text}`);
});

test("consensus: veto is named honestly, no fake consensus", async () => {
  const r = await narrateConsensus([v("Aarav", "love"), v("Kabir", "veto")], PICKS);
  assert.ok(r);
  assert.ok(r.text.includes("Kabir"), "must name the vetoer");
  assert.ok(/veto/i.test(r.text), "must say veto plainly");
  assert.ok(!r.text.includes("Full send"), "veto present -> no consensus claim");
});

test("consensus: clear majority love -> genuine consensus", async () => {
  const r = await narrateConsensus(
    [v("Aarav", "love"), v("Diya", "love"), v("Kabir", "love"), v("Meera", "fine")],
    PICKS
  );
  assert.ok(r);
  assert.ok(r.text.includes("Full send"), `expected consensus, got: ${r.text}`);
  assert.ok(r.text.includes("3/4"), "must cite the real count");
});

test("consensus: single vote just reports, declares nothing", async () => {
  const r = await narrateConsensus([v("Aarav", "fine")], PICKS);
  assert.ok(r);
  assert.ok(r.text.includes("Only Aarav"), `expected waiting-room copy, got: ${r.text}`);
});

test("consensus: [MOCK] tags never leak into narrative", async () => {
  const r = await narrateConsensus([v("Aarav", "love"), v("Diya", "love")], PICKS);
  assert.ok(r);
  assert.ok(!r.text.includes("[MOCK]"), "mock tags must be stripped");
});

test("consensus: all-fine squad is honest (no fake hype)", async () => {
  const r = await narrateConsensus(
    [v("Aarav", "fine"), v("Diya", "fine"), v("Kabir", "fine")],
    PICKS
  );
  assert.ok(r);
  assert.ok(!r.text.includes("Full send"));
  assert.ok(!r.text.toLowerCase().includes("love this plan"));
});
