import { db } from './database';

export interface DocumentChange {
  id: string;
  documentId: string;
  sessionId: string;
  userId: string;
  version: number;
  operation: any;
  createdAt: Date;
}

export class DocumentService {
  static async addDocumentChange(
    documentId: string,
    sessionId: string,
    userId: string,
    version: number,
    operation: any,
  ): Promise<DocumentChange> {
    const id = `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    await db.query(
      `INSERT INTO document_changes
       (id, document_id, session_id, user_id, version, operation, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, documentId, sessionId, userId, version, JSON.stringify(operation), now]
    );

    return {
      id,
      documentId,
      sessionId,
      userId,
      version,
      operation,
      createdAt: now,
    };
  }
}

