import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Permission hook for the Abdullah Quilliam Society app.
 *
 * Permission tiers:
 *  - superadmin / owner (Dr Abdul Hamid)  → full read / write / edit / delete
 *  - admin / trustee                       → read / write / edit  (NO delete)
 *  - manager / deputy                      → read / add           (NO edit, NO delete)
 *  - staff / volunteer                     → read / add only      (NO edit, NO delete)
 *
 * The `isOwner` flag is set server-side in auth.me and is true when the
 * logged-in user's openId matches ENV.ownerOpenId OR role === 'superadmin'.
 */
export function usePermissions() {
  const { user } = useAuth();

  if (!user) {
    return {
      canDelete: false,
      canEdit: false,
      canAdd: false,
      isOwnerOrSuperAdmin: false,
      isAdminOrAbove: false,
    };
  }

  const role = user.role ?? "user";
  // isOwner is injected by the server in auth.me
  const isOwner = (user as any).isOwner === true;

  // Only superadmin or the owner (Dr Abdul Hamid) may delete anything
  const canDelete = role === "superadmin" || isOwner;

  // Superadmin, owner, admin, and trustee can edit existing records
  const canEdit =
    canDelete ||
    role === "admin" ||
    role === "trustee";

  // Everyone authenticated can add new records
  const canAdd = true;

  const isOwnerOrSuperAdmin = canDelete;
  const isAdminOrAbove = canEdit;

  return { canDelete, canEdit, canAdd, isOwnerOrSuperAdmin, isAdminOrAbove };
}
