// In-memory squad store with JSON file persistence (survives restarts).
import fs from "node:fs";
import path from "node:path";

export interface Member {
  name: string;
  favorites: string[]; // e.g. ["Interstellar", "A.R. Rahman", "biryani"]
  joinedAt: string;
}

export interface SavedPlan {
  // Stored as plain JSON (serializable); typed loosely on purpose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plan: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trendingTwist: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itinerary: any;
  itineraryAI: boolean;
  qloo: string;
  members: number;
  generatedAt: string;
}

export type VoteChoice = "love" | "fine" | "veto";

export interface Vote {
  member: string;
  choice: VoteChoice;
  at: string;
}

export interface Squad {
  id: string;
  code: string; // short share code, e.g. "KX7Q2M"
  name: string;
  vibe: string; // chill | party | cozy | adventure
  location: string;
  createdAt: string;
  members: Member[];
  savedPlan?: SavedPlan;
  votes: Vote[];
}

const DATA_FILE =
  process.env.SQUAD_DATA_FILE ?? path.join(process.cwd(), "squadvibe-data.json");

const squads = new Map<string, Squad>();
const byCode = new Map<string, string>();

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify([...squads.values()], null, 2));
  } catch {
    /* best effort */
  }
}

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const arr = JSON.parse(raw) as Squad[];
    for (const s of arr) {
      squads.set(s.id, s);
      byCode.set(s.code, s.id);
    }
  } catch {
    /* fresh start */
  }
}

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function rcode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return byCode.has(c) ? rcode() : c;
}

export function createSquad(name: string, vibe: string, location: string): Squad {
  const s: Squad = {
    id: rid(),
    code: rcode(),
    name: name.trim().slice(0, 60) || "Squad Night",
    vibe: ["chill", "party", "cozy", "adventure"].includes(vibe) ? vibe : "chill",
    location: location.trim().slice(0, 60),
    createdAt: new Date().toISOString(),
    members: [],
    votes: [],
  };
  squads.set(s.id, s);
  byCode.set(s.code, s.id);
  persist();
  return s;
}

export function getSquad(id: string): Squad | null {
  return squads.get(id) ?? (byCode.get(id.toUpperCase()) ? squads.get(byCode.get(id.toUpperCase())!) ?? null : null);
}

export function addMember(id: string, name: string, favorites: string[]): Squad | null {
  const s = getSquad(id);
  if (!s) return null;
  const cleanName = name.trim().slice(0, 30) || `Friend ${s.members.length + 1}`;
  const cleanFavs = favorites
    .map((f) => f.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 5);
  if (cleanFavs.length === 0) return null;
  // Replace if same name rejoins (lets people update their taste)
  const idx = s.members.findIndex(
    (m) => m.name.toLowerCase() === cleanName.toLowerCase()
  );
  const member: Member = {
    name: cleanName,
    favorites: cleanFavs,
    joinedAt: new Date().toISOString(),
  };
  if (idx >= 0) s.members[idx] = member;
  else s.members.push(member);
  persist();
  return s;
}

export function castVote(id: string, member: string, choice: string): { tally: Record<string, number>; votes: Vote[] } | null {
  const s = getSquad(id);
  if (!s) return null;
  const c = (choice === "love" || choice === "veto" ? choice : "fine") as VoteChoice;
  const cleanMember = member.trim().slice(0, 30) || "Anonymous";
  if (!s.votes) s.votes = [];
  // One vote per member — update if they change their mind
  const idx = s.votes.findIndex((v) => v.member.toLowerCase() === cleanMember.toLowerCase());
  const vote: Vote = { member: cleanMember, choice: c, at: new Date().toISOString() };
  if (idx >= 0) s.votes[idx] = vote;
  else s.votes.push(vote);
  persist();
  return { tally: voteTally(s), votes: s.votes };
}

export function voteTally(s: Squad): Record<string, number> {
  const t: Record<string, number> = { love: 0, fine: 0, veto: 0 };
  for (const v of s.votes ?? []) {
    if (v.choice in t) t[v.choice] += 1;
  }
  return t;
}

export function getVotes(id: string): { tally: Record<string, number>; votes: Vote[] } | null {
  const s = getSquad(id);
  if (!s) return null;
  return { tally: voteTally(s), votes: s.votes ?? [] };
}

export function publicSquad(s: Squad) {
  const { savedPlan, ...pub } = s;
  return { ...pub, hasPlan: !!savedPlan };
}

export function removeMember(id: string, name: string): Squad | null {
  const s = getSquad(id);
  if (!s) return null;
  const idx = s.members.findIndex(
    (m) => m.name.toLowerCase() === name.toLowerCase()
  );
  if (idx < 0) return null;
  s.members.splice(idx, 1);
  // Invalidate saved plan — squad changed
  delete s.savedPlan;
  persist();
  return s;
}

export function savePlan(id: string, plan: SavedPlan): boolean {
  const s = squads.get(id);
  if (!s) return false;
  s.savedPlan = plan;
  s.votes = []; // new plan = fresh vote
  persist();
  return true;
}

export function getSavedPlan(id: string): SavedPlan | null {
  return squads.get(id)?.savedPlan ?? null;
}

// --- Demo squad: one-click judge-friendly seed ---
const DEMO_MEMBERS: Array<{ name: string; favorites: string[] }> = [
  { name: "Aarav", favorites: ["Interstellar", "A.R. Rahman", "biryani"] },
  { name: "Diya", favorites: ["Dune", "The Weeknd", "pizza"] },
  { name: "Kabir", favorites: ["3 Idiots", "Prateek Kuhad", "momos"] },
];

export function createDemoSquad(): Squad {
  const s = createSquad("Demo: Friday Night", "party", "Pune");
  for (const m of DEMO_MEMBERS) {
    s.members.push({
      name: m.name,
      favorites: m.favorites,
      joinedAt: new Date().toISOString(),
    });
  }
  persist();
  return s;
}

load();
