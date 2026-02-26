import { db } from '@/lib/firebase';
import sqlite from '@/lib/sqlite';
import { Message } from '@/schemas';
import NetInfo from '@react-native-community/netinfo';
import { collection, doc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, Timestamp, writeBatch } from 'firebase/firestore';
import { create } from 'zustand';

type ChatState = {
  messagesByChat: { [chatId: string]: Message[] | undefined };
  pendingByChat: { [chatId: string]: Message[] };
  // lightweight session metadata for LRU cache
  sessionsMeta: { [chatId: string]: { loaded: boolean; lastAccessed: number } };
  ensureChatLoaded: (chatId: string) => Promise<void>;
  // openChat: load lightweight cached messages from SQLite (fast, used on pressIn)
  openChat: (chatId: string) => Promise<void>;
  preloadChat: (chatId: string) => Promise<void>;
  upsertMessages: (chatId: string, messages: Message[]) => void;
  appendOlderMessages: (chatId: string, older: Message[]) => void;
  unsubscribeChat: (chatId: string) => void;
  sendMessage: (chatId: string, text: string) => Promise<void>;
};

const storeUnsubs: { [chatId: string]: (() => void) | null } = {};
// pagination cursors per chat (DocumentSnapshot of the last doc in the current window)
const storeCursors: { [chatId: string]: any | null } = {};
const storeHasMore: { [chatId: string]: boolean } = {};
const storeInitPromises: { [chatId: string]: { promise: Promise<void>; resolve: (() => void) | null; resolved?: boolean } | undefined } = {};

export const useChatStore = create<ChatState>((set: any, get: any) => ({
  messagesByChat: {},
  pendingByChat: {},
  sessionsMeta: {},
  ensureChatLoaded: (chatId: string) => {
    console.log('ensureChatLoaded called for', chatId);
    if (!chatId) return Promise.resolve();

    // If messages already loaded, resolve immediately
    const existing = get().messagesByChat[chatId];
    if (existing !== undefined) return Promise.resolve();

    // If there's an in-flight init promise, return it
    if (storeInitPromises[chatId]) return storeInitPromises[chatId]!.promise;

    // Create resolving function and promise first to avoid race conditions
    let resolveFn: (() => void) | null = null;
    const p = new Promise<void>((resolve) => { resolveFn = resolve; });

    storeInitPromises[chatId] = { promise: p, resolve: resolveFn, resolved: false } as any;

    console.log('ensureChatLoaded building query for', chatId);
    // subscribe to newest messages only to avoid unbounded memory for large chats
    // We query newest-first and limit to 50; upserts will be merged into store and UI sorts as needed.
    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(50));

    // Attach snapshot only when we have network connectivity to avoid Firestore internal errors
    (async () => {
      // helper to attach the snapshot listener
      const attachSnapshot = () => {
        try {
          const unsub = onSnapshot(q, (snap) => {
            console.log('onSnapshot callback for', chatId, 'SNAPSHOT size:', snap.size);
            try {
              try {
                const ids = snap.docs.map(d => d.id);
                console.log('onSnapshot docs ids sample:', ids.slice(0,5));
                if (snap.docs[0]) {
                  try { console.debug('onSnapshot first doc data sample:', snap.docs[0].data()); } catch (e) { /* ignore */ }
                }
              } catch (e) { /* ignore */ }

              const changes = snap.docChanges();
              if (changes && changes.length) {
                const newMessages: Message[] = [];
                for (const ch of changes) {
                  if (ch.type === 'added' || ch.type === 'modified') {
                    const d = ch.doc;
                    newMessages.push({ ...(d.data() as any), id: d.id, chatId } as Message);
                  }
                }

                if (newMessages.length > 0) {
                  console.log('onSnapshot found new/modified messages for', chatId, 'len=', newMessages.length);

                  // 1) Update Zustand first (upsert semantics)
                  try {
                    (get().upsertMessages as any)(chatId, newMessages);
                  } catch (e) {
                    console.error('upsertMessages error', e);
                  }

                  // 2) Persist to SQLite only as cache (fire-and-forget)
                  try {
                    const upserts = (newMessages || []).map(r => ({
                      id: r.id,
                      chatId,
                      text: (r as any).text || null,
                      sender: (r as any).sender || null,
                      adminId: (r as any).adminId || null,
                      createdAt: (r as any).createdAt && (r as any).createdAt.toMillis ? (r as any).createdAt.toMillis() : Date.now(),
                      pending: 0,
                      extra: null
                    }));
                    if (upserts.length) sqlite.upsertMessages(upserts).catch((err:any) => console.error('sqlite.upsertMessages err', err));
                  } catch (e) { /* ignore sqlite errors */ }
                }
              }

              // resolve the init promise on first snapshot
              const entry = storeInitPromises[chatId];
              if (entry && !entry.resolved) {
                entry.resolved = true;
                const r = entry.resolve;
                entry.resolve = null;
                try { r && r(); } catch (e) { /* ignore */ }
              }

              // set pagination cursor to the oldest doc in the batch (snap is desc order)
              try {
                if (snap.docs && snap.docs.length) {
                  storeCursors[chatId] = snap.docs[snap.docs.length - 1];
                  storeHasMore[chatId] = (snap.size || 0) >= 50; // if we hit limit, there may be more
                  console.log('ensureChatLoaded set cursor for', chatId, 'hasMore=', storeHasMore[chatId]);
                } else {
                  storeCursors[chatId] = null;
                  storeHasMore[chatId] = false;
                }
              } catch (e) { /* ignore */ }
            } catch (e) {
              console.error('chatStore onSnapshot error', e);
            }
          }, (err) => {
            console.error('chatStore onSnapshot err', err);
            // on error, resolve to avoid blocking navigation
            const entry = storeInitPromises[chatId];
            if (entry && !entry.resolved) {
              entry.resolved = true;
              const r = entry.resolve;
              entry.resolve = null;
              try { r && r(); } catch (e) { /* ignore */ }
            }
          });

          storeUnsubs[chatId] = unsub;
          console.log('onSnapshot registered for', chatId);
        } catch (e) {
          console.error('attachSnapshot error', e);
        }
      };

      try {
        const state = await NetInfo.fetch();
        const hasInternet = state.isConnected === true && state.isInternetReachable !== false;
        if (!hasInternet) {
          console.log('ensureChatLoaded: device offline, will wait for connectivity to attach onSnapshot for', chatId);
          // resolve init promise so caller isn't blocked
          const entry = storeInitPromises[chatId];
          if (entry && !entry.resolved) {
            entry.resolved = true;
            const r = entry.resolve;
            entry.resolve = null;
            try { r && r(); } catch (e) { /* ignore */ }
          }

          // listen for connectivity and attach snapshot when online
          let netUnsub: (() => void) | null = null;
          netUnsub = NetInfo.addEventListener((s) => {
            try {
              const nowOnline = s.isConnected === true && s.isInternetReachable !== false;
              if (nowOnline) {
                try { console.log('Network reconnected, attaching onSnapshot for', chatId); } catch (e) {}
                // attach and then remove this NetInfo listener
                try { attachSnapshot(); } catch (e) { console.error('attachSnapshot failed after reconnect', e); }
                try { if (netUnsub) netUnsub(); } catch (e) { /* ignore */ }
              }
            } catch (e) { /* ignore */ }
          });

          // ensure we can clean up the NetInfo listener if unsubscribeChat is called before reconnect
          storeUnsubs[chatId] = () => {
            try { if (netUnsub) netUnsub(); } catch (e) { /* ignore */ }
            storeUnsubs[chatId] = null;
          };
          return;
        }

        // device is online now, attach immediately
        attachSnapshot();
      } catch (e) {
        console.error('ensureChatLoaded: failed to attach onSnapshot', e);
        const entry = storeInitPromises[chatId];
        if (entry && !entry.resolved) {
          entry.resolved = true;
          const r = entry.resolve;
          entry.resolve = null;
          try { r && r(); } catch (ee) { /* ignore */ }
        }
        storeUnsubs[chatId] = null;
      }
    })();
    return p;
  },
  // Load older messages (pagination) for a chat. Returns number loaded and whether more exists.
  loadOlderMessages: async (chatId: string, pageSize = 50) => {
    if (!chatId) return { loaded: 0, hasMore: false };
    try {
      const cursor = storeCursors[chatId];
      if (!cursor) return { loaded: 0, hasMore: false };
      const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), startAfter(cursor), limit(pageSize));
      const snap = await getDocs(q);
      if (!snap || snap.empty) {
        storeHasMore[chatId] = false;
        return { loaded: 0, hasMore: false };
      }
      const docs = snap.docs;
      const msgs: Message[] = docs.map(d => ({ ...(d.data() as any), id: d.id, chatId } as Message));
      try { (get().upsertMessages as any)(chatId, msgs); } catch (e) { console.error('loadOlder upsert error', e); }
      // update cursor to last doc in this page
      storeCursors[chatId] = docs[docs.length - 1];
      storeHasMore[chatId] = (snap.size || 0) >= pageSize;
      return { loaded: snap.size || 0, hasMore: !!storeHasMore[chatId] };
    } catch (e) {
      console.error('loadOlderMessages failed', e);
      return { loaded: 0, hasMore: false };
    }
  },
  // Load lightweight cached messages from SQLite quickly. Does not attach live Firestore snapshot.
  openChat: async (chatId: string) => {
    if (!chatId) return;
    try {
      const meta = get().sessionsMeta[chatId];
      if (meta && meta.loaded) {
        // update lastAccessed
        set((s: any) => ({ sessionsMeta: { ...s.sessionsMeta, [chatId]: { ...s.sessionsMeta[chatId], lastAccessed: Date.now() } } }));
        return;
      }

      // load recent messages from SQLite (fast local read)
      const rows = await sqlite.getMessages(chatId, 50);
      console.log('openChat sqlite.getMessages rows:', (rows || []).length, 'for', chatId);
      // rows are ordered DESC by createdAt; convert to ascending for store (matches onSnapshot earlier)
      const mapped: Message[] = (rows || []).map((r: any) => ({
        id: r.id,
        chatId: r.chatId,
        text: r.text,
        sender: r.sender,
        adminId: r.adminId,
        pending: !!r.pending,
        failed: !!r.failed,
        extra: r.extra ? JSON.parse(r.extra) : undefined,
        isRead: !!r.isRead,
        createdAt: Timestamp.fromMillis(Number(r.createdAt) || Date.now()),
      })).reverse();

      set((state: any) => ({
        messagesByChat: { ...state.messagesByChat, [chatId]: mapped },
        sessionsMeta: { ...state.sessionsMeta, [chatId]: { loaded: true, lastAccessed: Date.now() } }
      }));

      try {
        const sample2 = (get().messagesByChat[chatId] || []).slice(0,5).map((m: any) => m.id || m.clientId);
        console.log('openChat populated messagesByChat for', chatId, 'len=', (get().messagesByChat[chatId] || []).length, 'sample ids=', sample2);
      } catch (e) { /* ignore */ }

      // prune LRU sessions if needed
      try {
        const MAX = 10;
        const meta = get().sessionsMeta;
        const ids = Object.keys(meta);
        if (ids.length > MAX) {
          const sorted = ids.sort((a, b) => (meta[a].lastAccessed || 0) - (meta[b].lastAccessed || 0));
          const toRemove = sorted.slice(0, ids.length - MAX);
          if (toRemove.length) {
            set((s: any) => {
              const copyMeta = { ...s.sessionsMeta };
              const copyMsgs = { ...s.messagesByChat };
              for (const id of toRemove) { delete copyMeta[id]; delete copyMsgs[id]; }
              return { sessionsMeta: copyMeta, messagesByChat: copyMsgs };
            });
          }
        }
      } catch (e) { /* ignore prune errors */ }
    } catch (e) {
      console.error('openChat sqlite load error', e);
    }
  },

  // alias kept for backward compatibility (preloadChat used in code) — now uses openChat
  preloadChat: (chatId: string) => {
    return (get().openChat)(chatId);
  },
  upsertMessages: (chatId: string, messagesArr: Message[]) => {
    if (!chatId || !messagesArr || !messagesArr.length) return;
    set((state: any) => {
      const curr: Message[] = state.messagesByChat[chatId] || [];
      const map = new Map<string, Message>();
      for (const m of curr) {
        const key = (m && (m.id || (m as any).clientId))?.toString();
        if (!key) continue;
        map.set(key, m);
      }
      for (const m of messagesArr) {
        const key = (m && (m.id || (m as any).clientId))?.toString();
        if (!key) continue;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, m);
        } else {
          try {
            const ta = (existing.createdAt as any)?.toMillis ? (existing.createdAt as any).toMillis() : new Date(existing.createdAt as any).getTime();
            const tb = (m.createdAt as any)?.toMillis ? (m.createdAt as any).toMillis() : new Date(m.createdAt as any).getTime();
            if (tb >= ta) map.set(key, { ...existing, ...m });
            else map.set(key, existing);
          } catch (e) {
            map.set(key, { ...existing, ...m });
          }
        }
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const ta = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : new Date(a.createdAt as any).getTime();
        const tb = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : new Date(b.createdAt as any).getTime();
        return ta - tb;
      });
      return { messagesByChat: { ...state.messagesByChat, [chatId]: merged } };
    });

    try {
      const sample = (get().messagesByChat[chatId] || []).slice(0,5).map((m: any) => m.id || m.clientId);
      console.log('upsertMessages updated for', chatId, 'len=', (get().messagesByChat[chatId] || []).length, 'sample ids=', sample);
    } catch (e) { /* ignore */ }
  },
  appendOlderMessages: (chatId: string, older: Message[]) => {
    if (!chatId || !older || !older.length) return;
    set((state: any) => {
      const curr = state.messagesByChat[chatId] || [];
      const map = new Map<string, Message>();
      for (const m of [...older, ...curr]) {
        const key = (m && (m.id || (m as any).clientId))?.toString();
        if (!key) continue;
        if (!map.has(key)) map.set(key, m);
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const ta = (a.createdAt as any)?.toMillis ? (a.createdAt as any).toMillis() : (new Date(a.createdAt as any)).getTime();
        const tb = (b.createdAt as any)?.toMillis ? (b.createdAt as any).toMillis() : (new Date(b.createdAt as any)).getTime();
        return ta - tb; // keep ascending
      });
      return { messagesByChat: { ...state.messagesByChat, [chatId]: merged } };
    });
  },
  unsubscribeChat: (chatId: string) => {
    try {
      if (storeUnsubs[chatId]) {
        storeUnsubs[chatId]!();
        storeUnsubs[chatId] = null;
      }
      try { delete storeCursors[chatId]; } catch (e) { /* ignore */ }
      try { delete storeHasMore[chatId]; } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  },
  sendMessage: async (chatId: string, text: string) => {
    if (!chatId) return;
    const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const now = Date.now();
    const optimistic: Message = { id: clientId, chatId, text, sender: 'admin', createdAt: Timestamp.fromMillis(now) } as any;

    // push optimistic locally
    set((state: any) => {
      const curr = state.messagesByChat[chatId] || [];
      const pending = state.pendingByChat[chatId] || [];
      return {
        messagesByChat: { ...state.messagesByChat, [chatId]: [...curr, optimistic] },
        pendingByChat: { ...state.pendingByChat, [chatId]: [...pending, optimistic] }
      };
    });

    try {
      const chatRef = doc(db, 'chats', chatId);
      const newMsgRef = doc(collection(db, 'chats', chatId, 'messages'), clientId);
      const batch = writeBatch(db);
      batch.set(newMsgRef, { text, sender: 'admin', createdAt: serverTimestamp(), clientId });
      batch.update(chatRef, { lastMessage: text, lastMessageAt: serverTimestamp(), lastMessageSenderId: 'admin', adminUnread: increment(1) });
      await batch.commit();
    } catch (e) {
      console.error('chatStore sendMessage batch error', e);
    }
  }
}));

export default useChatStore;
