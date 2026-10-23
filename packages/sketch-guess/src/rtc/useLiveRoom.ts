import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import type { WidgetApi } from 'matrix-widget-api';
import { widgetUrlParam } from '@widget-games/widget-shared';
import type { Stroke } from '../model/game';

export type Packet =
  | { kind: 'presence'; player: string }
  | { kind: 'stroke'; stroke: Stroke; index: number }
  | { kind: 'clear'; index: number }
  | { kind: 'guess'; player: string; guess: string; index: number }
  | { kind: 'chat'; player: string; guess: string; index: number }
  | { kind: 'sync'; index: number };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const memberId = crypto.randomUUID();

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
    const room = new Room();
    roomRef.current = room;
    const player = widgetUrlParam('userId');
    const announce = () => {
      if (player)
        void room.localParticipant.publishData(
          encoder.encode(JSON.stringify({ kind: 'presence', player })),
          { reliable: true },
        );
    };
    room.on(RoomEvent.DataReceived, (data: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const packet = JSON.parse(decoder.decode(data)) as Packet;
        if (packet?.kind === 'presence' && participant?.identity) {
          setIdentities((current) => ({ ...current, [packet.player]: participant.identity }));
        } else if (packet && typeof packet.kind === 'string')
          callback.current(packet, participant?.identity ?? '');
      } catch {
        /* Ignore malformed data. */
      }
    });
    room.on(RoomEvent.ParticipantConnected, announce);
    room.on(RoomEvent.Disconnected, () => {
      if (alive) setState('error');
    });
    async function connect() {
      setState('connecting');
      try {
        const transports = await api!.getRtcTransports();
        const livekit = transports.rtc_transports.find((item) => item.type === 'livekit');
        const service = livekit?.livekit_service_url;
        if (typeof service !== 'string')
          throw new Error('The Matrix client did not provide a LiveKit service.');
        const openid = await api!.requestOpenIDConnectToken();
        if (!openid.access_token) throw new Error('OpenID permission was not granted.');
        const deviceId = widgetUrlParam('deviceId') ?? 'widget-device';
        const response = await fetch(`${service.replace(/\/$/, '')}/get_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: roomId,
            slot_id: `com.widget_games.sketch_guess#${gameId}`,
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
      roomRef.current = null;
      void room.disconnect();
    };
  }, [api, roomId, gameId]);

  async function send(packet: Packet, destination?: string) {
    const room = roomRef.current;
    if (!room || state !== 'connected') return false;
    await room.localParticipant.publishData(encoder.encode(JSON.stringify(packet)), {
      reliable: true,
      ...(destination ? { destinationIdentities: [destination] } : {}),
    });
    return true;
  }

  return { state, error, send, identities };
}
