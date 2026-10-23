import { validEntry, type Stroke } from '../model/game.ts';

export type TurnDraft = { text: string; strokes: Stroke[] };

function key(gameId: string, round: number, userId: string): string {
  return `doodle-phone:draft:${gameId}:${round}:${userId}`;
}

export function readTurnDraft(gameId: string, round: number, userId: string): TurnDraft {
  try {
    const raw = sessionStorage.getItem(key(gameId, round, userId));
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (value && typeof value === 'object') {
        const draft = value as Partial<TurnDraft>;
        return {
          text: typeof draft.text === 'string' ? draft.text.slice(0, 180) : '',
          strokes:
            Array.isArray(draft.strokes) &&
            (draft.strokes.length === 0 ||
              validEntry({ kind: 'drawing', strokes: draft.strokes }, 'drawing'))
              ? draft.strokes
              : [],
        };
      }
    }
  } catch {
    // Some Matrix clients block storage inside widgets.
  }
  return { text: '', strokes: [] };
}

export function saveTurnDraft(
  gameId: string,
  round: number,
  userId: string,
  draft: TurnDraft,
): void {
  try {
    sessionStorage.setItem(key(gameId, round, userId), JSON.stringify(draft));
  } catch {
    // The current turn remains in memory when storage is unavailable.
  }
}

export function clearTurnDraft(gameId: string, round: number, userId: string): void {
  try {
    sessionStorage.removeItem(key(gameId, round, userId));
  } catch {
    // Storage may be unavailable.
  }
}
