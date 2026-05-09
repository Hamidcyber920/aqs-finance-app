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

## Email Name Fix (Apr 7 2026)
- [x] Fix pendingPayments query: join staffProfiles.fullName + users.name, prefer fullName over username
- [x] Email dialog: always shows editable Recipient Name field (pre-filled, overridable)
- [x] staffProfile.upsert: added fullName field so staff can have proper display name
- [x] staffDirectory: now returns fullName from staffProfiles when available
- [x] 68 tests passing

## Three Improvements (Apr 7 2026)
- [x] Monthly Expenses: Bulk "Save All" button to mark all pending payroll as paid at once
- [x] Loan emails: Assalamu Alaikum greeting + fullName lookup (same fix as payment emails)
- [x] Admin Panel: Full Name field visible and editable in staff profile form (pencil icon inline edit)
- [x] 68 application tests passing (3 credential tests failing due to expired OAuth tokens — not a code issue)

## Month-End Reconciliation Module (May 2026)
- [x] DB: reconciliation_sessions table (month, year, bankBalance, closingBalance, status, notes, createdAt)
- [x] Backend: createOrGetSession, saveBankBalance, aggregateAllPayments (payroll + loans + expenses + volunteers)
- [x] Backend: markPaymentPaid, withholdPayment, uploadChequePhoto, uploadInvoicePhoto per reconciliation row
- [x] Backend: reconciliationSummary (opening balance, all rows, closing balance, unreconciled items)
- [x] Frontend: bank balance input at top, editable
- [x] Frontend: 25th deadline indicator (days remaining / overdue)
- [x] Frontend: prioritised payment rows (Payroll → Qarde Hasan → Invoices → Volunteers)
- [x] Frontend: running balance tally (bank - paid - committed = remaining), red when overdrawn
- [x] Frontend: Withhold button (non-payroll only) with reason, Pay Now button
- [x] Frontend: cheque photo + invoice photo upload per row
- [x] Frontend: printable reconciliation summary (open in browser tab)
- [x] Sidebar: add "Reconciliation" nav item under FINANCE (admin-only)
- [x] Vitest: reconciliation procedures (8 tests) — 76/79 passing (3 credential tests = expired OAuth tokens, not code)

## Sidebar Finance Restructure (May 2026)
- [x] Split FINANCE section into three sub-sections: INCOME, EXPENSES, RECONCILIATION
- [x] INCOME sub-section: Fundraising, Qarde Hasan Loans, Income & Rentals
- [x] EXPENSES sub-section: Payroll, Monthly Expenses
- [x] RECONCILIATION sub-section: Reconciliation (standalone)

## Superadmin Dashboard — All Users Expenses (May 2026)
- [x] Backend: add admin procedure to list all receipts with submitter name, role, and department
- [x] Backend: support optional userId filter param so admin can drill into one user
- [x] Dashboard: show "All Users Expenses" section for superadmin/trustee/manager roles
- [x] Dashboard: user filter dropdown (All Users + individual users)
- [x] Dashboard: expense table with columns: User, Date, Category, Amount, Status, Description
- [x] Dashboard: summary stats (total spend, number of receipts, pending approvals) across all users

## Reconciliation Rebuild (May 2026)
- [x] Schema: carry-forward handled via withheld status (no new columns needed)
- [x] Schema: payment evidence already in chequeImageUrl/invoiceUrl columns
- [x] Backend: pull total income (incomeRecords + fridayCollections + fundraisingDonations)
- [x] Backend: pull total expenditure (receipts all users + payrollRecords + loanRepayments + volunteers)
- [x] Backend: group expenditure by payment method (cash / cheque / bank transfer)
- [x] Backend: carry-forward — withheld items from prev month auto-loaded into current month
- [x] Backend: auto-carry-forward query — loads prev month withheld items with carriedFrom tag
- [x] Frontend: Income section — total with breakdown by source
- [x] Frontend: Expenditure section — total with breakdown (payroll, receipts, qarde hasan, volunteers)
- [x] Frontend: Payment method tabs (Cash / Cheque / Bank Transfer) each with photo evidence upload
- [x] Frontend: Reconciliation balance = bank balance - total pending outgoings
- [x] Frontend: Carry-forward panel — items from previous month shown with "Prev Month" badge
- [x] Frontend: Pay/Withhold per item with camera photo or file upload evidence

## Monthly Expenses Rebuild (May 2026)
- [x] Schema: add authorisedById, authorisedAt, authorisedByName to payrollRecords, receipts, volunteerPayments, loanRepayments
- [x] Schema: add rejectedById, rejectedAt, rejectionComment, deferredToMonth, deferredToYear to same tables
- [x] Backend: extractChequeData procedure — upload image, use LLM vision to extract cheque number, date, amount
- [x] Backend: authorise procedure — stamp authorisedById/At on any item type
- [x] Backend: reject procedure — stamp rejectedById/At + comment, set deferredToMonth/Year
- [x] Backend: monthlyExpenses.list — return all 4 types (payroll, receipts, volunteers, loans) for a month
- [x] Frontend: month/year selector at top
- [x] Frontend: four collapsible sections: Payroll, Invoices/Receipts, Volunteer Payments, Qarde Hasan
- [x] Frontend: each item shows evidence upload (camera + file), cheque photo upload with AI extraction
- [x] Frontend: cheque upload auto-populates cheque number, date, amount fields
- [x] Frontend: green tick (✓) authorise button — stamps authorisedBy + datetime
- [x] Frontend: red X reject button — opens comment dialog, marks red, defers to next month
- [x] Frontend: authorised items show "Authorised by [Name] at [datetime]" badge in green
- [x] Frontend: rejected items shown in red with comment, labelled "Deferred to [next month]"
- [x] Frontend: add new expense entry form (for invoices and ad-hoc items via volunteer payments)

## Monthly Expenses — Invoices Tab (May 2026)
- [x] Schema: create invoices table with category, subCategory, description, amount, vendor, evidenceUrl, chequeImageUrl, chequeNumber, chequeDate, chequeAmount, paymentMethod, paymentStatus, authorisation and rejection fields, month, year
- [x] Backend: invoices.list procedure (by month/year, includes deferred from prev month)
- [x] Backend: invoices.create procedure
- [x] Backend: invoices.authorise procedure
- [x] Backend: invoices.reject procedure (defers to next month)
- [x] Backend: invoices.markPaid procedure
- [x] Frontend: Invoices tab in Monthly Expenses page
- [x] Frontend: category dropdown with sub-categories (restaurant, cleaning, events, wholesale, temp staff, travel, trustees, maintenance x3, uniforms, accommodation)
- [x] Frontend: custom description field + vendor + amount
- [x] Frontend: evidence upload (camera + file)
- [x] Frontend: cheque photo upload with AI extraction (auto-fills cheque number, date, amount)
- [x] Frontend: green tick authorise + red X reject with comment + defer to next month
- [x] Frontend: authorised badge shows name + datetime
- [x] Frontend: deferred items from prev month shown with "Prev Month" badge

## Monthly Expenses — Invoices Tab + Universal AI Extraction (May 2026)
- [x] Schema: create invoices table with category, subCategory, description, amount, vendor, invoiceNumber, evidenceUrl, chequeImageUrl, chequeNumber, chequeDate, chequeAmount, paymentMethod, paymentStatus, authorisation/rejection fields, month, year
- [x] Backend: invoices.list (by month/year, includes deferred from prev month)
- [x] Backend: invoices.create
- [x] Backend: invoices.authorise
- [x] Backend: invoices.reject (defers to next month)
- [x] Backend: invoices.markPaid
- [x] Backend: expenses.extractEvidence — universal AI extraction procedure for any uploaded evidence image (returns vendor, amount, date, chequeNumber, invoiceNumber, description)
- [x] Frontend: Invoices tab in Monthly Expenses
- [x] Frontend: category dropdown with sub-categories (restaurant, cleaning, events, wholesale, temp staff, travel, trustees, maintenance x3, uniforms, accommodation)
- [x] Frontend: custom description + vendor + amount fields
- [x] Frontend: evidence upload with AI extraction on ALL sections (Invoices, Payroll, Receipts, Volunteers, Qarde Hasan)
- [x] Frontend: AI extraction auto-fills vendor, amount, date, cheque/invoice number, description on upload
- [x] Frontend: green tick authorise + red X reject with comment + defer to next month

## Qarde Hasan Repayment Term Enhancement (May 2026)
- [x] Schema: add termValue (int), termUnit (varchar months/years), termNotes (text) columns to loanApplications table
- [x] Migration: drizzle/0012_worried_mulholland_black.sql generated and applied to database
- [x] Backend: loans.create procedure updated — accepts termValue, termUnit, termNotes; computes termMonths (years × 12); email shows human-readable term label
- [x] Frontend: Loans.tsx form — replaced fixed "6 months" field with: number input + Months/Years toggle button group + optional term notes textarea
- [x] Frontend: computedMonthly useMemo updated to use termValue × (12 if years else 1) for correct monthly calculation
- [x] Frontend: loan cards and list view show human-readable term via formatTerm() helper (e.g. "2 years" or "18 months")
- [x] Frontend: term notes shown on loan card if present

## Qarde Hasan — Loan Document Workflow & Trustee Approval (May 2026)
- [x] Schema: create trustees table (name, email, phone, role, isActive, createdAt)
- [x] Schema: add trusteeId (FK trustees), trusteeApprovedAt, trusteeApprovedByName to loanApplications
- [x] Schema: add trusteeId, trusteeApprovedAt, trusteeApprovedByName to loanRepayments
- [x] Migration: generate and apply migration for trustees table + new loan columns
- [x] Backend: trustees.list, trustees.create, trustees.update, trustees.delete procedures
- [x] Backend: loans.approveTrustee procedure — trustee signs off with datetime stamp
- [x] Backend: loans.approveAdmin procedure — superadmin/manager signs off with datetime stamp
- [x] Backend: update loans.approve to require both admin + trustee approval before status → approved
- [x] Backend: update loan PDF to include trustee name, repayment schedule table, AQS Shariah statement
- [x] Backend: send WhatsApp link (wa.me) + email to borrower on full approval (both signed)
- [x] Backend: loanRepayments.confirmReceived — admin marks repayment received in bank, triggers dual approval flow
- [x] Backend: loanRepayments.approveTrustee — trustee signs off repayment confirmation
- [x] Backend: loanRepayments.approveAdmin — admin signs off repayment confirmation
- [x] Backend: send WhatsApp link + email to borrower on repayment confirmation (both signed)
- [x] Backend: generate repayment confirmation PDF per instalment
- [x] Frontend: Trustees page under Admin section — add/edit/delete trustees with name, email, phone, role
- [x] Frontend: Sidebar — add "Trustees" nav item under ORGANISATION (admin-only)
- [x] Frontend: Loans new application form — trustee dropdown (from trustees DB) for co-signer selection
- [x] Frontend: LoanDetail page — dual approval section: Admin tick + Trustee tick, each with datetime stamp
- [x] Frontend: LoanDetail — show approval status badges (Pending Admin / Pending Trustee / Fully Approved)
- [x] Frontend: LoanDetail — repayment rows show "Confirm Received" button, then dual approval flow
- [x] Frontend: repayment confirmation shows WhatsApp link button alongside email button

## SMTP Email Fix (May 2026)
- [x] Replace Gmail OAuth with nodemailer SMTP sender
- [x] Fix SMTP_PASSWORD — env var was being overridden by BYOK credential; added 16-char length validation with correct App Password fallback
- [x] SMTP test passed: email sent successfully to ahamid4@gmail.com via smtp.gmail.com:587
- [x] Production build clean (zero errors)

## Audit & Update — Timestamps, Deletion Policy, Bank Statement Reader (May 2026)

### Timestamps on all income/expense entries
- [x] Audit schema: confirm createdAt/updatedAt on receipts, incomeRecords, payrollRecords, volunteerPayments, loanApplications, loanRepayments, fundraisingDonations, fridayCollections, invoices
- [x] Add missing createdAt/updatedAt columns where absent and apply migration
- [x] Ensure all data entry forms display the timestamp on submitted entries
- [x] Show createdAt timestamp on all list views and detail pages

### Monthly Expenses & Reconciliation — pull from ALL categories
- [x] Audit monthlyExpenses.list: confirm it pulls receipts, payroll, volunteers, loans, AND invoices
- [x] Audit reconciliation.fullStatement: confirm it pulls incomeRecords, fridayCollections, fundraisingDonations, AND all expense types
- [x] Fix any missing data sources in either procedure

### Deletion Policy
- [x] Backend: add canDelete helper — allow delete if (createdAt within 10 min AND own entry) OR role is superadmin/trustee
- [x] Apply canDelete check to: receipts.delete, incomeRecords.delete, payrollRecords.delete, volunteerPayments.delete, loanApplications.delete, loanRepayments.delete, invoices.delete, fundraisingDonations.delete, fridayCollections.delete
- [x] Frontend: show delete button only when canDelete is true; show "Cannot delete — contact superadmin" tooltip otherwise
- [x] Frontend: for entries within 10-min window, show countdown timer on delete button

### Bank Balance — AI Statement Reader
- [x] Backend: bankStatement.extract procedure — accept image URL or PDF URL, use LLM vision to extract closing balance, statement date, account name, sort code, account number
- [x] Frontend: Reconciliation bank balance section — add "Scan Statement" button with camera/file upload
- [x] Frontend: on upload, call AI extraction, auto-populate bank balance field with extracted closing balance
- [x] Frontend: show extracted statement details (date, account, balance) as confirmation before applying

## Multi-Step Deletion Confirmation (May 2026)
- [x] Build reusable DeleteConfirmDialog component: single-step for general users, two-step (tick twice) for superadmin/trustee
- [x] Wire into Receipts page delete buttons
- [x] Wire into Income & Rentals page delete buttons
- [x] Wire into Invoices / Monthly Expenses page delete buttons
- [x] Wire into Fundraising donations delete buttons
- [x] Wire into Friday Collections delete buttons
- [x] Wire into Volunteer Payments delete buttons
- [x] Wire into Trustees page delete buttons

## Dynamic Category Tabs — Income & Expenses (May 2026)
- [x] Audit: list all current expense departments and income categories in DB
- [x] Monthly Expenses: add tab per expense department (Mosque, Restaurant/Bistro, Ramadan, Staff/Payroll + any custom)
- [x] Monthly Expenses: each tab has a manual entry form (date, description, amount, payee, receipt upload)
- [x] Monthly Expenses: "Add Department" button creates a new tab and persists to DB
- [x] Monthly Expenses: new departments appear as tabs immediately after creation
- [x] Income & Rentals: add tab per income category (Student Accommodation, Stalls, Office Rental, Coffee Shop, Hall Hire, Friday Collection + any custom)
- [x] Income & Rentals: each tab has a manual entry form (date, payer, amount, reference, notes)
- [x] Income & Rentals: "Add Category" button creates a new tab and persists to DB
- [x] Income & Rentals: new categories appear as tabs immediately after creation
- [x] Sidebar: dynamic income category tabs link to filtered Income & Rentals view
- [x] Reconciliation: all dynamic categories included in totals

## Staff Roles, Supervision & Permissions (May 2026)
- [x] Schema: add 'deputy' and 'property_manager' to role enum in users table
- [x] Schema: add supervisedById (FK users) and isPropertyManager (boolean) columns to users table
- [x] Migration: generate and apply migration for new role values + supervisedById + isPropertyManager
- [x] Backend: create Mumin Khan account (role: manager, supervisedBy: superadmin/trustee)
- [x] Backend: create Farid Ahmed account (role: deputy, supervisedBy: Mumin Khan, isPropertyManager: true)
- [x] Backend: users.createStaff procedure — superadmin only, accepts name, email, role, supervisedById, isPropertyManager, tempPassword
- [x] Backend: lock permissions.grant/revoke to superadmin and trustee only
- [x] Frontend: Admin Panel — add "Create Staff" button (superadmin only) with full form: name, email, role, supervisor dropdown, property manager toggle, temp password
- [x] Frontend: Admin Panel — show supervisor chain on each user row (supervised by: X)
- [x] Frontend: Admin Panel — show "Property Manager" badge on Farid Ahmed's row
- [x] Frontend: permissions panel — hide grant/revoke controls from manager/assistant/volunteer roles (superadmin/trustee only)
- [x] Frontend: DashboardLayout — show property manager badge in sidebar for users with isPropertyManager = true

## Expanded Permissions — Manager & Deputy Access (May 2026)
- [x] Schema: add new permission columns — canViewFinanceReports, canExportFinanceReports, canManageCashCollection, canManageFridayCollection, canReconcileFriday, canViewReconciliation, canManageReconciliation, canTrackFinance, canViewAllIncome, canViewAllExpenses, canApproveExpenses, canManageInvoices
- [x] Migration: generate and apply migration for new permission columns
- [x] Backend: seed default permissions for manager role (high-level access: finance reports, cash, reconciliation, tracking)
- [x] Backend: seed default permissions for deputy role (moderate access: cash collection, Friday, income/expense view)
- [x] Backend: update users.createStaff to auto-seed role-based default permissions on account creation
- [x] Frontend: Permissions dialog — group permissions into categories (Finance, Cash & Collections, Reconciliation, Staff & Admin)
- [x] Frontend: Permissions dialog — add all new permission toggles with descriptions
- [x] Frontend: Admin Panel — show permission summary badge on each user row (e.g. "12/18 permissions")

## Friday Collection — Two-Step Authorisation (May 2026)
- [x] Schema: add authorisedById (FK users), authorisedAt (timestamp), authorisedByName (varchar) to fridayCollections table
- [x] Migration: generate and apply migration
- [x] Backend: fridayCollections.authorise procedure — role guard (manager/deputy/trustee only), stamps authorisedById/At/ByName
- [x] Backend: fridayCollections.unauthorise procedure — remove authorisation (same role guard)
- [x] Backend: fridayCollections.list — return authorisedById, authorisedAt, authorisedByName, createdAt on each row
- [x] Frontend: Friday Collection entries show createdAt timestamp ("Recorded: 12 May 2026 14:32")
- [x] Frontend: each entry has an "Authorise" tick button (green tick icon), visible only to manager/deputy/trustee
- [x] Frontend: clicking Authorise opens a confirmation dialog: "Have you checked and confirmed these figures are correct?" with Cancel / Confirm & Sign Off buttons
- [x] Frontend: after sign-off, entry shows "Authorised by [Name] at [datetime]" green badge
- [x] Frontend: authorised entries show a lock icon; unauthorised show amber "Pending Authorisation" badge
- [x] Frontend: unauthorised entries show a warning if older than 24 hours without sign-off

## Friday Collection — Cash Withheld Sub-Entry (May 2026)
- [x] Schema: add cashWithheld, cashWithheldReason, cashWithheldRecordedById, cashWithheldRecordedAt, cashWithheldRecordedByName, cashWithheldConfirmedById, cashWithheldConfirmedAt, cashWithheldConfirmedByName to fridayCollections
- [x] Migration: apply migration for new columns
- [x] Backend: fundraising.recordCashWithheld — bookkeeper role only (Farid Ahmed / deputy), records amount + reason + timestamp
- [x] Backend: fundraising.confirmCashWithheld — manager/trustee only (Mumin Khan / trustee), confirms with timestamp
- [x] Frontend: Friday Collection row — "Cash Withheld" sub-entry button below each collection
- [x] Frontend: Cash Withheld form — amount field + comment/reason box, bookkeeper-only
- [x] Frontend: dual-authority display — shows bookkeeper entry + manager confirmation tick with timestamps
- [x] Frontend: confirmation dialog for manager — "Have you verified this cash withheld amount?" with checkbox
- [x] Monthly Expenses: cash withheld amounts appear as a line item under Friday Collections
- [x] Reconciliation: cash withheld deducted from Friday Collection income total, shown as separate line

## Universal AI Document Ingestion (May 2026)

### Backend — Universal Extraction Procedure
- [x] Backend: documents.extract procedure — accepts fileUrl + mimeType + moduleType, uses LLM vision/text to extract structured data
- [x] Backend: moduleType enum: income_rental, loan_repayment, loan_application, invoice, payroll, friday_collection, fundraising_donation, receipt
- [x] Backend: CSV parsing path — detect CSV, parse rows, map columns to module schema fields
- [x] Backend: PDF path — upload to S3, pass URL to LLM with file_url content type
- [x] Backend: Image path — pass URL to LLM with image_url content type
- [x] Backend: discrepancy detection — compare extracted values against existing DB records for same entity (tenant/borrower/employee), flag mismatches
- [x] Backend: return structured result: extractedFields, matchedRecord (if found), discrepancies array, confidence score

### Frontend — SmartUpload Component
- [x] Build SmartUpload component: drag-drop zone + camera button + file picker, accepts image/PDF/CSV
- [x] Upload file to S3, call documents.extract, show loading spinner
- [x] Show extraction preview card: each extracted field with value and confidence indicator
- [x] Red-flag discrepancies: if extracted value differs from existing DB record, show red badge "Extracted: £450 / On record: £500 — please verify"
- [x] Confirm & Import button: creates/updates the DB record with extracted values
- [x] Skip / Edit button: allow manual correction before import
- [x] Show import summary: "3 records imported, 1 flagged for review"

### Income & Rentals — AI Ingestion
- [x] Add SmartUpload button to Income & Rentals page header ("Import from Document")
- [x] Extract: tenant name, room/unit, amount, payment period, payment method, payment date, category
- [x] Match tenant name against existing incomeRecords for same category
- [x] Flag discrepancies: amount differs, period differs, tenant name near-match (fuzzy)
- [x] Auto-select correct category tab based on extracted category
- [x] Bulk import: CSV with multiple tenants → creates multiple income records in one pass

### Qarde Hasan Loans — AI Ingestion
- [x] Add SmartUpload button to Loans page ("Import Repayment from Document")
- [x] Extract: borrower name, repayment amount, repayment date, reference number
- [x] Match borrower name against existing loanApplications (fuzzy match)
- [x] Flag discrepancies: amount differs from scheduled instalment, borrower name near-match
- [x] Auto-fill repayment form with extracted data for review before saving
- [x] Loan application import: extract borrower name, amount requested, purpose, term from uploaded form

### Monthly Expenses / Invoices — AI Ingestion
- [x] SmartUpload already exists for individual invoices — extend to bulk CSV import
- [x] CSV import: vendor, amount, category, description, date → creates multiple invoice records
- [x] PDF invoice: extract vendor, invoice number, amount, VAT, date, description → auto-fill invoice form
- [x] Flag: invoice number already exists in DB (duplicate detection)

### Payroll — AI Ingestion
- [x] Payroll PDF already has AI analysis — extend to CSV payroll export import
- [x] CSV: employee name, gross pay, deductions, net pay, month → bulk create payroll records
- [x] Flag: employee not found in staff directory, amount differs from previous month by >20%

### Fundraising & Friday Collections — AI Ingestion
- [x] SmartUpload for Friday Collection: upload tally sheet image → extract bucket total, card terminal total, date
- [x] Flag: total differs from manually entered value if record already exists for that date
- [x] SmartUpload for Donations: upload bank statement or donation receipt → extract donor name, amount, date, reference
- [x] Match donor name against existing donors table (fuzzy match)

## SmartUpload Role Gate (May 2026)
- [x] Backend: change documents.extract from protectedProcedure to superadmin/trustee-only procedure
- [x] Frontend: SmartUpload component accepts optional `allowedRoles` prop; hides button if user role not in list
- [x] Frontend: all SmartUpload usages default to allowedRoles=["superadmin","trustee"]
- [x] Frontend: show tooltip/message "Only superadmins and trustees can import documents" for lower roles

## App Redesign & Organisation Chart (May 2026)
- [x] Global theme: rich green/gold palette, modern typography (Inter), gradient sidebar, card shadows
- [x] Sidebar: gradient background, active state highlight, mobile hamburger menu with slide-out drawer
- [x] Dashboard: hero stats cards with colour accents, progress bars, modern chart styling
- [x] Mobile-first responsive layout across all pages
- [x] DB: org_members table (id, name, role, title, department, photoUrl, parentId, sortOrder, isActive)
- [x] Backend: orgChart.list, orgChart.upsert, orgChart.delete procedures (seniorProcedure gated)
- [x] Organisation Chart page under Organisation section in sidebar
- [x] Seed default hierarchy: Trustees → Management Trustee/Super Admin → Manager → Deputy → Teams
- [x] Tree view with collapsible/expandable nodes, photo avatars, name and title labels
- [x] Photo upload per node (drag-drop or file picker, uploads to S3)
- [x] Add/edit/remove node form (name, title, department, parent, photo)
- [x] Mobile-friendly org chart (horizontal scroll or vertical stacked view)

## Full Responsive / Mobile Optimisation (May 2026)
- [x] DashboardLayout: add persistent bottom nav bar on mobile (5 key links)
- [x] DashboardLayout: sidebar slides in as drawer on mobile, closes on nav
- [x] DashboardLayout: mobile top bar shows logo + hamburger + user avatar
- [x] DashboardLayout: all touch targets min 44px height
- [x] Login page: full-screen on mobile, card fills width with padding
- [x] Dashboard/Home: stat cards stack to 2-col grid on mobile (grid-cols-2 sm:grid-cols-4)
- [x] Data tables: overflow-x-auto horizontal scroll on mobile (Income, Loans, Payroll, Fundraising)
- [x] Dialogs: max-h-[90vh] overflow-y-auto applied to all dialogs
- [x] Org Chart: horizontal scroll on mobile (overflow-x-auto + min-w-max), cards scale down (w-44 sm:w-52)
- [x] Global: font sizes, spacing, and padding tuned for small screens
- [x] Global: no horizontal overflow on any page at 375px width

## Daily Automated Backup System (May 2026)
- [x] Backend: backup.create procedure — exports all 22 tables as JSON, uploads to S3 with timestamped key
- [x] Backend: backup.list procedure — returns last 30 backup metadata records from DB (superadmin/trustee only)
- [x] Backend: backup.download procedure — returns presigned S3 URL for a specific backup (superadmin/trustee only)
- [x] Schema: create system_backups table (id, filename, s3Key, s3Url, sizeBytes, tableCount, recordCount, triggeredBy, status, createdAt)
- [x] Migration: 0022_glorious_mordo.sql applied to database
- [x] Frontend: Backups page (/backups) — last 30 backups with date, size, record count, status, download button
- [x] Frontend: Backups nav item added to sidebar under Administration section
- [x] Scheduled task: daily at 02:00 UTC — POST /api/scheduled/backup
- [x] Owner notification: Manus notification sent after each successful backup

## Real-Time Write-Triggered Backup (May 2026)
- [x] Backend: debounced backup queue — in-memory timer, resets on each write, fires after 5 min of inactivity
- [x] Backend: triggerBackupSoon() helper exported from backup router
- [x] Backend: Express middleware on /api/trpc POST intercepts all mutations and calls triggerBackupSoon() on finish
- [x] Backend: backup metadata includes triggeredBy="realtime" to distinguish from daily scheduled backups
- [x] Frontend: Backups page shows "Auto (data change)" label on write-triggered backups

## AI Voice Agent (May 2026)

### Backend
- [x] server/routers/voiceAgent.ts: voiceAgent.query procedure — accepts transcript + currentPage context, uses LLM with function-calling tools to route intent
- [x] LLM tools: get_expenses, get_income, get_payroll, get_loans, get_friday_collections, get_financial_summary, get_donors, get_staff
- [x] LLM tools: create_payroll_record, create_income_record, create_expense, create_friday_collection, navigate_to_form
- [x] LLM response: structured JSON with { answer, audioUrl, navigationAction, dataCreated }
- [x] voiceAgent.transcribe procedure — accepts audioUrl, calls Whisper, returns transcript
- [x] voiceAgent.speak procedure — accepts text, calls TTS API, returns audio URL

### Frontend
- [x] Floating voice button (bottom-right, above mobile nav bar) — Sparkles icon, pulsing animation when recording
- [x] VoiceAgent component: hold-to-talk button, recording timer, waveform visualiser (20 animated bars)
- [x] On release: upload audio to /api/upload, call voiceAgent.transcribe, show transcript
- [x] Call voiceAgent.query with transcript + current page route
- [x] Display agent text response in chat bubble overlay with message history
- [x] Play TTS audio response automatically; replay button on each agent message
- [x] If navigationAction returned: navigate to correct page after 1.5s delay
- [x] VoiceAgent accessible from every page via DashboardLayout
- [x] Mobile: panel slides up above bottom nav bar, full-width on small screens

## Hibba Rebrand (May 2026)
- [x] Global: CSS variables updated to Hibba palette (Navy #0A192F, Purple #635BFF, Mint #00FFC2, Alabaster #F8F9FA)
- [x] Global: Inter font loaded from Google Fonts CDN in index.html
- [x] Global: border-radius tokens set to 12px (rounded-xl as default)
- [x] Global: app title changed to "Hibba" in index.html
- [x] Welcome screen: full-screen split layout — navy left panel with geometric gift logo + copy, white right panel with login card
- [x] Welcome screen: "hibba" lowercase wordmark with geometric diamond gift icon in Electric Purple / Emerald Mint
- [x] Welcome screen: headline "Administration, simplified." + sub-headline "A gift of clarity for your society's growth."
- [x] Welcome screen: login card with Amanah quote and "Enter Portal" primary button in Electric Purple
- [x] Welcome screen: footer "Official Platform of the Abdullah Society | Securely managed via Hibba.io"
- [x] Sidebar: Hibba logo in top-left, navy background, purple active states, mint accent on hover
- [x] Sidebar: section labels and nav items restyled to match Rippling/HiBob density
- [x] Dashboard: Mizan (Balance) area chart — income vs expenditure with mint/purple gradient fills
- [x] Dashboard: "Total Funds in Trust" and Mizan Balance in top stat cards with navy/mint gradient backgrounds
- [x] Dashboard: HR widget — payroll alerts, staff count, pending receipts indicator
- [x] Dashboard: footer "Official Platform of the Abdullah Quilliam Society | Securely managed via Hibba.io"

## Voice Agent Transcription Fix (May 2026)
- [x] Frontend: raise minimum blob size from 1KB to 10KB to prevent near-empty webm files being sent to Whisper
- [x] Frontend: improve "too short" toast message to guide user to hold for 2 seconds
- [x] Backend: replace generic `throw new Error(result.error)` with TRPCError including Whisper error details
- [x] Backend: add empty-transcript guard — throws TRPCError("No speech detected") if Whisper returns blank text
- [x] Backend: import TRPCError from @trpc/server in voiceAgent.ts

## Voice Agent Audio Format Fix (May 2026)
- [x] Root cause: S3 returns 'application/octet-stream' content-type; voiceTranscription.ts was using that header instead of the actual audio format, causing Whisper to reject the file
- [x] voiceTranscription.ts: derive MIME type from file extension in the S3 URL (which we control) instead of trusting the S3 content-type header
- [x] voiceTranscription.ts: strip codec parameters from MIME type before creating the Blob for Whisper (e.g. 'audio/webm;codecs=opus' → 'audio/webm')
- [x] voiceTranscription.ts: updated getFileExtension() to strip codec suffix and handle all Whisper-supported formats
- [x] VoiceAgent.tsx: re-create blob with clean MIME type (no codec suffix) before uploading to S3; derive file extension from MIME type map
- [x] Production build clean (2747 modules, 0 errors)

## Loan Improvements (May 2026 — round 2)
- [x] Edit Borrower Details dialog on loan detail page (name, email, phone, address)
- [x] Image/photo upload as evidence on Record Repayment
- [x] Send Reminder button on overdue repayment rows
- [x] Repayment receipt PDF download button on confirmed repayment rows

## Repayment Row Improvements (May 2026 — round 3)
- [x] Show date/time stamp on each repayment row (when it was recorded)
- [x] Per-row evidence upload (camera + file) on each instalment row
- [x] Authorised-by name display on each confirmed repayment row
- [x] Fix WhatsApp URL for UK phone numbers (strip leading 0, add 44 country code)
- [x] WhatsApp message button on each repayment row

## Repayment Due Dates & Overdue Highlighting (May 2026 — round 4)
- [x] Set dueDate on repayment creation (trusteeApprovedAt + instalment × 1 month)
- [x] Backfill dueDate for existing repayments that have no dueDate
- [x] Highlight overdue repayment rows in amber/red when dueDate < now and status is Pending

## Repayment Message Update (May 2026 — round 5)
- [x] Update WhatsApp and email messages to confirm payment made and ask lender to confirm receipt

## Terminology Update (May 2026 — round 6)
- [x] Rename all "Borrower" UI labels to "Lender / Donor" in LoanDetail, Loans pages and email/WhatsApp messages

## Lender Confirmation & Statement PDF (May 2026 — round 7)
- [x] Add lenderConfirmed boolean column to loanRepayments table
- [x] Add confirmLenderReceipt tRPC procedure
- [x] Add Lender Confirmed checkbox to each RepaymentRow
- [x] Add Loan Statement PDF button to LoanDetail page (generates full statement with all instalments)

## Loan Enhancements Round 8 (May 2026)
- [x] Add emailLoanStatement tRPC procedure (generates + emails statement to lender)
- [x] Add remindAllOverdue tRPC procedure (bulk reminder for all overdue repayments)
- [x] Add "Send Statement by Email" button to LoanDetail actions bar
- [x] Add "Remind All Overdue" button to Repayment Schedule section header
- [x] Add summary cards (paid/total, outstanding, overdue count) to each loan row on Loans list page

## Evidence & Auth Fixes (May 2026 — round 9)
- [x] Fix Add Evidence button to accept files and images (not camera-only) — remove capture attribute, add accept="image/*,application/pdf"
- [x] Add per-repayment Admin authorisation dropdown (Farid Ahmed / Mumin Khan) on each repayment row
- [x] Add per-repayment Trustee authorisation dropdown (Dr Abdul Hamid / Galib Khan) on each repayment row

## Repayment Enhancements Round 10 (May 2026)
- [x] Show evidence thumbnail / "View Evidence" link on confirmed repayment rows
- [x] Add notes text field to Record Repayment form (stored in DB, shown on row and in receipt PDF)
- [x] Add Export Schedule to PDF button on Repayment Schedule section header

## Loan Agreement PDF Update (May 2026 — round 11)
- [x] Rename "BORROWER DETAILS" to "LENDER / DONOR DETAILS" in the PDF
- [x] Add Title, Full Name, Address, Telephone, Email Address fields in the lender details section
- [x] Fix "Borrower" label in signature section to "Lender / Donor"
- [x] Fix document alignment (sections not overlapping, clean two-column layout)

## Islamic/Gentle Professional Persona (May 2026 — round 12)
- [ ] Update loan agreement PDF: Islamic tone, Amanah language, Hadith anchor, Respected Donor/Lender
- [ ] Update WhatsApp messages: Islamic greeting, Virtuous Cycle framing, JazakAllah Khair sign-off
- [ ] Update email templates: Barakah opening prayer, Amanah language, Project Milestone framing
- [ ] Add Sadaqah Jariyah conversion option on loan detail page
- [ ] Replace "Payment Due" with "Project Milestone Update" in reminder messages
