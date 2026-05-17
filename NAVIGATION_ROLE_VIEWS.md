# Navigation — Role-Filtered Sidebar Views

These are the exact items each role sees, derived from the `NAVIGATION` constant in `DashboardLayout.tsx`. The filtering logic uses `getRoleCategory(user.role)` which maps: superadmin/admin → "superadmin", trustee → "trustee", all others → "staff".

---

## View 1 — Superadmin (25 items)

Sees everything. This is the canonical structure.

```
DAILY
  📷  Scan Receipt                /
  📊  Dashboard                   /dashboard

FINANCE
  🧾  My Expenses                 /receipts
  💲  Income & Rentals            /income
  📋  Monthly Expenses            /monthly-expenses
  ⚡  Bills & Utilities           /bills-utilities        [badge: expiring/expired count]
  💳  Payment Hub                 /fintech
  ⚖️  Reconciliation              /reconciliation
  📖  Qarde Hasan Loans           /loans
  👛  Payroll                     /payroll

DONORS & FUNDRAISING
  👥  Donors                      /donor-crm
  🏢  Campaigns                   /campaigns
  🎁  Gift Aid & CRM+             /gift-aid
  🤲  Fundraising                 /fundraising

COMMUNICATIONS
  💬  Communications              /communications         [badge: unread inbox count]
  📅  Meetings & Onboarding       /meetings

REPORTS
  📊  Reports                     /reports

OPERATIONS
  🍴  Bistro 87                   /bistro87
  🏠  Student Accommodation       /accommodation
  🏢  Facilities & Bookings       /facilities
  🎓  Training Tracker            /training-tracker

GOVERNANCE
  🛡️  Trustee Dashboard           /trustee-dashboard
  ✅  Compliance Cockpit          /compliance
  👥  People                      /trustees

SYSTEM
  🛡️  Admin Panel                 /admin
  ⚙️  Settings                    /settings
```

**Total: 25 items across 8 sections**

---

## View 2 — Trustee (10 items)

Read-most-things, write-some-governance.

```
DAILY
  📊  Dashboard                   /dashboard

FINANCE
  💲  Income & Rentals            /income
  💳  Payment Hub                 /fintech
  📖  Qarde Hasan Loans           /loans

DONORS & FUNDRAISING
  👥  Donors                      /donor-crm
  🏢  Campaigns                   /campaigns

REPORTS
  📊  Reports                     /reports

GOVERNANCE
  🛡️  Trustee Dashboard           /trustee-dashboard
  ✅  Compliance Cockpit          /compliance
  👥  People                      /trustees
```

**Total: 10 items across 5 sections**
(COMMUNICATIONS, OPERATIONS, SYSTEM sections hidden entirely)

---

## View 3 — Staff (9 items)

Day-to-day operations. Reception, admin, secretary, fundraising assistants.

```
DAILY
  📷  Scan Receipt                /
  📊  Dashboard                   /dashboard

FINANCE
  🧾  My Expenses                 /receipts
  💲  Income & Rentals            /income
  📋  Monthly Expenses            /monthly-expenses

DONORS & FUNDRAISING
  👥  Donors                      /donor-crm
  🏢  Campaigns                   /campaigns

COMMUNICATIONS
  💬  Communications              /communications         [badge: unread inbox count]
  📅  Meetings & Onboarding       /meetings
```

**Total: 9 items across 4 sections**
(REPORTS, OPERATIONS, GOVERNANCE, SYSTEM sections hidden entirely)

---

## Mobile Bottom Nav (all roles)

Fixed 5-item bottom bar, unchanged:

```
  Home  |  Income  |  [Scan]  |  Expenses  |  More
```

"More" opens the full sidebar as a drawer from the left.

---

## Section visibility summary

| Section | Superadmin | Trustee | Staff |
|---------|-----------|---------|-------|
| DAILY | 2 items | 1 item | 2 items |
| FINANCE | 8 items | 3 items | 3 items |
| DONORS & FUNDRAISING | 4 items | 2 items | 2 items |
| COMMUNICATIONS | 2 items | hidden | 2 items |
| REPORTS | 1 item | 1 item | hidden |
| OPERATIONS | 4 items | hidden | hidden |
| GOVERNANCE | 3 items | 3 items | hidden |
| SYSTEM | 2 items | hidden | hidden |
| **Total** | **25** | **10** | **9** |
