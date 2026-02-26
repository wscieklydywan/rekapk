
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { isPendingDelete } from '@/lib/pendingDeletes';
import sqlite from '@/lib/sqlite';
import { Chat } from '@/schemas';
import { collection, deleteDoc, doc, getDocs, limit, onSnapshot, orderBy, query, startAfter, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';

export const useChats = ({ pageSize = 30 }: { pageSize?: number } = {}) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const { user } = useAuth();

  // Track last visible doc for pagination
  const lastVisibleSnapshotRef = useRef<any | null>(null);
  const lastLoadedSnapshotRef = useRef<any | null>(null);

  useEffect(() => {
    try { console.log('useChats: effect mount'); } catch (e) { }
    if (!user) {
      setChats([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    let unsub: (() => void) | null = null;

    (async () => {
      try {
        const local = await sqlite.getChats(pageSize);
        try { console.log('LOCAL SQLITE CHATS:', (local || []).length); } catch (e) { /* ignore logging errors */ }
        if (!cancelled && local && local.length > 0) {
          setChats(local as unknown as Chat[]);
          setLoading(false);
          setHasMore(local.length >= pageSize);
        }
      } catch (e) {
        /* ignore sqlite errors */
      }

      setLoading(true);
      const chatsCollection = collection(db, 'chats');
      const q = query(
        chatsCollection,
        orderBy('lastActivity', 'desc'),
        limit(pageSize)
      );

      unsub = onSnapshot(q, (snapshot) => {
        const snapshotChats = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            status: data.status,
            createdAt: data.createdAt,
            lastActivity: data.lastActivity,
            lastMessage: data.lastMessage || '',
            lastMessageSender: data.lastMessageSender || null,
            lastMessageTimestamp: data.lastMessageTimestamp || null,
            operatorId: data.operatorId,
            operatorJoinedAt: data.operatorJoinedAt,
            userInfo: data.userInfo,
            userActive: data.userActive,
            closedBy: data.closedBy,
            rating: data.rating,
            feedback: data.feedback,
            adminTyping: data.adminTyping,
            adminUnread: data.adminUnread,
            userUnread: data.userUnread,
            activeAdminId: data.activeAdminId || null,
            assignedAdminId: data.assignedAdminId || null,
            isBlocked: data.isBlocked || false,
            userUid: data.userUid || null,
            userIsBanned: typeof data.userIsBanned === 'boolean' ? data.userIsBanned : false,
            bannedUntil: data.bannedUntil || null,
            banReason: data.banReason || null,
            bannedAt: data.bannedAt || null,
            lastPushAt: data.lastPushAt || null,
          } as Chat;
        }).filter(c => !isPendingDelete(c.id));

        // Preserve older (already loaded) chats that are not included in the live snapshot.
        // Use functional update to avoid stale-closure overwrites of locally-hydrated chats.
        const liveIds = new Set(snapshotChats.map(c => c.id));
        setChats(prev => {
          const merged = [...snapshotChats, ...prev.filter(c => !liveIds.has(c.id) && !isPendingDelete(c.id))];
          return merged;
        });
        setLoading(false);

        // persist to sqlite for offline
        try { sqlite.upsertChats(snapshotChats).catch(() => {}); } catch (e) { /* ignore */ }

        // update last visible snapshot for pagination (use the last doc in the snapshot)
        if (snapshot.docs.length > 0) {
          lastVisibleSnapshotRef.current = snapshot.docs[snapshot.docs.length - 1];
        }

        // If fewer docs than pageSize were returned, there may still be older pages, don't assume end
        setHasMore(snapshot.docs.length >= pageSize);
      }, (error) => {
        console.error('Błąd podczas pobierania czatów: ', error);
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      try { if (unsub) unsub(); } catch (e) { /* ignore */ }
    };
  }, [user, pageSize]);

  const loadMore = async () => {
    if (isLoadingMore) return;
    if (!lastVisibleSnapshotRef.current && !lastLoadedSnapshotRef.current) {
      // nothing to paginate from
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const startAfterArg = lastLoadedSnapshotRef.current || lastVisibleSnapshotRef.current;
      const chatsCollection = collection(db, 'chats');
      const q = query(
        chatsCollection,
        orderBy('lastActivity', 'desc'),
        startAfter(startAfterArg),
        limit(pageSize)
      );

      const snap = await getDocs(q);
      if (snap.empty) {
        setHasMore(false);
      } else {
        const docs = snap.docs;
        const older = docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as Chat)).filter(m => !!(m.id) && !isPendingDelete(m.id));
        // Append older messages to the end of the list
        setChats(prev => [...prev, ...older]);
        // update last loaded snapshot (used for subsequent pagination)
        lastLoadedSnapshotRef.current = docs[docs.length - 1];
        setHasMore(docs.length === pageSize);
      }
    } catch (error) {
      console.error('Error loading older chats:', error);
    }
    setLoadingMore(false);
  };

  const updateChatStatus = async (chatId: string, status: string) => {
    const chatRef = doc(db, 'chats', chatId);
    await updateDoc(chatRef, { status });
  };

  const deleteChat = async (chatId: string) => {
    const chatRef = doc(db, 'chats', chatId);
    await deleteDoc(chatRef);
  };

  return { chats, setChats, loading, isLoadingMore, hasMore, loadMore, updateChatStatus, deleteChat };
};
