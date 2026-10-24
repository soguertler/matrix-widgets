import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import type { WidgetApi } from '@matrix-widget-toolkit/api';
import { widgetUrlParam } from '@matrix-widgets/widget-shared';
import { EVENT_TYPE, isStroke, type Stroke } from '../model/game';

export type Packet =
  | { kind: 'presence'; player: string }
  | { kind: 'stroke'; stroke: Stroke; index: number }
  | { kind: 'draft'; stroke: Stroke; index: number }
  | { kind: 'clear'; index: number }
  | { kind: 'undo'; strokeId: string; index: number }
  | { kind: 'guess'; player: string; guess: string; index: number }
  | { kind: 'chat'; player: string; guess: string; index: number }
  | { kind: 'sync'; index: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const memberId = crypto.randomUUID();

function parsePacket(data: Uint8Array): Packet | null {
  if (data.byteLength > 16_000) return null;
  const packet: unknown = JSON.parse(decoder.decode(data));
  if (!packet || typeof packet !== 'object') return null;
  const value = packet as Record<string, unknown>;
  if (value.kind === 'presence')
    return typeof value.player === 'string' ? (packet as Packet) : null;
  if (!Number.isInteger(value.index)) return null;
  if (value.kind === 'clear' || value.kind === 'sync') return packet as Packet;
  if (value.kind === 'undo')
    return typeof value.strokeId === 'string' && value.strokeId.length <= 100
      ? (packet as Packet)
      : null;
  if (value.kind === 'guess' || value.kind === 'chat') {
    return typeof value.player === 'string' &&
      typeof value.guess === 'string' &&
      value.guess.length <= 80
      ? (packet as Packet)
      : null;
  }
  if (value.kind === 'stroke' || value.kind === 'draft') {
    return isStroke(value.stroke) ? (packet as Packet) : null;
  }
  return null;
}

export function useLiveRoom(
  api: WidgetApi | null,
  roomId: string | null,
  gameId: string | null,
  onPacket: (packet: Packet, identity: string) => void,
) {
  const callback = useRef(onPacket);
  callback.current = onPacket;
  const roomRef = useRef<Room | null>(null);
  const [state, setState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [error, setError] = useState('');
  const [identities, setIdentities] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!api || !roomId || !gameId) return;
    let alive = true;
    let announceTimer: number | undefined;
    setIdentities({});
    const room = new Room();
    roomRef.current = room;
    const player = widgetUrlParam('userId');
    const announce = () => {
      if (player)
        void room.localParticipant
          .publishData(encoder.encode(JSON.stringify({ kind: 'presence', player })), {
            reliable: true,
          })
          .catch(() => undefined);
    };
    room.on(RoomEvent.DataReceived, (data: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const packet = parsePacket(data);
        if (packet?.kind === 'presence' && participant?.identity) {
          setIdentities((current) => ({ ...current, [packet.player]: participant.identity }));
        } else if (packet && typeof packet.kind === 'string')
          callback.current(packet, participant?.identity ?? '');
      } catch {
        /* Ignore malformed data. */
      }
    });
    room.on(RoomEvent.ParticipantConnected, announce);
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      if (!alive) return;
      setIdentities((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([, identity]) => identity !== participant.identity),
        ),
      );
    });
    room.on(RoomEvent.Disconnected, () => {
      if (alive) setState('error');
    });
    async function connect() {
      setState('connecting');
      try {
        const transports = await api!.getRtcTransports();
        const livekit = transports.find((item) => item.type === 'livekit');
        const service = livekit?.livekit_service_url;
        if (typeof service !== 'string')
          throw new Error('The Matrix client did not provide a LiveKit service.');
        const openid = await api!.requestOpenIDConnectToken();
        if (!openid.access_token) throw new Error('OpenID permission was not granted.');
        const deviceId = widgetUrlParam('deviceId');
        if (!deviceId || deviceId.startsWith('$'))
          throw new Error('The widget URL needs a deviceId=$matrix_device_id parameter.');
        const response = await fetch(`${service.replace(/\/$/, '')}/get_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomId,
            slot_id: `${EVENT_TYPE}#${gameId}`,
            openid_token: openid,
            member: {
              id: memberId,
              claimed_user_id: widgetUrlParam('userId'),
              claimed_device_id: deviceId,
            },
          }),
        });
        if (!response.ok) throw new Error(`LiveKit authorization failed (${response.status}).`);
        const token = (await response.json()) as { url: string; jwt: string };
        await room.connect(token.url, token.jwt);
        if (alive) {
          setState('connected');
          setError('');
          announce();
          announceTimer = window.setInterval(announce, 5000);
        }
      } catch (cause) {
        if (alive) {
          setState('error');
          setError(String(cause));
        }
      }
    }
    void connect();
    return () => {
      alive = false;
      if (announceTimer !== undefined) window.clearInterval(announceTimer);
      roomRef.current = null;
      void room.disconnect();
    };
  }, [api, roomId, gameId]);

  async function send(packet: Packet, destination?: string) {
    const room = roomRef.current;
    if (!room || state !== 'connected') return false;
    try {
      await room.localParticipant.publishData(encoder.encode(JSON.stringify(packet)), {
        reliable: packet.kind !== 'draft',
        ...(destination ? { destinationIdentities: [destination] } : {}),
      });
      return true;
    } catch {
      return false;
    }
  }

  return { state, error, send, identities };
}
