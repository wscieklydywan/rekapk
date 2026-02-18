import * as SQLite from 'expo-sqlite';

const DB_NAME = 'rekapk.db';

let db: any = null;

export const initDb = async () => {
  if (!db) {
    db = await (SQLite as any).openDatabaseAsync(DB_NAME);
  }

  // create messages table and index using async exec
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
};

export const getMessages = async (chatId: string, limit: number = 50, beforeCreatedAt?: number) => {
  if (!db) throw new Error('SQLite DB not initialized');
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
  return rows || [];
};

export const upsertMessages = async (messages: any[]) => {
  if (!db) throw new Error('SQLite DB not initialized');
  if (!messages || messages.length === 0) return;
  for (const m of messages) {
    const id = m.id || m.serverId || m.clientId;
    const createdAt = m.createdAt && typeof m.createdAt === 'number' ? m.createdAt : (m.createdAt?.toMillis ? m.createdAt.toMillis() : Date.now());
    const pending = m.pending ? 1 : 0;
    const extra = m.extra ? JSON.stringify(m.extra) : null;
    await db.runAsync(
      `INSERT OR REPLACE INTO messages (id, chatId, clientId, text, sender, adminId, createdAt, pending, failed, extra) VALUES (?,?,?,?,?,?,?,?,?,?);`,
      [id, m.chatId, m.clientId || null, m.text || '', m.sender || null, m.adminId || null, createdAt, pending, m.failed ? 1 : 0, extra]
    );
  }
};

export const deleteMessage = async (id: string) => {
  if (!db) throw new Error('SQLite DB not initialized');
  if (!id) return;
  await db.runAsync(`DELETE FROM messages WHERE id = ?`, [id]);
};

export const insertPendingMessage = async (row: { id: string; chatId: string; text: string; sender?: string; createdAt?: number; clientId?: string }) => {
  if (!db) throw new Error('SQLite DB not initialized');
  const createdAt = row.createdAt || Date.now();
  await db.runAsync(`INSERT OR REPLACE INTO messages (id, chatId, clientId, text, sender, createdAt, pending) VALUES (?,?,?,?,?,?,1);`, [row.id, row.chatId, row.clientId ?? row.id, row.text, row.sender || 'admin', createdAt]);
};

export const getMessagesByIds = async (ids: string[]) => {
  if (!db) throw new Error('SQLite DB not initialized');
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT * FROM messages WHERE id IN (${placeholders})`;
  const rows: any[] = await db.getAllAsync(sql, ids);
  return rows || [];
};

export default {
  initDb,
  getMessages,
  upsertMessages,
  deleteMessage,
  insertPendingMessage,
  getMessagesByIds,
};
