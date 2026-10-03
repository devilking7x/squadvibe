// Live squad room events (Server-Sent Events).
// When a friend joins or a plan is generated, everyone watching the squad
// page sees it instantly — no refresh.

export type SquadEvent =
  | { type: "member_joined"; member: string; memberCount: number }
  | { type: "plan_ready"; memberCount: number }
  | { type: "ping" };

type Listener = (ev: SquadEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(squadId: string, fn: Listener): () => void {
  let set = listeners.get(squadId);
  if (!set) {
    set = new Set();
    listeners.set(squadId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(squadId);
  };
}

export function broadcast(squadId: string, ev: SquadEvent): void {
  const set = listeners.get(squadId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(ev);
    } catch {
      /* drop broken listener */
    }
  }
}
