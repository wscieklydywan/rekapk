import { db } from '@/lib/firebase';
import { deleteMessage, getMessages, getMessagesByIds, initDb, insertPendingMessage, upsertMessages } from '@/lib/sqlite';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';

export const useSqlMessages = (chatId: string, pageSize = 50) => {
  const [messages, setMessages] = useState<any[]>([]);
  const { user } = useAuth();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initDb();
        const cached = await getMessages(chatId, pageSize);
        if (!mounted) return;
        setMessages(cached.reverse()); // SQLite returns newest-first; UI prefers oldest-first
      } catch (e) { console.error('sqlite init error', e); }
    })();

    return () => { mounted = false; };
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !user) return;
    const messagesCollection = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesCollection, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, async (snap) => {
      try {
        const changes = snap.docChanges();
        if (!changes || changes.length === 0) return;
        const upserts: any[] = [];
        const deletes: string[] = [];
        const changedIds: string[] = [];
        for (const change of changes) {
          const d = change.doc.data() as any;
          const id = change.doc.id;
          if (change.type === 'removed') {
            deletes.push(id);
            changedIds.push(id);
          } else {
            upserts.push({ id, chatId, text: d.text, sender: d.sender, adminId: d.adminId || null, createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : (d.createdAt || Date.now()), pending: 0, extra: null });
            changedIds.push(id);
          }
        }
        // apply in sqlite in a batch
        if (upserts.length) await upsertMessages(upserts);
        for (const id of deletes) await deleteMessage(id);

        // fetch affected rows (small subset) and patch UI
        const rows = await getMessagesByIds(changedIds);
        // build a map of changed rows
        const map = new Map(rows.map(r => [r.id, r]));
        setMessages(prev => {
          const next = prev.slice();
          // integrate changes: replace or remove
          for (let i = 0; i < next.length; i++) {
            const item = next[i];
            if (map.has(item.id)) {
              next[i] = map.get(item.id);
              map.delete(item.id);
            }
          }
          // any remaining upserts -> insert in correct position by createdAt
          for (const [, r] of map) {
            next.push(r);
          }
          // sort oldest->newest
          next.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
          return next;
        });
      } catch (e) {
        console.error('sync error', e);
      }
    }, (err) => { console.error('onSnapshot err', err); });

    unsubRef.current = () => unsubscribe();
    return () => { try { unsubRef.current && unsubRef.current(); } catch(e){} };
  }, [chatId, user]);

  const sendMessage = async (text: string) => {
    if (!chatId || !user) return;
    const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const now = Date.now();
    // insert optimistic pending into sqlite
    await insertPendingMessage({ id: clientId, chatId, text, createdAt: now, clientId });
    setMessages(prev => {
      const next = prev.concat([{ id: clientId, chatId, text, sender: 'admin', createdAt: now, pending: 1 }]);
      next.sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
      return next;
    });

    try {
      const messagesCollection = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesCollection, { text, sender: 'admin', createdAt: serverTimestamp(), clientId });
    } catch (e) {
      console.error('sendMessage error', e);
    }
  };

  return { messages, sendMessage };
};

export default useSqlMessages;
