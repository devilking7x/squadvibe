import { useEffect, useState } from "react";
import { api, type ItineraryStop, type Plan, type PlanResult, type PlanVariant, type TasteDNA, type TasteHit } from "../api";

const SECTIONS = [
  { key: "movie", emoji: "🎬", title: "Watch together" },
  { key: "restaurant", emoji: "🍽️", title: "Eat together" },
  { key: "music", emoji: "🎵", title: "Vibe together" },
] as const;

function cleanName(n: string) {
  return n.replace(/^\[MOCK\]\s*/, "");
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-neon to-hot transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-bold text-neon whitespace-nowrap">{score}% vibe match</span>
    </div>
  );
}

function PickCard({ hit, rank }: { hit: TasteHit; rank: number }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="card">
      <h3 className="font-display font-bold text-lg">
        {medals[rank] ?? "✨"} {cleanName(hit.name)}
      </h3>
      {typeof hit.vibeScore === "number" && <ScoreBar score={hit.vibeScore} />}
      {hit.description && (
        <p className="text-white/55 text-sm mt-2">{cleanName(hit.description)}</p>
      )}
      {hit.enrichment && hit.enrichment.snippets.length > 0 && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
          <p className="text-[11px] font-bold text-white/50 mb-1.5">
            ⚡ LIVE INTEL <span className="font-normal text-white/30">· fresh from the web</span>
          </p>
          <ul className="space-y-1.5">
            {hit.enrichment.snippets.map((sn, i) => (
              <li key={i} className="text-xs text-white/60 leading-relaxed">
                &ldquo;{sn}&rdquo;
              </li>
            ))}
          </ul>
        </div>
      )}
      {hit.matchedFavorites && hit.matchedFavorites.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-white/40 mb-1">Taste signals behind this pick:</p>
          <div className="flex flex-wrap gap-1.5">
            {hit.matchedFavorites.map((f, i) => (
              <span key={i} className="chip !bg-neon/15 !text-neon">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Itinerary({ stops, ai }: { stops: ItineraryStop[]; ai: boolean }) {
  if (stops.length === 0) return null;
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="font-display font-bold text-xl">🗓️ Your perfect evening</h2>
        {ai && <span className="chip !bg-gold/15 !text-gold">AI-planned</span>}
      </div>
      <div className="relative pl-8">
        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gradient-to-b from-neon to-hot opacity-40" />
        <div className="space-y-4">
          {stops.map((s, i) => (
            <div key={i} className="relative">
              <div className="absolute -left-8 top-1 w-6 h-6 rounded-full bg-grape border border-neon/50 flex items-center justify-center text-sm">
                {s.emoji}
              </div>
              <div className="card !p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-hot">{s.time}</span>
                  <span className="font-display font-bold">{s.title}</span>
                </div>
                <p className="text-white/55 text-sm">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TasteDNACard({ dna }: { dna: TasteDNA }) {
  if (!dna || dna.totalFavorites === 0) return null;
  return (
    <div className="mb-10">
      <h2 className="font-display font-bold text-xl mb-1">🧬 Squad Taste DNA</h2>
      <p className="text-white/45 text-sm mb-4">
        Your squad's combined taste fingerprint — derived from Qloo's taste graph.
      </p>
      <div className="card">
        <div className="space-y-3 mb-5">
          {dna.categories.map((c) => (
            <div key={c.key}>
              <div className="flex justify-between text-sm mb-1">
                <span>
                  {c.emoji} {c.label}
                </span>
                <span className="font-bold text-neon">{c.percent}%</span>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-neon via-hot to-gold transition-all"
                  style={{ width: `${c.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-3 border-t border-white/10">
          {dna.members.map((m) => (
            <span key={m.name} className="chip" title={`${m.favorites} favorites`}>
              🧑 {m.name} · {m.topCategory}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendingTwist({ twist }: { twist: PlanResult["trendingTwist"] }) {  const items = [
    { hit: twist.movie, label: "🎬 Trending film" },
    { hit: twist.restaurant, label: "🍽️ Trending spot" },
    { hit: twist.music, label: "🎵 Trending sound" },
  ].filter((x) => x.hit);
  if (items.length === 0) return null;
  return (
    <div className="mb-10">
      <h2 className="font-display font-bold text-xl mb-1">🔥 Trending twist</h2>
      <p className="text-white/45 text-sm mb-4">
        Fresh from Qloo Trends — swap one of these in if you're feeling adventurous.
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        {items.map(({ hit, label }) => (
          <div key={label} className="card !p-4">
            <p className="text-xs text-white/40 mb-1">{label}</p>
            <p className="font-bold">{cleanName(hit!.name)}</p>
            {hit!.description && (
              <p className="text-white/50 text-xs mt-1">{cleanName(hit!.description)}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Narrative({ text, ai }: { text?: string; ai?: boolean }) {
  if (!text) return null;
  return (
    <div className="mb-10">
      <div className="card !border-gold/30 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-gold to-hot" />
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🤖</span>
          <p className="font-display font-bold">Why this plan slaps</p>
          {ai && <span className="chip !bg-gold/15 !text-gold !text-xs">AI narrated</span>}
        </div>
        <p className="text-white/80 text-[15px] leading-relaxed italic">"{text}"</p>
      </div>
    </div>
  );
}

function Voting({ squadId }: { squadId: string }) {
  const [tally, setTally] = useState<Record<string, number>>({ love: 0, fine: 0, veto: 0 });
  const [voter, setVoter] = useState("");
  const [myVote, setMyVote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consensus, setConsensus] = useState<{ text: string; ai: boolean } | null>(null);

  useEffect(() => {
    api.getVotes(squadId).then((v) => {
      setTally(v.tally);
      setConsensus(v.consensus ?? null);
    }).catch(() => {});
    const stop = api.stream(squadId, (ev) => {
      if (ev.type === "vote_cast" && ev.tally) {
        setTally(ev.tally);
        api.getVotes(squadId).then((v) => setConsensus(v.consensus ?? null)).catch(() => {});
      }
    });
    return stop;
  }, [squadId]);

  const vote = async (choice: string) => {
    if (!voter.trim()) return;
    setBusy(true);
    try {
      await api.vote(squadId, voter.trim(), choice);
      const v = await api.getVotes(squadId);
      setTally(v.tally);
      setConsensus(v.consensus ?? null);
      setMyVote(choice);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const total = tally.love + tally.fine + tally.veto;
  const lovePct = total > 0 ? Math.round((tally.love / total) * 100) : 0;
  const consensusLabel = tally.veto > 0 ? "⚠️ Has vetoes — discuss!" : total === 0 ? "No votes yet" : lovePct >= 60 ? "🎉 Squad approved!" : "🤔 Still deciding…";

  return (
    <div className="mb-10">
      <h2 className="font-display font-bold text-xl mb-1">🗳️ Squad vote</h2>
      <p className="text-white/45 text-sm mb-4">Live — everyone sees votes instantly. {consensusLabel}</p>
      <div className="card">
        <div className="flex gap-2 mb-4">
          <input
            className="input flex-1"
            placeholder="Your name"
            value={voter}
            onChange={(e) => setVoter(e.target.value)}
            maxLength={30}
          />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { c: "love", emoji: "😍", label: "Love it" },
            { c: "fine", emoji: "👍", label: "Fine" },
            { c: "veto", emoji: "🚫", label: "Veto" },
          ].map(({ c, emoji, label }) => (
            <button
              key={c}
              onClick={() => vote(c)}
              disabled={busy || !voter.trim()}
              className={`rounded-xl border p-3 text-center transition ${
                myVote === c
                  ? "border-neon bg-neon/15"
                  : "border-white/15 hover:border-neon/50"
              } disabled:opacity-40`}
            >
              <div className="text-2xl">{emoji}</div>
              <div className="text-xs mt-1">{label}</div>
              <div className="font-bold text-neon">{tally[c] ?? 0}</div>
            </button>
          ))}
        </div>
        {total > 0 && (
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-1">
              <span>Approval</span>
              <span className="font-bold text-neon">{lovePct}% love it</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-neon to-gold transition-all"
                style={{ width: `${lovePct}%` }}
              />
            </div>
          </div>
        )}
        {consensus && (
          <div className="mt-4 rounded-xl border border-gold/25 bg-gold/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">🗣️</span>
              <p className="text-xs font-bold text-gold">Squad reading</p>
              {consensus.ai && (
                <span className="chip !bg-gold/15 !text-gold !text-[10px]">AI</span>
              )}
            </div>
            <p className="text-sm text-white/75 leading-relaxed">{consensus.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Variants({ variants }: { variants: PlanResult["variants"] }) {
  const [tab, setTab] = useState<"consensus" | "trending" | "wildcard">("consensus");
  if (!variants) return null;
  const v: PlanVariant = variants[tab];
  const sections = [
    { key: "movie" as const, emoji: "🎬", title: "Watch" },
    { key: "restaurant" as const, emoji: "🍽️", title: "Eat" },
    { key: "music" as const, emoji: "🎵", title: "Vibe" },
  ];
  return (
    <div className="mb-10">
      <h2 className="font-display font-bold text-xl mb-1">🎭 Pick your flavor</h2>
      <p className="text-white/45 text-sm mb-4">Same taste data, three ways to play it.</p>
      <div className="flex gap-2 mb-4">
        {(Object.keys(variants) as Array<"consensus" | "trending" | "wildcard">).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`tab-btn ${tab === k ? "active" : ""}`}
          >
            {variants[k].label}
          </button>
        ))}
      </div>
      <p className="text-white/50 text-sm mb-3 italic">{v.desc}</p>
      <div className="grid md:grid-cols-3 gap-3">
        {sections.map((s) => (
          <div key={s.key} className="card !p-4">
            <p className="text-xs text-white/40 mb-2">
              {s.emoji} {s.title}
            </p>
            {v[s.key].length === 0 ? (
              <p className="text-white/40 text-sm">—</p>
            ) : (
              v[s.key].map((hit, i) => (
                <p key={hit.entityId + i} className="font-bold text-sm mb-1">
                  {i === 0 ? "🥇" : "🥈"} {cleanName(hit.name)}
                </p>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlanPage({ id, nav }: { id: string; nav: (h: string) => void }) {
  const [result, setResult] = useState<PlanResult | null>(null);
  const [err, setErr] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadSaved = () => {
    // Saved plan first (shareable + consistent); generate if none yet.
    api
      .getPlan(id)
      .catch(() => api.plan(id))
      .then(setResult)
      .catch((e) => setErr((e as Error).message));
  };

  useEffect(() => {
    loadSaved();
  }, [id]);

  const regenerate = async () => {
    setRegenBusy(true);
    setErr("");
    try {
      const r = await api.plan(id);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRegenBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/#/s/${id}/plan`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (err)
    return (
      <div className="text-center pt-20 px-4">
        <p className="text-red-400 mb-4">{err}</p>
        <button className="btn-ghost" onClick={() => nav(`#/s/${id}`)}>
          ← Back to squad
        </button>
      </div>
    );
  if (!result)
    return (
      <div className="text-center pt-24 px-4">
        <div className="text-5xl mb-4 animate-bounce">🧠</div>
        <p className="font-display font-bold text-xl">Tasting your squad's vibe…</p>
        <p className="text-white/50 text-sm mt-2">Qloo is cross-referencing everyone's taste</p>
      </div>
    );

  const plan: Plan = result.plan;
  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-20">
      <div className="text-center mb-8">
        <div className="chip mb-4">
          {result.qloo === "mock" ? "🧪 demo mode" : "🧬 Qloo taste graph"} · {result.members} member
          {result.members > 1 ? "s" : ""}
        </div>
        <h1 className="font-display text-4xl font-extrabold">
          Your squad's <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon to-hot">perfect plan</span>
        </h1>
      </div>

      <Itinerary stops={result.itinerary} ai={result.itineraryAI} />

      <Narrative text={result.narrative} ai={result.narrativeAI} />

      {result.tasteDNA && <TasteDNACard dna={result.tasteDNA} />}

      {SECTIONS.map((s) => (
        <div key={s.key} className="mb-8">
          <h2 className="font-display font-bold text-xl mb-3">
            {s.emoji} {s.title}
          </h2>
          <div className="space-y-3">
            {plan[s.key].map((hit, i) => (
              <PickCard key={hit.entityId + i} hit={hit} rank={i} />
            ))}
            {plan[s.key].length === 0 && (
              <p className="text-white/40 text-sm">No picks — try adding more favorites.</p>
            )}
          </div>
        </div>
      ))}

      <TrendingTwist twist={result.trendingTwist} />

      <Variants variants={result.variants} />

      <Voting squadId={id} />

      <div className="flex gap-3 justify-center mt-10 flex-wrap">
        <button className="btn-ghost" onClick={() => nav(`#/s/${id}`)}>
          ← Back to squad
        </button>
        <button className="btn-ghost" onClick={regenerate} disabled={regenBusy}>
          {regenBusy ? "Regenerating…" : "🔄 Regenerate"}
        </button>
        <button className="btn-ghost" onClick={copyLink}>
          {copied ? "✓ Copied!" : "🔗 Copy plan link"}
        </button>
        <button className="btn-ghost" onClick={() => nav("#/")}>
          🏠 Home
        </button>
      </div>
    </div>
  );
}
