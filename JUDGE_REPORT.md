# SquadVibe — Judge-Mode Test Report
**Date:** 2026-10-10 | **Tester:** Judge persona | **Live URL:** https://squadvibe.onrender.com

## Executive Summary
SquadVibe is a group-plan solver: squads share favorites, Qloo taste data finds the movie + restaurant + music intersection. Tested end-to-end as a hackathon judge would.

**Verdict: WORKING.** Core loop (create → join → plan → vote) functions. Recommendations are real Qloo entities with honest attribution. Issues found and fixed during testing are documented below.

---

## Functional Tests (19 tests)

| # | Test | Result |
|---|------|--------|
| 1 | Health endpoint (`qloo:live`) | ✅ Pass |
| 2 | Landing page loads | ✅ Pass (200) |
| 3 | Create squad | ✅ Pass (ID + share code) |
| 4 | Add 3 members | ✅ Pass |
| 5 | Get squad details | ✅ Pass |
| 6 | Generate plan (Taste Blend) | ✅ Pass — 5+5+5 real picks |
| 7 | Plan variants (consensus/gems/wildcard) | ✅ Pass |
| 8 | Itinerary generation | ✅ Pass (template fallback, AI key not set) |
| 9 | Taste DNA visualization data | ✅ Pass |
| 10 | Narrative generation | ✅ Pass (template fallback) |
| 11 | Voting (love/fine/veto) | ✅ Pass — tally correct |
| 12 | Consensus narrative | ✅ Pass — honest, not sycophantic |
| 13 | Empty squad plan | ✅ Pass — graceful 400 |
| 14 | Invalid squad ID | ✅ Pass — graceful 404 |
| 15-16 | Nonsense favorites | ✅ Pass — no crash, graceful fallback |
| 17 | Diverse food squad (pizza/sushi/biryani) | ✅ Pass after fix (was 0 picks) |
| 18 | Demo squad one-click | ✅ Pass |
| 19 | Demo plan quality | ⚠️ Mixed (see issues) |

---

## Issues Found & Fixed During Testing

1. **Diverse squads got 0 picks** — shared-keyword logic too strict. Fixed with per-member queries + round-robin.
2. **Cross-category pollution** — "Dune" artist vs movie, "Shakespeare's Birthplace" as restaurant. Fixed with exact-match priority + NON_DINING filter.
3. **Rate limiting** — 29 parallel API calls → 429s. Fixed with throttle (max 4 concurrent, 150ms spacing) + sequential categories.
4. **Junk entities** — "Folk" (genre as artist), "NASA Space Center" (as restaurant). Fixed with generic-name filter + no cross-category fallback.
5. **Deploy stuck** — one Render deploy hung in update phase. Cancelled and redeployed.

---

## Judging Criteria Evaluation

### 1. Technological Implementation (Qloo usage)
**How skillfully does it use Qloo?**

- Uses Qloo Search API for entity resolution + taste data (genres, keywords, popularity, descriptions)
- Custom "Taste Blend" engine: member-coverage scoring (40%), core-genre matching (40%), popularity (20%)
- Quality gates prevent literal keyword noise
- Diversity guarantee ensures every member gets representation
- Honest labeling: "Qloo taste data · SquadVibe blend"
- **Note:** Qloo Insights API returns 0 recommendations (verified broken Oct 2026, support silent). The Search-based approach is a legitimate adaptation, not a workaround — Devpost rules mandate no specific endpoint.

**Score: 8/10** (assistant estimate, not official)

### 2. Design (Product Experience)
**Complete, coherent experience?**

- ✅ One-click demo squad for judges
- ✅ Share code flow (no signup)
- ✅ Three plan variants (Best Match / Hidden Gems / Wild Card)
- ✅ Voting with honest consensus narrative ("No fake consensus here")
- ✅ Taste DNA visualization
- ✅ Itinerary with time slots
- ⚠️ AI features (itinerary/narrative) fall back to templates without Nebius key
- ⚠️ Mobile responsiveness not tested

**Score: 7/10** (assistant estimate, not official)

### 3. Potential Impact
**Real problem, real audience?**

- Solves the universal "what should we do tonight?" group decision problem
- No signup = low friction for group use
- Honest AI labeling builds trust
- Could integrate with ticketing/delivery for monetization

**Score: 7/10** (assistant estimate, not official)

### 4. Quality of Idea
**Creative, non-obvious?**

- Group taste intersection is a known hard problem (social choice theory)
- Using cultural taste graphs (not just ratings) for group decisions is clever
- The "diversity guarantee" (per-person representation when no intersection exists) is an honest innovation
- Not just "another recommender" — it's a *consensus* tool

**Score: 8/10** (assistant estimate, not official)

---

## Honest Limitations (for Devpost)
1. Qloo Insights API is broken (returns 0); we use Search API instead.
2. AI itinerary/narrative need Nebius key (not set on demo).
3. Location precision for restaurants is approximate.
4. Single-favorite categories produce weaker picks than multi-favorite.

## Recommendation
**Submit-ready.** The core demo (one-click demo squad → plan with real picks → vote) works. The Taste Blend engine is a legitimate, skillful use of Qloo's taste data.
