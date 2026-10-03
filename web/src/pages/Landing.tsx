import { useState } from "react";
import { api } from "../api";

export default function Landing({ nav }: { nav: (h: string) => void }) {
  const [code, setCode] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);

  const join = async () => {
    setJoinErr("");
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      const { squad } = await api.getSquad(c);
      nav(`#/s/${squad.id}`);
    } catch {
      setJoinErr("Squad not found — check the code");
    }
  };

  const demo = async () => {
    setDemoBusy(true);
    try {
      const { squad } = await api.demo();
      nav(`#/s/${squad.id}/plan`);
    } catch {
      setJoinErr("Demo failed — try again");
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div>
      {/* HERO */}
      <section className="text-center pt-16 pb-12 px-4">
        <div className="chip mb-6">🎭 Powered by Qloo Taste Intelligence</div>
        <h1 className="font-display text-5xl md:text-7xl font-extrabold leading-tight">
          End the <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon to-hot">"kya karein?"</span>
          <br />
          fight forever.
        </h1>
        <p className="text-white/60 text-lg mt-6 max-w-xl mx-auto">
          SquadVibe finds the <b className="text-white">movie, dinner & music</b> your
          whole squad will love — grounded in Qloo's 250M+ entity taste graph,
          matched across everyone's taste.
        </p>
        <div className="flex gap-3 justify-center mt-8 flex-wrap">
          <button className="btn-primary" onClick={() => nav("#/create")}>
            🎉 Create squad plan
          </button>
          <button className="btn-ghost" onClick={demo} disabled={demoBusy}>
            {demoBusy ? "Seeding demo…" : "✨ Try a demo squad"}
          </button>
        </div>
        <p className="text-white/35 text-xs mt-3">
          Demo squad = 3 friends, instant plan. Judges, start here 👆
        </p>

        {/* join with code */}
        <div className="mt-8 flex items-center justify-center gap-2 max-w-md mx-auto">
          <input
            className="input text-center uppercase tracking-widest"
            placeholder="Have a squad code? e.g. KX7Q2M"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            maxLength={6}
          />
          <button className="btn-ghost whitespace-nowrap" onClick={join}>
            Join
          </button>
        </div>
        {joinErr && <p className="text-red-400 text-sm mt-2">{joinErr}</p>}
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="font-display text-2xl font-bold text-center mb-8">How it works</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { e: "👥", t: "Everyone adds taste", d: "Each friend drops 2–3 favorites — movies, artists, cuisines they love." },
            { e: "🧠", t: "Qloo finds the overlap", d: "Taste fingerprints resolve to Qloo entities; the graph finds what the WHOLE squad vibes with." },
            { e: "🎬", t: "One perfect plan", d: "A movie + dinner spot + playlist everyone agrees on. Zero fights." },
          ].map((s) => (
            <div key={s.t} className="card text-center">
              <div className="text-4xl mb-3">{s.e}</div>
              <h3 className="font-display font-bold mb-2">{s.t}</h3>
              <p className="text-white/55 text-sm">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY QLOO */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <div className="card border-neon/30">
          <h2 className="font-display text-xl font-bold mb-3">🧬 Why this needs Qloo</h2>
          <p className="text-white/60 text-sm leading-relaxed">
            A generic AI <i>guesses</i> what groups like. SquadVibe grounds every pick in
            Qloo's cultural taste graph — 250M+ entities across film, music, dining and
            more, with cross-category correlations (your music taste predicts your
            restaurant taste). Without Qloo, this is just vibes. With Qloo, it's science.
          </p>
        </div>
      </section>
    </div>
  );
}
