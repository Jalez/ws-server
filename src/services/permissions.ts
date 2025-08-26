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
      console.log(`🔍 Checking document permission for ${userEmail} on document ${documentId}, required: ${requiredPermission}`);

      // Check if we're in test mode (skip database validation)
      if (process.env.SKIP_DB_AUTH === 'true') {
        console.log(`🔧 Test mode: Granting ${requiredPermission} permission to ${userEmail}`);
        return {
          hasAccess: true,
          permission: requiredPermission,
          isOwner: true,
        };
      }

      // Check if this is a guest user who has already been authenticated
      if (userEmail.includes('guest_') && userEmail.includes('@example.com')) {
        console.log(`👤 Guest user ${userEmail} granted ${requiredPermission} access to document ${documentId}`);
        return {
          hasAccess: true,
          permission: 'viewer', // Guests always get viewer permission
          isOwner: false,
        };
      }

      // Check if user is the document owner
      const ownerResult = await db.query(
        'SELECT user_id FROM documents WHERE id = $1 AND user_id = $2',
        [documentId, userEmail]
      );

      if (ownerResult.rows.length > 0) {
        console.log(`👑 User ${userEmail} is document owner`);
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
        console.log(`📝 User ${userEmail} has shared access with permission: ${userPermission}`);

        const permissionHierarchy = { owner: 3, editor: 2, viewer: 1 };
        const requiredLevel = permissionHierarchy[requiredPermission];
        const userLevel = permissionHierarchy[userPermission];

        return {
          hasAccess: userLevel >= requiredLevel,
          permission: userPermission,
          isOwner: false,
        };
      }

      console.log(`❌ User ${userEmail} has no access to document ${documentId}`);
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
      console.log(`🔍 Validating guest access for document ${documentId} with token: ${shareToken}`);

      // Check if we're in test mode (skip database validation)
      if (process.env.SKIP_DB_AUTH === 'true') {
        console.log(`🔧 Test mode: Granting guest access to document ${documentId} with token ${shareToken}`);
        return { hasAccess: true, permission: 'viewer' };
      }

      // First, let's query all document shares for this document to debug
      console.log(`🔍 Querying all document shares for ${documentId}`);
      const allSharesResult = await db.query(
        `SELECT id, document_id, shared_user_email, share_token, allow_guest_access, permission
         FROM document_shares
         WHERE document_id = $1`,
        [documentId]
      );

      console.log(`🔍 Found ${allSharesResult.rows.length} document shares:`, allSharesResult.rows);

      // First, check if the document has public guest access enabled (no specific token required)
      const publicAccessResult = await db.query(
        `SELECT allow_guest_access, permission FROM document_shares
         WHERE document_id = $1 AND shared_user_email IS NULL AND allow_guest_access = true`,
        [documentId]
      );

      console.log(`🔍 Public access query result: ${publicAccessResult.rows.length} rows`);

      if (publicAccessResult.rows.length > 0) {
        const publicShare = publicAccessResult.rows[0];
        console.log(`✅ Public guest access validated for document ${documentId} with permission ${publicShare.permission}`);
        return {
          hasAccess: true,
          permission: publicShare.permission || 'viewer'
        };
      }

      // Then, check if the document has guest access enabled with the provided token
      if (shareToken) {
        console.log(`🔍 Checking token-based access with token: ${shareToken}`);
        const tokenAccessResult = await db.query(
          `SELECT allow_guest_access, permission FROM document_shares
           WHERE document_id = $1 AND share_token = $2 AND allow_guest_access = true`,
          [documentId, shareToken]
        );

        console.log(`🔍 Token access query result: ${tokenAccessResult.rows.length} rows`);

        if (tokenAccessResult.rows.length > 0) {
          const tokenShare = tokenAccessResult.rows[0];
          console.log(`✅ Token-based guest access validated for document ${documentId} with token ${shareToken} and permission ${tokenShare.permission}`);
          return {
            hasAccess: true,
            permission: tokenShare.permission || 'viewer'
          };
        }
      }

      console.log(`❌ Guest access denied for document ${documentId} with token ${shareToken || 'none'}`);
      return { hasAccess: false, permission: 'viewer' };
    } catch (error) {
      console.error('❌ Error validating guest access:', error);
      return { hasAccess: false, permission: 'viewer' };
    }
  }
}
