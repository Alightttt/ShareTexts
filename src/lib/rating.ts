/**
 * The app's own rating — small, local, honest.
 *
 * There is no accounts system here, and no server-side profile to attach a
 * rating to, so this deliberately does NOT pretend to be an app-store score.
 * What it is:
 *
 *   · YOUR rating. It starts at 3 (a starting point, not a claim), and moves
 *     the moment you tap a star.
 *   · Stored on this device only (localStorage), never sent anywhere.
 *   · Read back defensively: anything malformed in storage is discarded
 *     rather than trusted, values are clamped to 1–5, integers only, and the
 *     history is capped so a stray script can't grow it without bound.
 *
 * When the app does have a real aggregate to show (a server-side tally), the
 * component already takes an `average`/`count` override — the number in the
 * UI would then be other people's, and this file would keep only the "your
 * rating" half.
 */

const KEY = 'sharetext.rating.v1';
const MUTE_KEY = 'sharetext.rating.mute.v1';
const USED_KEY = 'sharetext.used.v1';

/** Where the stars sit before anyone has rated. Asked for, and disclosed. */
export const RATING_SEED = 3;

/** How many votes one device may contribute to its own tally. */
const MAX_VOTES = 50;

/** "Not now" is a snooze, not a refusal: it comes back after this long. */
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export type RatingState = {
  /** The user's current (or seeded) rating, always an integer 1–5. */
  mine: number;
  /** True once the user has actually rated. */
  rated: boolean;
  /** Every valid rating this device has cast. */
  votes: number[];
  /** Mean of the real votes, or null when there are none. */
  average: number | null;
  count: number;
  /** Hidden by an explicit "don't ask again". */
  muted: boolean;
};

function clampStar(n: unknown): number | null {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  return i >= 1 && i <= 5 ? i : null;
}

function readVotes(): number[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { votes?: unknown }).votes)
        ? (parsed as { votes: unknown[] }).votes
        : [];
    return list.map(clampStar).filter((v): v is number => v !== null).slice(-MAX_VOTES);
  } catch {
    return [];
  }
}

function writeVotes(votes: number[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ votes: votes.slice(-MAX_VOTES), at: Date.now() }));
  } catch {
    /* storage unavailable (private mode, quota) — the rating is a nicety */
  }
}

function readMute(): boolean {
  try {
    if (localStorage.getItem(MUTE_KEY) === 'never') return true;
    const at = Number(localStorage.getItem(MUTE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/** Called once the app has actually been used (a room that ended). */
export function markAppUsed() {
  try {
    localStorage.setItem(USED_KEY, '1');
  } catch {
    /* not fatal */
  }
}

export function hasUsedApp(): boolean {
  try {
    return localStorage.getItem(USED_KEY) === '1';
  } catch {
    return false;
  }
}

export function initialRatingState(): RatingState {
  const votes = readVotes();
  const count = votes.length;
  return {
    mine: count > 0 ? votes[count - 1] : RATING_SEED,
    rated: count > 0,
    votes,
    average: count > 0 ? votes.reduce((a, b) => a + b, 0) / count : null,
    count,
    muted: readMute(),
  };
}

/** Add (or add to) this device's tally. */
export function castRating(state: RatingState, star: number): RatingState {
  const value = clampStar(star);
  if (value === null) return state;
  const votes = [...state.votes, value].slice(-MAX_VOTES);
  writeVotes(votes);
  return {
    ...state,
    mine: value,
    rated: true,
    votes,
    average: votes.reduce((a, b) => a + b, 0) / votes.length,
    count: votes.length,
  };
}

/** "Not now" (snoozed) or "don't ask again" (permanent). */
export function silenceRating(state: RatingState, forever: boolean): RatingState {
  try {
    localStorage.setItem(MUTE_KEY, forever ? 'never' : String(Date.now()));
  } catch {
    /* not fatal */
  }
  return { ...state, muted: true };
}
