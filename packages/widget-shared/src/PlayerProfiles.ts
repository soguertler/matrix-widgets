import { useEffect, useState } from 'react';
import type { WidgetApi } from '@matrix-widget-toolkit/api';

export type MemberProfile = { name: string; avatar?: string };

export function displayName(userId: string): string {
  return userId.match(/^@([^:]+):/)?.[1] ?? userId;
}

export function useRoomMemberProfiles(
  api: WidgetApi | null,
  connected: boolean,
  playerIds: string[],
) {
  const [members, setMembers] = useState<Record<string, MemberProfile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const avatarKey = playerIds.map((id) => `${id}:${members[id]?.avatar ?? ''}`).join('|');

  useEffect(() => {
    if (!api || !connected) return;
    let alive = true;
    async function refresh() {
      try {
        const roomMembers = await api!.receiveStateEvents<Record<string, unknown>>('m.room.member');
        if (!alive) return;
        const profiles: Record<string, MemberProfile> = {};
        for (const member of [...roomMembers].sort(
          (a, b) => b.origin_server_ts - a.origin_server_ts,
        )) {
          if (
            !member.state_key ||
            member.content['membership'] !== 'join' ||
            profiles[member.state_key]
          )
            continue;
          const displayname = member.content['displayname'];
          const avatar = member.content['avatar_url'];
          profiles[member.state_key] = {
            name:
              typeof displayname === 'string' && displayname.trim()
                ? displayname
                : displayName(member.state_key),
            ...(typeof avatar === 'string' ? { avatar } : {}),
          };
        }
        setMembers(profiles);
      } catch {
        // Matrix IDs remain available if the client does not grant room member state.
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [api, connected]);

  useEffect(() => {
    if (!api || !connected || playerIds.length === 0) return;
    let alive = true;
    const urls: string[] = [];
    const avatars = new Map(
      playerIds
        .map((id) => [id, members[id]?.avatar])
        .filter((item): item is [string, string] => !!item[1]),
    );
    void Promise.all(
      [...avatars].map(async ([id, uri]) => {
        try {
          const response = await api.downloadFile(uri);
          if (!(response.file instanceof Blob)) return;
          const url = URL.createObjectURL(response.file);
          urls.push(url);
          if (alive) setAvatarUrls((current) => ({ ...current, [id]: url }));
        } catch {
          // Initials are shown when media download is unavailable.
        }
      }),
    );
    return () => {
      alive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [api, connected, avatarKey]);

  return { members, avatarUrls };
}
