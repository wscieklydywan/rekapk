import * as SQLite from 'expo-sqlite';
import { Timestamp } from 'firebase/firestore';

const DB_NAME = 'rekapk.db';

let db: any = null;
let _initializing: Promise<void> | null = null;

export const initDb = async () => {
  if (db) return;
  if (_initializing) return _initializing;
  _initializing = (async () => {
    db = await (SQLite as any).openDatabaseAsync(DB_NAME);

    // create messages table and index using async exec
    try {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chatId TEXT,
          clientId TEXT,
          text TEXT,
          sender TEXT,
          adminId TEXT,
          createdAt INTEGER,
          pending INTEGER DEFAULT 0,
          failed INTEGER DEFAULT 0,
          extra TEXT
        );
      `);

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_chat_created
        ON messages(chatId, createdAt DESC);
      `);

      // Ensure unique index on id to make upserts idempotent and fast
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_id
        ON messages(id);
      `);
      // create chats table for offline-first chat list
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          status TEXT,
          createdAt INTEGER,
          lastActivity INTEGER,
          lastMessage TEXT,
          lastMessageSender TEXT,
          lastMessageTimestamp INTEGER,
          operatorId TEXT,
          operatorJoinedAt INTEGER,
          userInfo TEXT,
          adminUnread INTEGER DEFAULT 0,
          userUnread INTEGER DEFAULT 0,
          activeAdminId TEXT,
          assignedAdminId TEXT,
          userUid TEXT,
          userIsBanned INTEGER DEFAULT 0,
          bannedUntil INTEGER,
          banReason TEXT,
          bannedAt INTEGER
        );
      `);

      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_chats_lastActivity
        ON chats(lastActivity DESC);
      `);
    } catch (e) {
      // Some SQLite implementations may not support execAsync; fall back silently
      try { await db.execAsync?.('\n'); } catch (_) { /* ignore */ }
    }
  })();
  return _initializing;
};

export const getMessages = async (chatId: string, limit: number = 50, beforeCreatedAt?: number) => {
  if (!db) await initDb();
  if (!chatId) return [];
  let sql = `SELECT * FROM messages WHERE chatId = ?`;
  const params: any[] = [chatId];
  if (typeof beforeCreatedAt === 'number') {
    sql += ` AND createdAt < ?`;
    params.push(beforeCreatedAt);
  }
  sql += ` ORDER BY createdAt DESC LIMIT ?`;
  params.push(limit);
  const rows: any[] = await db.getAllAsync(sql, params);
  try {
    console.log(`sqlite.getMessages chat=${chatId} returned ${ (rows || []).length } rows`);
    if ((rows || []).length && (global as any).__DEV__) console.debug('sqlite.getMessages sample ids:', (rows || []).slice(0,5).map(r => r.id));
  } catch (e) { /* ignore logging errors */ }
  return rows || [];
};

export const getChats = async (limit: number = 100) => {
  if (!db) await initDb();
  try { console.log('sqlite.getChats: called with limit', limit); } catch (e) { }
  try {
    try { console.log('sqlite.getChats: db present?', !!db, 'has.getAllAsync?', !!db?.getAllAsync); } catch (ee) { }
    const sql = `SELECT * FROM chats ORDER BY lastActivity DESC LIMIT ?`;
    let rows: any[] = [];
    try {
      rows = await db.getAllAsync(sql, [limit]);
    } catch (err) {
      try { console.error('sqlite.getChats: getAllAsync failed:', err); } catch (ee) { }
      // try fallback to execAsync/select via a different API if available
      try {
        const res = await db.execAsync?.(sql, [limit]);
        try { console.log('sqlite.getChats: execAsync result:', res); } catch (ee) { }
      } catch (er) { /* ignore */ }
    }
    try { console.log('sqlite.getChats: rows returned', (rows || []).length); } catch (e) { }
    const mapped = (rows || []).map(r => {
      let userInfo = null;
      try { userInfo = r.userInfo ? JSON.parse(r.userInfo) : null; } catch (e) { userInfo = null; }
      const toTs = (v: any) => {
        if (v == null) return null;
        const n = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : (v?.toMillis ? v.toMillis() : null));
        if (n == null) return null;
        try { return Timestamp.fromMillis(n); } catch (e) { return null; }
      };
      return {
        id: r.id,
        status: r.status,
        createdAt: toTs(r.createdAt),
        lastActivity: toTs(r.lastActivity),
        lastMessage: r.lastMessage || '',
        lastMessageSender: r.lastMessageSender || null,
        lastMessageTimestamp: toTs(r.lastMessageTimestamp),
        operatorId: r.operatorId || null,
        operatorJoinedAt: toTs(r.operatorJoinedAt),
        userInfo: userInfo,
        adminUnread: r.adminUnread || 0,
        userUnread: r.userUnread || 0,
        activeAdminId: r.activeAdminId || null,
        assignedAdminId: r.assignedAdminId || null,
        userUid: r.userUid || null,
        userIsBanned: !!r.userIsBanned,
        bannedUntil: toTs(r.bannedUntil),
        banReason: r.banReason || null,
        bannedAt: toTs(r.bannedAt),
      };
    });
    return mapped;
  } catch (e) {
    try { console.error('sqlite.getChats: unexpected error', e); } catch (ee) { }
    return [];
  }
};

export const upsertChats = async (chats: any[]) => {
  if (!db) await initDb();
  if (!chats || chats.length === 0) return;
  try {
    try { await db.execAsync('BEGIN TRANSACTION;'); } catch (e) { /* ignore */ }
    for (const c of chats) {
      const id = c.id;
      const createdAt = c.createdAt && c.createdAt.toMillis ? c.createdAt.toMillis() : (c.createdAt ? (new Date(c.createdAt)).getTime() : null);
      const lastActivity = c.lastActivity && c.lastActivity.toMillis ? c.lastActivity.toMillis() : (c.lastActivity ? (new Date(c.lastActivity)).getTime() : null);
      const lastMessageTimestamp = c.lastMessageTimestamp && c.lastMessageTimestamp.toMillis ? c.lastMessageTimestamp.toMillis() : (c.lastMessageTimestamp ? (new Date(c.lastMessageTimestamp)).getTime() : null);
      const userInfo = c.userInfo ? JSON.stringify(c.userInfo) : null;
      await db.runAsync(
        `INSERT OR REPLACE INTO chats (id, status, createdAt, lastActivity, lastMessage, lastMessageSender, lastMessageTimestamp, operatorId, operatorJoinedAt, userInfo, adminUnread, userUnread, activeAdminId, assignedAdminId, userUid, userIsBanned, bannedUntil, banReason, bannedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
        [id, c.status || null, createdAt, lastActivity, c.lastMessage || '', c.lastMessageSender || null, lastMessageTimestamp, c.operatorId || null, (c.operatorJoinedAt && (c.operatorJoinedAt.toMillis ? c.operatorJoinedAt.toMillis() : (new Date(c.operatorJoinedAt)).getTime())) || null, userInfo, c.adminUnread || 0, c.userUnread || 0, c.activeAdminId || null, c.assignedAdminId || null, c.userUid || null, c.userIsBanned ? 1 : 0, (c.bannedUntil && (c.bannedUntil.toMillis ? c.bannedUntil.toMillis() : (new Date(c.bannedUntil)).getTime())) || null, c.banReason || null, (c.bannedAt && (c.bannedAt.toMillis ? c.bannedAt.toMillis() : (new Date(c.bannedAt)).getTime())) || null]
      );
    }
    try { await db.execAsync('COMMIT;'); } catch (e) { /* ignore */ }
  } catch (e) {
    try { await db.execAsync('ROLLBACK;'); } catch (er) { /* ignore */ }
    throw e;
  }
};

export const upsertMessages = async (messages: any[]) => {
  if (!db) await initDb();
  if (!messages || messages.length === 0) return;
  // Batch upserts inside a transaction for performance
  try {
    try { await db.execAsync('BEGIN TRANSACTION;'); } catch (e) { /* ignore if not supported */ }
    for (const m of messages) {
      const id = m.id || m.serverId || m.clientId;
      const createdAt = m.createdAt && typeof m.createdAt === 'number' ? m.createdAt : (m.createdAt?.toMillis ? m.createdAt.toMillis() : Date.now());
      const pending = m.pending ? 1 : 0;
      const extra = m.extra ? JSON.stringify(m.extra) : null;
      // Use INSERT OR REPLACE to keep row updated; unique index on id prevents duplicates
      await db.runAsync(
        `INSERT OR REPLACE INTO messages (id, chatId, clientId, text, sender, adminId, createdAt, pending, failed, extra) VALUES (?,?,?,?,?,?,?,?,?,?);`,
        [id, m.chatId, m.clientId || null, m.text || '', m.sender || null, m.adminId || null, createdAt, pending, m.failed ? 1 : 0, extra]
      );
    }
    try { await db.execAsync('COMMIT;'); } catch (e) { /* ignore if not supported */ }
    try {
      console.log(`sqlite.upsertMessages wrote ${messages.length} messages (chat samples: ${messages.slice(0,3).map(m => m.chatId).join(',')})`);
      if ((global as any).__DEV__) console.debug('sqlite.upsertMessages sample ids:', messages.slice(0,5).map(m => m.id));
    } catch (e) { /* ignore logging errors */ }
  } catch (e) {
    try { await db.execAsync('ROLLBACK;'); } catch (er) { /* ignore */ }
    throw e;
  }
};

export const deleteMessage = async (id: string) => {
  if (!db) await initDb();
  if (!id) return;
  await db.runAsync(`DELETE FROM messages WHERE id = ?`, [id]);
};

export const insertPendingMessage = async (row: { id: string; chatId: string; text: string; sender?: string; createdAt?: number; clientId?: string }) => {
  if (!db) await initDb();
  const createdAt = row.createdAt || Date.now();
  await db.runAsync(`INSERT OR REPLACE INTO messages (id, chatId, clientId, text, sender, createdAt, pending) VALUES (?,?,?,?,?,?,1);`, [row.id, row.chatId, row.clientId ?? row.id, row.text, row.sender || 'admin', createdAt]);
};

export const getMessagesByIds = async (ids: string[]) => {
  if (!db) await initDb();
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT * FROM messages WHERE id IN (${placeholders})`;
  const rows: any[] = await db.getAllAsync(sql, ids);
  return rows || [];
};

export default {
  initDb,
  getMessages,
  getChats,
  upsertMessages,
  upsertChats,
  deleteMessage,
  insertPendingMessage,
  getMessagesByIds,
};
