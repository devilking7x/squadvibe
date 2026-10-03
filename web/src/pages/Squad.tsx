import { useEffect, useState } from "react";
import { api, type Squad } from "../api";

export default function SquadPage({ id, nav }: { id: string; nav: (h: string) => void }) {
  const [squad, setSquad] = useState<Squad | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [favs, setFavs] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");

  const load = async () => {
    try {
      const { squad } = await api.getSquad(id);
      setSquad(squad);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    // Live room: refresh when anyone joins
    const stop = api.stream(id, (ev) => {
      if (ev.type === "member_joined") {
        setLiveMsg(`🎉 ${ev.member} joined the squad!`);
        load();
        setTimeout(() => setLiveMsg(""), 4000);
      } else if (ev.type === "plan_ready") {
        setLiveMsg("✨ Squad plan is ready!");
        setTimeout(() => setLiveMsg(""), 4000);
      }
    });
    return stop;
  }, [id]);

  const join = async () => {
    setErr("");
    const favorites = favs.map((f) => f.trim()).filter(Boolean);
    if (!name.trim() || favorites.length === 0) {
      setErr("Apna naam + kam se kam 1 favorite batao");
      return;
    }
    setBusy(true);
    try {
      const { squad } = await api.addMember(id, name, favorites);
      setSquad(squad);
      setName("");
      setFavs(["", "", ""]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const makePlan = async () => {
    setErr("");
    setPlanning(true);
    try {
      await api.plan(id);
      nav(`#/s/${id}/plan`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  const copyCode = () => {
    if (squad) {
      navigator.clipboard.writeText(squad.code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const remove = async (memberName: string) => {
    if (!confirm(`Remove ${memberName} from the squad?`)) return;
    try {
      const { squad } = await api.removeMember(id, memberName);
      setSquad(squad);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (err && !squad) return <p className="text-center pt-20 text-red-400">{err}</p>;
  if (!squad) return <p className="text-center pt-20 text-white/50">Loading squad…</p>;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-20">
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-extrabold">{squad.name}</h1>
        <p className="text-white/50 mt-1">
          {squad.vibe} vibes{squad.location ? ` · ${squad.location}` : ""}
        </p>
        <button
          onClick={copyCode}
          className="chip mt-4 text-base !px-5 !py-2 cursor-pointer hover:bg-white/15"
          title="Copy squad code"
        >
          🔑 Squad code: <b className="tracking-widest">{squad.code}</b>
          <span className="text-white/50 text-xs ml-1">{copied ? "copied!" : "tap to copy"}</span>
        </button>
        <p className="text-white/40 text-xs mt-2">Share this code — friends join from the home page.</p>
      </div>

      {/* members */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-lg">
          Squad ({squad.members.length})
        </h2>
        <span className="chip !bg-green-500/15 !text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          live room
        </span>
      </div>
      {liveMsg && (
        <div className="card !border-green-400/40 !bg-green-500/10 mb-4 text-center font-medium">
          {liveMsg}
        </div>
      )}
      {squad.members.length === 0 && (
        <p className="text-white/40 text-sm mb-4">No members yet — add your taste below 👇</p>
      )}
      <div className="space-y-3 mb-8">
        {squad.members.map((m) => (
          <div key={m.name} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">🧑 {m.name}</div>
              <button
                onClick={() => remove(m.name)}
                className="text-white/30 hover:text-red-400 text-sm transition"
                title={`Remove ${m.name}`}
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {m.favorites.map((f, i) => (
                <span key={i} className="chip">
                  {f}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* join form */}
      <div className="card mb-8">
        <h3 className="font-display font-bold mb-4">➕ Add your taste</h3>
        <input
          className="input mb-3"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
        />
        {favs.map((f, i) => (
          <input
            key={i}
            className="input mb-2"
            placeholder={`Favorite ${i + 1} — movie, artist, cuisine…`}
            value={f}
            onChange={(e) => {
              const n = [...favs];
              n[i] = e.target.value;
              setFavs(n);
            }}
            maxLength={80}
          />
        ))}
        <p className="text-white/40 text-xs mb-4">
          e.g. "Interstellar", "A.R. Rahman", "biryani" — whatever you love.
        </p>
        {err && <p className="text-red-400 text-sm mb-3">{err}</p>}
        <button className="btn-primary w-full" onClick={join} disabled={busy}>
          {busy ? "Adding…" : "Join squad"}
        </button>
      </div>

      {/* generate */}
      <button
        className="btn-primary w-full text-lg"
        onClick={makePlan}
        disabled={planning || squad.members.length === 0}
      >
        {planning ? "🧠 Qloo is tasting your squad…" : "✨ Generate our perfect plan"}
      </button>
      {squad.members.length === 0 && (
        <p className="text-white/40 text-xs text-center mt-2">Add at least one member first.</p>
      )}
    </div>
  );
}
