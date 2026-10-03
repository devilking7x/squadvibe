# 🎭 SquadVibe

**End the "kya karein?" fight forever.** SquadVibe finds the movie, dinner spot & music your whole squad will love — grounded in [Qloo](https://www.qloo.com)'s Taste Intelligence (250M+ entities across film, music, dining & more).

Built for the **Qloo Agent Hackathon 2026** ($25,000 prizes).

## The problem

Every group has lived this: *"movie kaunsi dekhein?" "khana kahan khayein?"* — 45 minutes of debate, nobody happy. Generic AI guesses what groups like. SquadVibe **knows**, because every pick is grounded in Qloo's cultural taste graph.

## How it works

1. **Create a squad plan** — name it, pick a vibe (chill / party / cozy / adventure), add a location. You get a 6-letter squad code.
2. **Everyone adds taste** — each friend drops 2–3 favorites (movies, artists, cuisines). Friends join with the code, no signup needed.
3. **Qloo finds the overlap** — every favorite resolves to Qloo entity IDs; the Insights API finds picks matching the *combined* taste = the intersection the whole squad vibes with.
4. **One perfect plan** — top movie + restaurant + music picks, each with a "why your squad will love it" explanation tracing back to members' favorites.

## Why this needs Qloo

Without Qloo, this is just vibes. With Qloo, it's science: cross-category taste correlations (your music taste predicts your restaurant taste) across 250M+ entities, weighted by real-time popularity and location. A submission that worked the same without Qloo would be the wrong thing — SquadVibe *is* the taste graph, applied to group decisions.

## Tech

- **Frontend:** Vite + React + TypeScript + Tailwind (dark party theme)
- **Backend:** Express + TypeScript
- **Taste engine:** Qloo Search API (entity resolution) + Insights API (multi-signal recommendations)
- **Deploy:** Render (free tier), single service serving API + static web

## Run locally

```bash
# backend
cd server && npm install && npm run dev
# frontend (another terminal)
cd web && npm install && npm run dev
```

For a full demo without a Qloo key:

```bash
QLOO_MOCK=1  # canned [MOCK] results, clearly labeled — never real data
```

## Env vars

| Var | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | for live taste data | Get free at [dashboard.qloo.com](https://dashboard.qloo.com). **Never commit it.** |
| `QLOO_API_URL` | no | Defaults to `https://hackathon.api.qloo.com/v2` |
| `QLOO_MOCK` | no | `1` = offline demo mode with labeled mock data |
| `PORT` | no | Defaults to `3000` |

## API

- `POST /api/squads` — `{name, vibe, location}` → squad + share code
- `GET /api/squads/:id` — squad (id or code)
- `POST /api/squads/:id/members` — `{name, favorites[]}` join/update
- `POST /api/squads/:id/plan` — the Qloo-powered squad plan

## License

MIT
