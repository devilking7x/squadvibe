import { useState } from "react";
import { api } from "../api";

const VIBES = [
  { id: "chill", e: "🛋️", label: "Chill" },
  { id: "party", e: "🎉", label: "Party" },
  { id: "cozy", e: "🕯️", label: "Cozy" },
  { id: "adventure", e: "🧭", label: "Adventure" },
];

export default function Create({ nav }: { nav: (h: string) => void }) {
  const [name, setName] = useState("");
  const [vibe, setVibe] = useState("chill");
  const [location, setLocation] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr("");
    if (!name.trim()) {
      setErr("Give your plan a name");
      return;
    }
    setBusy(true);
    try {
      const { squad } = await api.createSquad(name, vibe, location);
      nav(`#/s/${squad.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-12 pb-20">
      <h1 className="font-display text-3xl font-extrabold mb-2">Create squad plan</h1>
      <p className="text-white/55 mb-8">Set the vibe — friends join with your squad code.</p>

      <label className="block text-sm font-medium mb-2">Plan name</label>
      <input
        className="input mb-6"
        placeholder="e.g. Saturday Night Out"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
      />

      <label className="block text-sm font-medium mb-2">Vibe</label>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {VIBES.map((v) => (
          <button
            key={v.id}
            className={`vibe-btn ${vibe === v.id ? "active" : ""}`}
            onClick={() => setVibe(v.id)}
          >
            <span className="text-2xl mr-2">{v.e}</span>
            {v.label}
          </button>
        ))}
      </div>

      <label className="block text-sm font-medium mb-2">
        Location <span className="text-white/40">(for dinner spots)</span>
      </label>
      <input
        className="input mb-8"
        placeholder="e.g. Pune"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        maxLength={60}
      />

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}
      <button className="btn-primary w-full" onClick={submit} disabled={busy}>
        {busy ? "Creating…" : "🚀 Create & get squad code"}
      </button>
    </div>
  );
}
