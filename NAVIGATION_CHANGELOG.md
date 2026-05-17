# Navigation Restructure — Changelog

**Date:** 17 May 2026
**Scope:** Sidebar navigation only. No data models, business logic, screens, voice behaviour, audit logs, or API contracts were changed.

---

## Summary

The sidebar was reorganised from a flat ~35-item list into 8 labelled sections with role-based visibility. Three role views now exist: Superadmin (25 items), Trustee (10 items), Staff (9 items). Default landing changed from `/` to `/dashboard` for all users.

---

## Items that stay as top-level sidebar destinations

| Item | Section | Route | Change | Visible to |
|------|---------|-------|--------|------------|
| Scan Receipt | DAILY | `/` | Unchanged | superadmin, staff |
| Dashboard | DAILY | `/dashboard` | Unchanged | superadmin, trustee, staff |
| My Expenses | FINANCE | `/receipts` | Unchanged | superadmin, staff |
| Income & Rentals | FINANCE | `/income` | Unchanged | superadmin, trustee, staff |
| Monthly Expenses | FINANCE | `/monthly-expenses` | Unchanged | superadmin, staff |
| Bills & Utilities | FINANCE | `/bills-utilities` | Unchanged | superadmin |
| Payment Hub | FINANCE | `/fintech` | Unchanged | superadmin, trustee |
| Reconciliation | FINANCE | `/reconciliation` | Unchanged | superadmin |
| Qarde Hasan Loans | FINANCE | `/loans` | Unchanged | superadmin, trustee |
| Payroll | FINANCE | `/payroll` | Unchanged | superadmin |
| Donors | DONORS & FUNDRAISING | `/donor-crm` | Renamed from "Donor CRM" | superadmin, trustee, staff |
| Campaigns | DONORS & FUNDRAISING | `/campaigns` | Unchanged | superadmin, trustee, staff |
| Gift Aid & CRM+ | DONORS & FUNDRAISING | `/gift-aid` | Unchanged | superadmin |
| Fundraising | DONORS & FUNDRAISING | `/fundraising` | Unchanged | superadmin |
| Communications | COMMUNICATIONS | `/communications` | Unchanged (Comms Hub + Master Inbox merged as internal tabs) | superadmin, staff |
| Meetings & Onboarding | COMMUNICATIONS | `/meetings` | Unchanged | superadmin, staff |
| Reports | REPORTS | `/reports` | Unchanged | superadmin, trustee |
| Bistro 87 | OPERATIONS | `/bistro87` | Unchanged | superadmin |
| Student Accommodation | OPERATIONS | `/accommodation` | Unchanged | superadmin |
| Facilities & Bookings | OPERATIONS | `/facilities` | Unchanged | superadmin |
| Training Tracker | OPERATIONS | `/training-tracker` | Unchanged | superadmin |
| Trustee Dashboard | GOVERNANCE | `/trustee-dashboard` | Unchanged | superadmin, trustee |
| Compliance Cockpit | GOVERNANCE | `/compliance` | Unchanged (Conflicts, Decisions, Bulk Approvals, LBMW merged as internal tabs) | superadmin, trustee |
| People | GOVERNANCE | `/trustees` | Renamed from "Trustees & Staff Contacts" (Org Chart merged as internal tab) | superadmin, trustee |
| Admin Panel | SYSTEM | `/admin` | Unchanged | superadmin |
| Settings | SYSTEM | `/settings` | Unchanged (Backups, System Health, Merge History, Audit Trail merged as internal tabs) | superadmin |

---

## Items removed from top-level sidebar (now tabs inside parent screens)

| Item | Was | Now | Old URL still works? |
|------|-----|-----|---------------------|
| Pledges | Top-level sidebar item | Tab inside Donors | Yes — `/pledges` still loads |
| Cultivation Pipeline | Top-level sidebar item | Tab inside Donors | Yes — `/donor-pipeline` still loads |
| Major Donor DD | Top-level sidebar item | Tab inside Donors | Yes — `/major-donor` still loads |
| Saved Views | Top-level sidebar item | Tab inside Donors | Yes — `/saved-views` still loads |
| Recognition Tiers | Top-level sidebar item | Tab inside Donors | Yes — `/recognition-tiers` still loads |
| Donors Wall | Top-level sidebar item | Tab inside Donors | Yes — `/donors-wall` still loads |
| QR Codes | Top-level sidebar item | Tab inside Donors | Yes — `/qr-codes` still loads |
| Comms Hub | Top-level sidebar item | Tab "Broadcasts" inside Communications | Yes — `/comms-hub` still loads |
| Master Inbox | Top-level sidebar item | Tab "Inbox" inside Communications | Yes — `/comms-inbox` still loads |
| Conflicts Register | Top-level sidebar item | Tab inside Compliance Cockpit | Yes — `/conflicts-register` still loads |
| Decisions Register | Top-level sidebar item | Tab inside Compliance Cockpit | Yes — `/decisions` still loads |
| Bulk Approvals | Top-level sidebar item | Tab inside Compliance Cockpit | Yes — `/bulk-approvals` still loads |
| LBMW Correspondence | Top-level sidebar item | Tab inside Compliance Cockpit | Yes — `/lbmw-correspondence` still loads |
| Org Chart | Top-level sidebar item | Tab "Chart" inside People | Yes — `/org-chart` still loads |
| Merge History | Top-level sidebar item | Tab inside Settings | Yes — `/merge-history` still loads |
| Backups | Top-level sidebar item | Tab inside Settings | Yes — `/backups` still loads |
| System Health | Top-level sidebar item | Tab inside Settings | Yes — `/system-health` still loads |
| Audit Trail | Top-level sidebar item | Tab inside Settings | Yes — `/audit-trail` still loads |

---

## Other changes

| Change | Detail |
|--------|--------|
| Default landing | Changed from `/` (Scan Receipt) to `/dashboard` for all users on login |
| Section headers added | DAILY, FINANCE, DONORS & FUNDRAISING, COMMUNICATIONS, REPORTS, OPERATIONS, GOVERNANCE, SYSTEM |
| Voice agent NAV_ROUTES | Added aliases for new labels (e.g. "scan receipt", "bills and utilities", "compliance cockpit"). All old voice commands still work. No voice behaviour changed. |

---

## Files changed

| File | What changed |
|------|-------------|
| `client/src/components/DashboardLayout.tsx` | Sidebar definition rewritten with 8 sections and role-based visibility |
| `client/src/App.tsx` | Routes reorganised with section comments (no routes added or removed) |
| `client/src/components/HibbaVoice.tsx` | NAV_ROUTES dictionary updated with new aliases (navigation labels only) |
| `client/src/pages/Login.tsx` | Login redirect: `/` → `/dashboard` |
| `server/_core/oauth.ts` | OAuth redirect: `/` → `/dashboard` |
| `server/wave3.test.ts` | Test updated to check App.tsx for route presence instead of DashboardLayout |

---

## Files NOT changed

No changes to: `drizzle/schema.ts`, `server/db.ts`, `server/routers.ts`, `server/routers/*.ts` (business logic), any page component, any API contract, any voice agent behaviour.
