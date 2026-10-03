import { useEffect, useState } from "react";
import { api, type ItineraryStop, type Plan, type PlanResult, type TasteHit } from "../api";

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

function TrendingTwist({ twist }: { twist: PlanResult["trendingTwist"] }) {
  const items = [
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

export default function PlanPage({ id, nav }: { id: string; nav: (h: string) => void }) {
  const [result, setResult] = useState<PlanResult | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    // Saved plan first (shareable + consistent); generate if none yet.
    api
      .getPlan(id)
      .catch(() => api.plan(id))
      .then(setResult)
      .catch((e) => setErr((e as Error).message));
  }, [id]);

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

      <div className="flex gap-3 justify-center mt-10">
        <button className="btn-ghost" onClick={() => nav(`#/s/${id}`)}>
          ← Back to squad
        </button>
        <button className="btn-ghost" onClick={() => nav("#/")}>
          🏠 Home
        </button>
      </div>
    </div>
  );
}
