import { useEffect, useState } from 'react';
import type { WidgetApi } from 'matrix-widget-api';
import type { Game } from './game';

export type MemberProfile = { name: string; avatar?: string };

export function displayName(userId: string): string {
  return userId.match(/^@([^:]+):/)?.[1] ?? userId;
}

export function usePlayerProfiles(api: WidgetApi | null, connected: boolean, game: Game | null) {
  const [members, setMembers] = useState<Record<string, MemberProfile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const avatarKey = game?.phase === 'lobby'
    ? game.joined.map((id) => `${id}:${members[id]?.avatar ?? ''}`).join('|') : '';

  useEffect(() => {
    if (!api || !connected) return;
    let alive = true;
    async function refresh() {
      try {
        const roomMembers = await api!.readStateEvents('m.room.member');
        if (!alive) return;
        const profiles: Record<string, MemberProfile> = {};
        for (const member of roomMembers) {
          if (!member.state_key || member.content.membership !== 'join') continue;
          profiles[member.state_key] = {
            name: typeof member.content.displayname === 'string' && member.content.displayname.trim()
              ? member.content.displayname : displayName(member.state_key),
            avatar: typeof member.content.avatar_url === 'string' ? member.content.avatar_url : undefined,
          };
        }
        setMembers(profiles);
      } catch {
        // Matrix IDs remain available if the client does not grant room member state.
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [api, connected]);

  useEffect(() => {
    if (!api || !connected || !game || game.phase !== 'lobby') return;
    let alive = true;
    const urls: string[] = [];
    const avatars = new Map(game.joined.map((id) => [id, members[id]?.avatar]).filter((item): item is [string, string] => !!item[1]));
    void Promise.all([...avatars].map(async ([id, uri]) => {
      try {
        const response = await api.downloadFile(uri);
        if (!(response.file instanceof Blob)) return;
        const url = URL.createObjectURL(response.file);
        urls.push(url);
        if (alive) setAvatarUrls((current) => ({ ...current, [id]: url }));
      } catch {
        // Initials are shown when media download is unavailable.
      }
    }));
    return () => { alive = false; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [api, connected, game?.id, game?.phase, avatarKey]);

  return { members, avatarUrls };
}
