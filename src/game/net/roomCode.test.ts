import { isRoomCode, newRoomCode, parseRoomInput, ROOM_CODE_ALPHABET, roomFromQuery, uniqueRoomCode } from './roomCode';

describe('room codes (R-033)', () => {
  it('5 upper-case characters with no 0, O, 1, I or L', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 500; i++) {
      const c = newRoomCode();
      expect(c).toMatch(/^[A-Z2-9]{5}$/);
      expect(c).not.toMatch(/[01OIL]/);
      expect(isRoomCode(c)).toBe(true);
    }
  });

  it('typed in any case, with spaces or a dash, it is the same code', () => {
    expect(parseRoomInput('k7p2q')).toEqual({ roomId: 'K7P2Q' });
    expect(parseRoomInput(' K7P-2Q ')).toEqual({ roomId: 'K7P2Q' });
    expect(parseRoomInput('k7 p2 q')).toEqual({ roomId: 'K7P2Q' });
  });

  it('a pasted link: code (any case) and region come out', () => {
    expect(parseRoomInput('https://pewfield.nalbakigames.com/play?room=k7p2q&r=iad')).toEqual({ roomId: 'K7P2Q', region: 'iad' });
    expect(parseRoomInput('pewfield.nalbakigames.com/play?room=K7P2Q')).toEqual({ roomId: 'K7P2Q' });
  });

  it('old links with Colyseus ids still parse, exactly as they were (case kept)', () => {
    expect(parseRoomInput('https://pewfield.nalbakigames.com/play?room=i9-ZhFBcd')).toEqual({ roomId: 'i9-ZhFBcd' });
    expect(parseRoomInput('AbC12xyz9')).toEqual({ roomId: 'AbC12xyz9' });
    expect(roomFromQuery('i9-ZhFBcd')).toBe('i9-ZhFBcd');
    expect(roomFromQuery('k7p2q')).toBe('K7P2Q');
  });

  it('garbage is refused', () => {
    expect(parseRoomInput('')).toBeNull();
    expect(parseRoomInput('<script>')).toBeNull();
    expect(parseRoomInput('ab')).toBeNull();
    expect(roomFromQuery(undefined)).toBeUndefined();
  });

  it('a code already held is not handed out twice', () => {
    const seq = [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const rand = () => seq[i++ % seq.length];
    expect(uniqueRoomCode((c) => c === 'AAAAA', rand)).toBe('SSSSS');
  });
});
