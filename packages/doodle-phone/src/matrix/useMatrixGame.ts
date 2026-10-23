import { useRoomEventChannel } from '@widget-games/widget-shared';
import {
  GAME_EVENT,
  gameEventBytes,
  MAX_GAME_EVENT_BYTES,
  type GameAction,
  type GameEvent,
} from '../model/game';
import { readCurrentGameEvents } from './GameEvents';

export function useMatrixGame(widgetId: string | null, enabled: boolean) {
  const channel = useRoomEventChannel<GameEvent, GameAction>({
    widgetId,
    enabled,
    eventType: GAME_EVENT,
    readEvents: readCurrentGameEvents,
    validateAction: (action) =>
      gameEventBytes(action as GameAction) > MAX_GAME_EVENT_BYTES
        ? 'This drawing is too large to send. Undo a fill or simplify it.'
        : null,
    readErrorLabel: 'Could not read game state',
    sendErrorLabel: 'Could not save turn',
    permissionError:
      'The Matrix client did not grant permission to send and receive game events. Review this widget’s permissions in your client, then reopen it.',
  });
  return { ...channel, gameStateReady: channel.stateReady };
}
