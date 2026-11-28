/**
 * Room codes (R-033, Creative Director 2026-11-28): 5 characters, upper case, from an alphabet without 0 / O / 1 / I / L,
 * so a code read out loud ("K, seven, P…") cannot be misheard or mistyped. Invite rooms use the code AS their room id
 * (DuelRoom sets `roomId`), so joining by code is the same joinById as before. Entry is case-insensitive.
 *
 * Old links (Colyseus' own 9-character, case-sensitive ids, e.g. `/play?room=i9-ZhFBcd`) still parse and are kept exactly.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
/** Any id the server may have made: codes, and Colyseus' default ids (letters, digits, - and _). */
const ID_RE = /^[\w-]{4,32}$/;

export const isRoomCode = (s: string) => CODE_RE.test(s);

/** A fresh code. `rand` returns [0, 1). */
export const newRoomCode = (rand: () => number = Math.random): string => {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  return s;
};

/** A code nobody holds: retries against `taken` (the rooms alive in this server process). */
export const uniqueRoomCode = (taken: (code: string) => boolean, rand: () => number = Math.random): string => {
  for (let i = 0; i < 50; i++) {
    const c = newRoomCode(rand);
    if (!taken(c)) return c;
  }
  // 31^5 = 28.6 million codes: 50 misses in a row means `rand` is broken; fall back to a longer id that cannot collide.
  return `${newRoomCode(rand)}${newRoomCode(rand)}`;
};

/**
 * What the player typed or pasted (a code, a link, or an old id) -> the room id to join and the region the link names.
 * A 5-character code is matched case-insensitively (spaces and dashes ignored: "k7p-2q"). Anything else that looks like an
 * id is kept as it is (old ids are case-sensitive). Null when it is neither.
 */
export const parseRoomInput = (text: string): { roomId: string; region?: string } | null => {
  const t = text.trim();
  if (!t) return null;
  let id = t;
  let region: string | undefined;
  const q = t.includes('room=') ? t.slice(t.indexOf('?') + 1) : null;
  if (q !== null) {
    const params = new URLSearchParams(q.includes('room=') ? q : '');
    id = params.get('room') ?? '';
    const r = params.get('r');
    if (r && /^[a-z0-9-]{2,12}$/.test(r)) region = r;
  }
  const squashed = id.replace(/[\s-]/g, '').toUpperCase();
  if (squashed.length === ROOM_CODE_LENGTH && isRoomCode(squashed)) return { roomId: squashed, region };
  if (ID_RE.test(id)) return { roomId: id, region };
  return null;
};

/** The id in a `/play?room=` link: a code is normalised to upper case, an old id is kept. Null when it is not an id. */
export const roomFromQuery = (room: string | undefined): string | undefined => {
  if (!room) return undefined;
  return parseRoomInput(room)?.roomId;
};
