/**
 * Route-to-role permission mapping.
 * Single source of truth — mirrors the sidebar NAVIGATION visibleTo arrays.
 * Used by both DashboardLayout (sidebar filtering) and RouteGuard (access denial).
 */

export type RoleCategory = "superadmin" | "trustee" | "staff";

export function getRoleCategory(role?: string | null): RoleCategory {
  if (role === "superadmin" || role === "admin") return "superadmin";
  if (role === "trustee") return "trustee";
  return "staff"; // manager, deputy, assistant, volunteer, user
}

/**
 * Map of route path → allowed role categories.
 * Routes not listed here are accessible to all authenticated users.
 * Sub-routes (e.g. /loans/:id) inherit from their parent (/loans).
 */
const ROUTE_PERMISSIONS: Record<string, RoleCategory[]> = {
  // ── DAILY ──
  "/":                    ["superadmin", "staff"],
  "/capture":             ["superadmin", "staff"],
  "/dashboard":           ["superadmin", "trustee", "staff"],
  "/receipts":            ["superadmin", "staff"],

  // ── FINANCE ──
  "/income":              ["superadmin", "trustee", "staff"],
  "/monthly-expenses":    ["superadmin", "staff"],
  "/bills-utilities":     ["superadmin"],
  "/fintech":             ["superadmin", "trustee"],
  "/reconciliation":      ["superadmin"],
  "/loans":               ["superadmin", "trustee"],
  "/payroll":             ["superadmin"],
  "/payroll-v3":          ["superadmin"],

  // ── DONORS & FUNDRAISING ──
  "/donor-crm":           ["superadmin", "trustee", "staff"],
  "/donors":              ["superadmin", "trustee", "staff"],
  "/campaigns":           ["superadmin", "trustee", "staff"],
  "/gift-aid":            ["superadmin"],
  "/fundraising":         ["superadmin"],
  // Sub-screens inside Donors — same access as Donors
  "/pledges":             ["superadmin", "trustee", "staff"],
  "/donor-pipeline":      ["superadmin", "trustee", "staff"],
  "/major-donor":         ["superadmin", "trustee", "staff"],
  "/saved-views":         ["superadmin", "trustee", "staff"],
  "/recognition-tiers":   ["superadmin", "trustee", "staff"],
  "/qr-codes":            ["superadmin", "trustee", "staff"],

  // ── COMMUNICATIONS ──
  "/communications":      ["superadmin", "staff"],
  "/comms-hub":           ["superadmin", "staff"],
  "/comms-inbox":         ["superadmin", "staff"],
  "/comms-v3":            ["superadmin", "staff"],
  "/meetings":            ["superadmin", "staff"],

  // ── REPORTS ──
  "/reports":             ["superadmin", "trustee"],

  // ── OPERATIONS ──
  "/bistro87":            ["superadmin"],
  "/accommodation":       ["superadmin"],
  "/facilities":          ["superadmin"],
  "/training-tracker":    ["superadmin"],

  // ── GOVERNANCE ──
  "/trustee-dashboard":   ["superadmin", "trustee"],
  "/compliance":          ["superadmin", "trustee"],
  // Sub-screens inside Compliance Cockpit — same access
  "/conflicts-register":  ["superadmin", "trustee"],
  "/decisions":           ["superadmin", "trustee"],
  "/bulk-approvals":      ["superadmin", "trustee"],
  "/lbmw-correspondence": ["superadmin", "trustee"],
  // People
  "/trustees":            ["superadmin", "trustee"],
  "/org-chart":           ["superadmin", "trustee"],

  // ── SYSTEM ──
  "/admin":               ["superadmin"],
  "/settings":            ["superadmin"],
  "/merge-history":       ["superadmin"],
  "/backups":             ["superadmin"],
  "/audit-trail":         ["superadmin"],
  "/system-health":       ["superadmin"],
};

/**
 * Check if a role category is allowed to access a given path.
 * Handles parameterised routes (e.g. /loans/123 → checks /loans).
 * Returns true if no explicit permission is defined (open by default).
 */
export function isRouteAllowed(path: string, roleCategory: RoleCategory): boolean {
  // Exact match first
  if (ROUTE_PERMISSIONS[path]) {
    return ROUTE_PERMISSIONS[path].includes(roleCategory);
  }

  // Try parent path for parameterised routes (e.g. /loans/123 → /loans, /donors/42 → /donors)
  const segments = path.split("/").filter(Boolean);
  while (segments.length > 1) {
    segments.pop();
    const parent = "/" + segments.join("/");
    if (ROUTE_PERMISSIONS[parent]) {
      return ROUTE_PERMISSIONS[parent].includes(roleCategory);
    }
  }

  // No explicit permission defined → allow (open by default for authenticated users)
  return true;
}
