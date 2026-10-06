# SquadVibe — Devpost Submission Draft (Qloo Hackathon)
<!-- Copy-paste ready. Deadline: Oct 31, 2026, 09:15 IST -->

## Title
SquadVibe

## Tagline
Stop arguing about plans — let taste decide. AI finds the movie + dinner + music your whole squad loves.

## Description

**The problem:** Every group chat dies at "kahan chalein?" — 47 messages, zero decisions. Someone always compromises and resents it.

**The solution:** SquadVibe turns group planning into a 2-minute game. Each member shares 2-3 favorites via a share code. Our engine queries the **Qloo Taste AI API** over everyone's combined signals and finds the true intersection — the movie, restaurant, and music *everyone* will actually enjoy.

### How we use Qloo
- **Per-member Taste DNA**: Qloo Insights API maps each member's favorites to taste vectors across movies, dining, and music
- **True affinity intersection**: we don't average ratings — we compute the overlap of real taste graphs, so the plan reflects shared passion, not bland compromise
- **Three vibe variants**: Best Match (highest affinity), Trending Now, and Wild Card — all Qloo-derived
- **Vibe score**: 70% taste affinity + 30% cultural popularity, computed live

### Winning features
- 🗳️ **Live voting** — Love / Fine / Veto per member, real-time tally via SSE, with an honest AI consensus narrator that calls out split squads instead of faking agreement
- ⚡ **Live venue intel** — real-time web enrichment on restaurant picks (hours, vibe)
- 🎭 **AI Squad Narrator** — a personalized "why this plan slaps" story for your crew
- 🔗 **Share codes + plan links** — no signup needed to join a squad

### Built with
Qloo Taste AI API, Node.js, TypeScript, Express, React, Vite, Tailwind CSS, Server-Sent Events

## Live demo
https://squadvibe.onrender.com

## Repo
https://github.com/devilking7x/squadvibe
