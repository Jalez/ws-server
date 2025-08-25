import { db } from './database';

export interface UserPermission {
  hasAccess: boolean;
  permission: 'owner' | 'editor' | 'viewer';
  isOwner: boolean;
}

export class PermissionService {
  static async checkDocumentPermission(
    documentId: string,
    userEmail: string,
    requiredPermission: 'owner' | 'editor' | 'viewer' = 'viewer'
  ): Promise<UserPermission> {
    try {
      // Check if we're in test mode (skip database validation)
      if (process.env.SKIP_DB_AUTH === 'true') {
        console.log(`🔧 Test mode: Granting ${requiredPermission} permission to ${userEmail}`);
        return {
          hasAccess: true,
          permission: requiredPermission,
          isOwner: true,
        };
      }

      // Check if user is the document owner
      const ownerResult = await db.query(
        'SELECT user_id FROM documents WHERE id = $1 AND user_id = $2',
        [documentId, userEmail]
      );

      if (ownerResult.rows.length > 0) {
        return {
          hasAccess: true,
          permission: 'owner',
          isOwner: true,
        };
      }

      // Check for shared access
      const shareResult = await db.query(
        `SELECT permission FROM document_shares
         WHERE document_id = $1 AND shared_user_email = $2`,
        [documentId, userEmail]
      );

      if (shareResult.rows.length > 0) {
        const userPermission = shareResult.rows[0].permission as 'owner' | 'editor' | 'viewer';

        const permissionHierarchy = { owner: 3, editor: 2, viewer: 1 };
        const requiredLevel = permissionHierarchy[requiredPermission];
        const userLevel = permissionHierarchy[userPermission];

        return {
          hasAccess: userLevel >= requiredLevel,
          permission: userPermission,
          isOwner: false,
        };
      }

      return { hasAccess: false, permission: 'viewer', isOwner: false };
    } catch (error) {
      console.error('Error checking document permission:', error);
      return { hasAccess: false, permission: 'viewer', isOwner: false };
    }
  }

  static async validateUser(userEmail: string): Promise<boolean> {
    try {
      // Check if we're in test mode (skip database validation)
      if (process.env.SKIP_DB_AUTH === 'true') {
        console.log(`🔧 Test mode: Allowing user ${userEmail} without database check`);
        return true;
      }

      // Check if this is a guest user
      if (userEmail.includes('guest_') && userEmail.includes('@example.com')) {
        console.log(`👤 Guest user detected: ${userEmail}, allowing access`);
        return true;
      }

      // Check if user exists by looking for any documents they own
      const result = await db.query(
        'SELECT 1 FROM documents WHERE user_id = $1 LIMIT 1',
        [userEmail]
      );
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error validating user:', error);
      return false;
    }
  }

  static async validateGuestAccess(documentId: string, shareToken: string): Promise<{ hasAccess: boolean; permission: 'viewer' | 'editor' | 'owner' }> {
    try {
      // Check if we're in test mode (skip database validation)
      if (process.env.SKIP_DB_AUTH === 'true') {
        console.log(`🔧 Test mode: Granting guest access to document ${documentId} with token ${shareToken}`);
        return { hasAccess: true, permission: 'viewer' };
      }

      // Check if the document has guest access enabled with the provided token
      const result = await db.query(
        `SELECT allow_guest_access, permission FROM document_shares
         WHERE document_id = $1 AND share_token = $2 AND allow_guest_access = true`,
        [documentId, shareToken]
      );

      if (result.rows.length > 0) {
        const share = result.rows[0];
        console.log(`✅ Guest access validated for document ${documentId} with token ${shareToken}`);
        return {
          hasAccess: true,
          permission: share.permission || 'viewer'
        };
      }

      console.log(`❌ Guest access denied for document ${documentId} with token ${shareToken}`);
      return { hasAccess: false, permission: 'viewer' };
    } catch (error) {
      console.error('Error validating guest access:', error);
      return { hasAccess: false, permission: 'viewer' };
    }
  }
}
