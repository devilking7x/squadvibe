// In-memory squad store with JSON file persistence (survives restarts).
import fs from "node:fs";
import path from "node:path";

export interface Member {
  name: string;
  favorites: string[]; // e.g. ["Interstellar", "A.R. Rahman", "biryani"]
  joinedAt: string;
}

export interface Squad {
  id: string;
  code: string; // short share code, e.g. "KX7Q2M"
  name: string;
  vibe: string; // chill | party | cozy | adventure
  location: string;
  createdAt: string;
  members: Member[];
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

export function publicSquad(s: Squad) {
  const { ...pub } = s;
  return pub;
}

load();
