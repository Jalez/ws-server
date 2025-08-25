import { db } from './database';

export interface DocumentSession {
  id: string;
  documentId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  lastActiveAt: Date;
  cursorPosition?: any;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionService {
  static async createSession(
    documentId: string,
    userId: string,
    userEmail: string,
    userName?: string,
  ): Promise<DocumentSession> {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    await db.query(
      `INSERT INTO document_sessions
       (id, document_id, user_id, user_email, user_name, last_active_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $6)`,
      [id, documentId, userId, userEmail, userName, now]
    );

    return {
      id,
      documentId,
      userId,
      userEmail,
      userName,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  static async updateSessionActivity(sessionId: string, cursorPosition?: any): Promise<void> {
    const now = new Date();

    if (cursorPosition) {
      await db.query(
        `UPDATE document_sessions
         SET last_active_at = $1, cursor_position = $2, updated_at = $1
         WHERE id = $3`,
        [now, JSON.stringify(cursorPosition), sessionId]
      );
    } else {
      await db.query(
        `UPDATE document_sessions
         SET last_active_at = $1, updated_at = $1
         WHERE id = $2`,
        [now, sessionId]
      );
    }
  }

  static async removeSession(sessionId: string): Promise<void> {
    await db.query('DELETE FROM document_sessions WHERE id = $1', [sessionId]);
  }
}

