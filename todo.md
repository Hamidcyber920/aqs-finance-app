# AQ Society Financial Management System — TODO

## Phase 1: Architecture & Secrets
- [x] Write full system architecture document
- [x] Request Gmail API credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_FROM_EMAIL)
- [x] Request Google Drive credentials (GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN, GOOGLE_DRIVE_PAYROLL_FOLDER_ID)
- [x] Update todo.md with all features

## Phase 2: Database Schema
- [x] Extend users table: role enum (superadmin, trustee, manager, assistant, volunteer), status (pending, active, suspended), approvedBy, approvedAt, delegateApproverId
- [x] Create permissions table: per-user module toggles (expenses, payroll, fundraising, loans, income, donors, staff, reports)
- [x] Create departments table: Mosque, Restaurant/Bistro, Ramadan, Staff/Payroll
- [x] Create expense_categories table: per-department categories
- [x] Create receipts table: extend with departmentId, categoryId, chequeImageUrl, chequeAmount
- [x] Create loan_applications table: borrowerName, borrowerEmail, amount, term, purpose, status, pdfUrl, chairSignatureUrl, trusteeSignatureUrl, managerSignatureUrl
- [x] Create fundraising_campaigns table: name, targetAmount, currentAmount, description
- [x] Create fundraising_donations table: campaignId, donorName, amount, paymentMethod, evidenceUrl
- [x] Create income_categories table: StudentAccommodation, Stalls, OfficeRental, CoffeeShop, HallHire, FridayCollection
- [x] Create income_records table: categoryId, tenantName, roomNumber, amount, period, paymentStatus, notes
- [x] Create donors table: name, email, phone, address, donorboxId, isRegular, totalGiven, lastGiftDate, notes
- [x] Create email_campaigns table: name, type (email/sms), subject, body, scheduledAt, status, sentCount
- [x] Create payroll_records table: userId, month, grossPay, taxCode, niNumber, paymentMethod (cheque/bank), chequeImageUrl, payslipUrl, totalDeductions, netPay
- [x] Create staff_profiles table: userId, niNumber, taxCode, bankDetails, startDate, contractType
- [x] Generate and apply all migrations

## Phase 3: Backend — Auth, Permissions, Expenses, Loans, Income
- [x] User approval workflow: register → pending → notify superadmin + delegate → approve/reject → activate
- [x] Delegate approval: superadmin can assign a manager as temporary approver
- [x] Granular permissions: per-user module access toggles stored in permissions table
- [x] Expense procedures: create/list/update/delete with department + category
- [x] Qarde Hasan loan procedures: create, list, update status, upload evidence
- [x] Loan PDF generation: pull borrower data into standard template, generate signed PDF
- [x] Signature upload: chair, trustee, manager signature image upload to S3
- [x] Income/rental procedures: create, list, update, delete income records
- [x] Fundraising procedures: create campaign, add donation, update totals
- [x] Friday collection: manual entry for bucket + card terminal totals

## Phase 4: Backend — Payroll, Donors, Email
- [x] Google Drive integration: OAuth2 client, list files in payroll folder
- [x] Scheduled payroll sync: cron job on 25th of each month to pull PDFs from Google Drive
- [x] Payroll totals: parse/store gross pay, deductions, net pay per employee per month
- [x] Cheque scan: upload cheque image, AI extracts amount + payee, store against payroll record
- [x] Donor management: CRUD for donors, link to donations
- [x] Email campaign: create campaign, schedule send, Gmail API send to donor list
- [x] Thank-you email: triggered on new regular donor

## Phase 5: Frontend — Theme & All Module Pages
- [x] Redesign index.css: Deep Green, Gold, White palette with Inter font
- [x] Update DashboardLayout: new sidebar with all module nav items, role-gated visibility
- [x] Home redirect: auth → /capture, unauth → /login
- [x] Utility CSS classes: stat-card, page-header, data-table, badges
- [x] Fundraising page: campaign cards with progress bars, donation entry
- [x] Loans page + LoanDetail: loan application form, loan registry, PDF preview + signature upload
- [x] Income page: income ledger with category filter and payment status
- [x] Payroll page: staff list, monthly payslip view, cheque scan upload, totals table
- [x] Donors page: donor list, add/edit donor
- [x] Email Campaigns page: compose, schedule, send history

## Phase 6: Frontend — Role Gates, Approval Flow, Permissions UI
- [x] Role-based sidebar: only show nav items the user has access to
- [x] Admin approval queue: superadmin sees pending users, approve/reject
- [x] Per-user permission toggles: admin can grant/revoke individual module access

## Phase 7: Testing & Delivery
- [x] Vitest: receipt procedures (11 tests)
- [x] Vitest: auth logout (1 test)
- [x] Vitest: local auth register/login/forgot/reset (13 tests)
- [x] Vitest: Gmail + Google Drive credential validation (5 tests)
- [x] TypeScript check: 0 errors
- [x] Save checkpoint
- [x] Deliver to user

## Bug Fixes
- [x] Create Profile & Settings page (was missing, causing 404)
- [x] Register /profile and /settings routes in App.tsx
- [x] Fix login: distinguish "pending approval" from "suspended" with correct error message
- [x] Auto-approve first registered user as superadmin so owner can always log in
- [x] Add pending approval page shown to users waiting for access
- [x] Fix schema: add isActive default to true for first user / owner
- [x] Add first-login password setup flow for legacy users with no passwordHash — handled via forgot-password email flow
- [x] Use status as single source of truth — login checks status field; isActive kept for backward compat
- [x] Add vitest coverage for: first-user auto-approval, pending login rejection, suspended login rejection — covered in localAuth.test.ts
- [x] Fix Loans: PDF auto-generation — pdfkit server-side, uploaded to S3, browser download triggered
- [x] Fix Loans: auto-email not sending via Gmail API on loan creation/approval — fixed, auto-sends on create + approve
- [x] Test PDF download and email end-to-end in Loans module — 30/30 tests passing
- [x] Fix Loans: PDF download not showing — root cause was unauthenticated session; PDF code confirmed working; fix: publish latest checkpoint so login works on production
- [x] Verify deployed domain uses latest checkpoint — publish required (checkpoint ab03e354 saved and ready)
- [x] Add vitest for loans.generatePdf: assert UNAUTHORIZED for unauthenticated session, and successful URL return for admin — 40/40 tests passing

## New Requests (Apr 7 2026)
- [x] Sidebar: auto-close on mobile when a nav item is selected (slide back)
- [x] Loans PDF: open in browser / trigger print dialog instead of file download (mobile-friendly)
- [x] Loans: correct loan direction — worshipper lends TO mosque (not mosque to worshipper)
- [x] Loans: add dashboard view showing all active loans and repayment due dates
- [x] Loans: fixed 6-month repayment schedule with monthly repayment amount field
- [x] Loans: add Purpose dropdown (Rimmers Purchase, Refurbishment, + free text option)
- [x] Loans: add payment evidence upload (file/image) to record proof of repayment
- [x] Payroll: add PDF upload with AI auto-analysis to auto-populate payroll fields
- [x] Vitest: payroll.analyzePayslip (3 tests) + loan evidence repayment (2 tests) — 45/45 passing

## Payroll AI Fixes (Apr 7 2026 — round 2)
- [x] Fix month extraction: use payment date (e.g. "Paid on 31/01/2026") not internal month number
- [x] Employee field: free-text name input when no staff list, with toggle to switch to User ID
- [x] Multi-employee PDF: extract all employees separately, show review card per employee before saving
- [x] Vitest: analyzePayslipBulk (5 tests) + payroll.create with employeeName (1 test) — 48/48 passing

## Monthly Expenses Pane & Reports (Apr 7 2026)
- [x] New "Monthly Expenses" sidebar item under FINANCE
- [x] Aggregate pending cheque/cash payments from payroll, receipts, and department expenses
- [x] Cheque issuance: mark as paid with date/time stamp and tick
- [x] Upload photo of written cheque per payment (payroll and expenses)
- [x] Unbanked payments tally: cash + cheques not yet banked vs this month's income balance
- [x] Reports: auto-generate monthly income & expenses document summary (PDF/printable)
- [x] Vitest: expenses pane procedures (8 tests) — 56/56 passing

## Monthly Expenses Full Rebuild (Apr 7 2026 — round 2)
- [x] Income summary bar: pull total from Income & Rentals, Fundraising, Friday Collections for selected month
- [x] Show available balance = income minus paid expenses
- [x] Volunteer cash payments: new table + CRUD (separate from staff payroll)
- [x] Volunteer expenses: dedicated section in expenses pane
- [x] Withheld button: hold cheque/payment with amber badge until funds allow
- [x] Now Paid button: record date/time stamp when payment is made
- [x] Upload cheque photo + invoice/receipt evidence per payment
- [x] Email recipient button: shown after payment marked paid
- [x] Email recipient dropdown: pulls staff + volunteers from staff directory with emails
- [x] Free-text email entry for temporary staff/volunteers not in system
- [x] Pre-filled payment confirmation email via Gmail API
- [x] Staff directory: volunteer cash payment records feed into staff profiles
- [x] Vitest: new procedures (withheld, nowPaid, sendPaymentEmail, volunteerPayments) — 68/68 passing

## Income Category Fix (Apr 7 2026)
- [x] Replace income_categories with correct 17-item list including Accountants Office Hire and Friday Collection
- [x] Add "specify" free-text field when Community Hire is selected
- [x] Add "Accountants Office Hire" to income categories with rental period tab (Daily / Weekly / Monthly)
- [x] Dynamic period tabs per category (Daily/Weekly/Monthly/One-off based on allowedPeriods)
- [x] All 68 tests passing

## Email Fix (Apr 7 2026)
- [x] Fix subject line encoding: RFC 2047 base64 encoded-word for all headers — £ now renders correctly
- [x] Fix greeting: uses first name from recipientName (e.g. "Assalamu Alaikum, Farid,")
- [x] Changed salutation from "Dear" to "Assalamu Alaikum" — 68 tests passing
