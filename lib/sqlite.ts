import * as SQLite from 'expo-sqlite';

const DB_NAME = 'rekapk.db';
// use openDatabaseSync as typed in expo-sqlite d.ts
const db = (SQLite as any).openDatabaseSync ? (SQLite as any).openDatabaseSync(DB_NAME) : (SQLite as any).openDatabase ? (SQLite as any).openDatabase(DB_NAME) : null;

const execSql = (sql: string, args: any[] = []) => new Promise<any>((resolve, reject) => {
  try {
    db.transaction((tx: any) => {
      tx.executeSql(sql, args, (_tx: any, res: any) => resolve(res), (_tx: any, err: any) => { reject(err); return false; });
    }, (e: any) => reject(e));
  } catch (e: any) { reject(e); }
});

export const initDb = async () => {
  // create messages table and index
  await execSql(`CREATE TABLE IF NOT EXISTS messages (
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
  );`);
  // index for fast paging
  await execSql(`CREATE INDEX IF NOT EXISTS idx_chat_created ON messages(chatId, createdAt DESC);`);
};

export const getMessages = async (chatId: string, limit: number = 50, beforeCreatedAt?: number) => {
  if (!chatId) return [];
  let sql = `SELECT * FROM messages WHERE chatId = ?`;
  const params: any[] = [chatId];
  if (typeof beforeCreatedAt === 'number') {
    sql += ` AND createdAt < ?`;
    params.push(beforeCreatedAt);
  }
  sql += ` ORDER BY createdAt DESC LIMIT ?`;
  params.push(limit);
  const res: any = await execSql(sql, params);
  const rows: any[] = [];
  try {
    for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i));
  } catch (e) { /* ignore */ }
  return rows;
};

export const upsertMessages = async (messages: any[]) => {
  if (!messages || messages.length === 0) return;
  return new Promise<void>((resolve, reject) => {
    db.transaction((tx: any) => {
      for (const m of messages) {
        const id = m.id || m.serverId || m.clientId;
        const createdAt = m.createdAt && typeof m.createdAt === 'number' ? m.createdAt : (m.createdAt?.toMillis ? m.createdAt.toMillis() : Date.now());
        const pending = m.pending ? 1 : 0;
        const extra = m.extra ? JSON.stringify(m.extra) : null;
        tx.executeSql(
          `INSERT OR REPLACE INTO messages (id, chatId, clientId, text, sender, adminId, createdAt, pending, failed, extra) VALUES (?,?,?,?,?,?,?,?,?,?);`,
          [id, m.chatId, m.clientId || null, m.text || '', m.sender || null, m.adminId || null, createdAt, pending, m.failed ? 1 : 0, extra]
        );
      }
    }, (e: any) => reject(e), () => resolve());
  });
};

export const deleteMessage = async (id: string) => {
  if (!id) return;
  await execSql(`DELETE FROM messages WHERE id = ?`, [id]);
};

export const insertPendingMessage = async (row: { id: string; chatId: string; text: string; sender?: string; createdAt?: number; clientId?: string }) => {
  const createdAt = row.createdAt || Date.now();
  await execSql(`INSERT OR REPLACE INTO messages (id, chatId, clientId, text, sender, createdAt, pending) VALUES (?,?,?,?,?,?,1);`, [row.id, row.chatId, row.clientId ?? row.id, row.text, row.sender || 'admin', createdAt]);
};

export const getMessagesByIds = async (ids: string[]) => {
  if (!ids || ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const res: any = await execSql(`SELECT * FROM messages WHERE id IN (${placeholders})`, ids);
  const rows: any[] = [];
  try { for (let i = 0; i < res.rows.length; i++) rows.push(res.rows.item(i)); } catch(e) {}
  return rows;
};

export default {
  initDb,
  getMessages,
  upsertMessages,
  deleteMessage,
  insertPendingMessage,
  getMessagesByIds,
};
