import { useEffect, useState } from "react";
import { api, type Plan, type TasteHit } from "../api";

const SECTIONS = [
  { key: "movie", emoji: "🎬", title: "Watch together" },
  { key: "restaurant", emoji: "🍽️", title: "Eat together" },
  { key: "music", emoji: "🎵", title: "Vibe together" },
] as const;

function PickCard({ hit, rank }: { hit: TasteHit; rank: number }) {
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display font-bold text-lg">
          {medals[rank] ?? "✨"} {hit.name.replace(/^\[MOCK\]\s*/, "")}
        </h3>
        {hit.popularity > 0 && (
          <span className="chip whitespace-nowrap">
            🔥 {Math.round(hit.popularity * 100)}% match
          </span>
        )}
      </div>
      {hit.description && (
        <p className="text-white/55 text-sm mt-2">{hit.description.replace(/^\[MOCK\]\s*/, "")}</p>
      )}
      {hit.matchedFavorites && hit.matchedFavorites.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-white/40 mb-1">Why your squad will love it:</p>
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

export default function PlanPage({ id, nav }: { id: string; nav: (h: string) => void }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [meta, setMeta] = useState<{ qloo: string; members: number } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .plan(id)
      .then((r) => {
        setPlan(r.plan);
        setMeta({ qloo: r.qloo, members: r.members });
      })
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
  if (!plan)
    return (
      <div className="text-center pt-24 px-4">
        <div className="text-5xl mb-4 animate-bounce">🧠</div>
        <p className="font-display font-bold text-xl">Tasting your squad's vibe…</p>
        <p className="text-white/50 text-sm mt-2">Qloo is cross-referencing everyone's taste</p>
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-20">
      <div className="text-center mb-8">
        <div className="chip mb-4">
          {meta?.qloo === "mock" ? "🧪 demo mode" : "🧬 Qloo taste graph"} · {meta?.members} member
          {(meta?.members ?? 0) > 1 ? "s" : ""}
        </div>
        <h1 className="font-display text-4xl font-extrabold">
          Your squad's <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon to-hot">perfect plan</span>
        </h1>
      </div>

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
