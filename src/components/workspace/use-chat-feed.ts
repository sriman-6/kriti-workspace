'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatDetail, ChatGroup } from '@/lib/services/chat';

export function useChatFeed(
  groupId: string,
  initial: ChatDetail | null,
  thread?: string,
  search?: string,
) {
  const [detail, setDetail] = useState(initial);
  const [groups, setGroups] = useState<ChatGroup[] | null>(null);
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const refresh = useCallback(
    async (before?: string, message?: string) => {
      const requestGeneration = generation.current;
      if (pending.current === requestGeneration && !before && !message) return;
      if (!before && !message) pending.current = requestGeneration;
      try {
        const query = new URLSearchParams();
        if (thread) query.set('thread', thread);
        if (search) query.set('search', search);
        if (before) query.set('before', before);
        if (message) query.set('message', message);
        const response = await fetch(`/api/groups/${groupId}?${query}`, {
          cache: 'no-store',
        });
        const data = (await response.json().catch(() => null)) as {
          detail: ChatDetail;
          groups: ChatGroup[];
          error?: string;
        } | null;
        if (!response.ok || !data?.detail)
          throw new Error(
            data?.error ??
              'Unable to refresh messages. Your draft is still here.',
          );
        if (!alive.current || requestGeneration !== generation.current) return;
        setDetail((previous) => {
          const messages = new Map(
            previous?.messages.map((message) => [message.id, message]),
          );
          for (const message of data.detail.messages)
            if (!thread || message.parentId === thread)
              messages.set(message.id, message);
          return {
            ...data.detail,
            hasOlder:
              before || !previous?.messages.length
                ? data.detail.hasOlder
                : previous.hasOlder,
            messages: [...messages.values()].sort(
              (a, b) =>
                a.sortKey.localeCompare(b.sortKey) || a.id.localeCompare(b.id),
            ),
          };
        });
        setGroups(data.groups);
        setError('');
      } catch (cause) {
        if (alive.current && requestGeneration === generation.current)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to refresh messages.',
          );
      } finally {
        if (!before && !message && pending.current === requestGeneration)
          pending.current = null;
      }
    },
    [groupId, thread, search],
  );
  useEffect(() => {
    alive.current = true;
    generation.current++;
    // Refresh after the initial paint; Strict Mode can cancel its first mount.
    const initialRefresh = setTimeout(() => {
      void refresh();
    }, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 5000);
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive.current = false;
      clearTimeout(initialRefresh);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return {
    detail,
    groups,
    error,
    refresh,
    refreshMessage: (id: string) => refresh(undefined, id),
    loadingOlder,
    loadOlder: () => {
      if (!loadingOlder && detail?.messages[0]) {
        setLoadingOlder(true);
        void refresh(detail.messages[0].id).finally(() => {
          if (alive.current) setLoadingOlder(false);
        });
      }
    },
  };
}
