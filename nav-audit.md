# Navigation Audit — Brief vs Current Implementation

## Sidebar Structure (NAVIGATION const in DashboardLayout.tsx)

### DAILY section
Brief: Scan Receipt, Dashboard
Current: ✅ Scan Receipt ("/"), Dashboard ("/dashboard")

### FINANCE section
Brief: My Expenses, Income & Rentals, Monthly Expenses, Bills & Utilities, Payment Hub, Reconciliation, Qarde Hasan Loans, Payroll
Current: ✅ All 8 items present with correct labels and paths

### DONORS & FUNDRAISING section
Brief: Donors, Campaigns, Gift Aid & CRM+, Fundraising
Current: ✅ All 4 items present

### COMMUNICATIONS section
Brief: Communications, Meetings & Onboarding
Current: ✅ Both items present

### REPORTS section
Brief: Reports
Current: ✅ Present

### OPERATIONS section
Brief: Bistro 87, Student Accommodation, Facilities & Bookings, Training Tracker
Current: ✅ All 4 items present

### GOVERNANCE section
Brief: Trustee Dashboard, Compliance Cockpit, People
Current: ✅ All 3 items present

### SYSTEM section
Brief: Admin Panel, Settings
Current: ✅ Both items present

## Role Visibility

### Superadmin — sees everything
Brief: All items
Current: ✅ All items have "superadmin" in visibleTo

### Trustee — ~10 items
Brief: Dashboard, Income & Rentals, Payment Hub, Qarde Hasan Loans, Donors, Campaigns, Reports, Trustee Dashboard, Compliance Cockpit, People
Current: 
- Dashboard ✅ ["superadmin", "trustee", "staff"]
- Income & Rentals ✅ ["superadmin", "trustee", "staff"]
- Payment Hub ✅ ["superadmin", "trustee"]
- Qarde Hasan Loans ✅ ["superadmin", "trustee"]
- Donors ✅ ["superadmin", "trustee", "staff"]
- Campaigns ✅ ["superadmin", "trustee", "staff"]
- Reports ✅ ["superadmin", "trustee"]
- Trustee Dashboard ✅ ["superadmin", "trustee"]
- Compliance Cockpit ✅ ["superadmin", "trustee"]
- People ✅ ["superadmin", "trustee"]
Count: 10 ✅

### Staff — ~9 items
Brief: Scan Receipt, Dashboard, My Expenses, Income & Rentals, Monthly Expenses, Donors, Campaigns, Communications, Meetings
Current:
- Scan Receipt ✅ ["superadmin", "staff"]
- Dashboard ✅ ["superadmin", "trustee", "staff"]
- My Expenses ✅ ["superadmin", "staff"]
- Income & Rentals ✅ ["superadmin", "trustee", "staff"]
- Monthly Expenses ✅ ["superadmin", "staff"]
- Donors ✅ ["superadmin", "trustee", "staff"]
- Campaigns ✅ ["superadmin", "trustee", "staff"]
- Communications ✅ ["superadmin", "staff"]
- Meetings & Onboarding ✅ ["superadmin", "staff"]
Count: 9 ✅

## Visual Hierarchy
- Section headers: 11px, uppercase, muted grey (#6B7280) ✅
- Menu items: text-sm (14px), white active, light grey inactive ✅
- Active item: green pill (#00B894 at 15% opacity) ✅
- Mobile: drawer-slide sidebar ✅

## Default Landing
Brief: Dashboard for everyone on login
Current: ✅ OAuth redirects to /dashboard, Login.tsx redirects to /dashboard

## Mobile Bottom Nav
Brief: Keep as-is
Current: ✅ Home, Income, Scan, Expenses, More

## Items to verify still work (not sidebar changes):
- Voice agent NAV_ROUTES updated ✅ (but brief says "Voice agent behaviour stays exactly as it currently works" — need to verify the NAV_ROUTES change was navigation-only, not behaviour change)
- Old URLs redirect properly (App.tsx routes)
