import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import Create from "./pages/Create";
import SquadPage from "./pages/Squad";
import PlanPage from "./pages/Plan";

function route() {
  const h = window.location.hash || "#/";
  const m = h.match(/^#\/s\/([^/]+)(\/plan)?$/);
  if (m) return { page: m[2] ? "plan" : "squad", id: m[1] };
  if (h === "#/create") return { page: "create" };
  return { page: "home" };
}

export default function App() {
  const [r, setR] = useState(route());
  useEffect(() => {
    const onHash = () => setR(route());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = (h: string) => {
    window.location.hash = h;
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => nav("#/")}
            className="font-display font-extrabold text-xl tracking-tight"
          >
            🎭 Squad<span className="text-transparent bg-clip-text bg-gradient-to-r from-neon to-hot">Vibe</span>
          </button>
          <span className="chip">Qloo Hackathon 2026</span>
        </div>
      </header>
      <main>
        {r.page === "home" && <Landing nav={nav} />}
        {r.page === "create" && <Create nav={nav} />}
        {r.page === "squad" && <SquadPage id={(r as { id: string }).id} nav={nav} />}
        {r.page === "plan" && <PlanPage id={(r as { id: string }).id} nav={nav} />}
      </main>
      <footer className="border-t border-white/10 mt-10">
        <p className="text-center text-white/30 text-xs py-6">
          SquadVibe · taste intelligence by Qloo · built for the Qloo Agent Hackathon 2026
        </p>
      </footer>
    </div>
  );
}
