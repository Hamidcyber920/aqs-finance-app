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
- [x] Update loan agreement PDF: Islamic tone, Amanah language, Hadith anchor, Respected Donor/Lender
- [x] Update WhatsApp messages: Islamic greeting, Virtuous Cycle framing, JazakAllah Khair sign-off
- [x] Update email templates: Barakah opening prayer, Amanah language, Project Milestone framing
- [x] Add Sadaqah Jariyah conversion option on loan detail page (implemented as Convert to Waqf feature)
- [x] Replace "Payment Due" with "Project Milestone Update" in reminder messages

## Content Templates & Waqf Conversion (May 2026 — round 13)
- [x] Update WhatsApp loan receipt notification to exact AQS template (Rimmers building, Amanah, bricks for Jannah, BarakAllahu Feekum)
- [x] Update automated email (contract delivery) subject: "An Investment in the House of Allah – Your Qarde Hasan Agreement"
- [x] Update email body: Dear Brother/Sister [Surname], Sadaqah Jariyah, digital signature link, Hibba Integration mention
- [x] DB: add waqfConvertedAt, waqfCertificateUrl columns to loans table
- [x] Backend: convertToWaqf procedure — marks loan as waqf, generates Certificate of Waqf PDF, emails lender
- [x] Frontend: "Convert to Waqf / Donation" button on LoanDetail page (one-click, with confirmation dialog)
- [x] Frontend: Show Waqf badge + Certificate download link when loan is converted

## Loans Page Summary Update (May 2026 — round 14)
- [x] Remove Trustees stat card from Loans summary page
- [x] Add Total Outstanding (£) stat card
- [x] Add Number of Donors stat card
- [x] Add repayment forecast breakdown: due in next 4 weeks, 2 months, 3 months, 6 months, 12 months, 15 months, 2 years, 5 years
- [x] Backend: update loans summary query to return totalOutstanding, donorCount, and forecast buckets (computed client-side from listWithSummary data)

## Loans Forecast & Org Improvements (May 2026 — round 15)
- [x] Fix forecast subtitle: change "due back to AQS" to "due back to Donors/Lenders"
- [x] Fix forecast decimal formatting (already showing 2dp but confirm £295.83 style)
- [x] Clickable forecast row: modal showing which donors/loans are due in that period with amounts
- [x] Seed trustees and staff contacts into DB (Dr Abdul Hamid, Galib Khan, Ajmal Masroor, Altaf Khattak, Mumin Khan, Farid Ahmed, Atik Rahman)
- [x] Organisation page: ensure trustees and staff details (name, role, email, phone) are stored and displayed
- [x] Global contact lookup: pull trustee/staff contacts from any part of app for communications
- [x] Weekly email to Mumin Khan, Farid Ahmed, Dr Abdul Hamid, Galib Khan for repayments due in 4 weeks
- [x] Monthly trustee report by email and WhatsApp: loan statuses summary sent to all trustees
- [x] Schedule weekly email job (every Monday)
- [x] Schedule monthly report job (1st of each month)

## Organisation Page Fix (May 2026 — round 16)
- [x] Clear duplicate/incorrect trustee records from DB
- [x] Re-seed all 7 contacts with correct full names, roles, emails, phones (no duplicates)
- [x] Fix org chart: trustees show correct names (not "?"), Mumin Khan shows as Senior Manager not Trustee
- [x] Ensure fullName column is used for display (not username)
- [x] Phone numbers visible on each org chart card
- [x] Organisation page accessible from any part of app for communications lookup

## OrgChart UX Fixes (May 2026 — round 17)
- [x] Remove duplicate system-user entries from org chart (Mumin Khan manager, Farid Ahmed deputy, Test User assistant — use trustees table only for Management/Deputies)
- [x] Phone numbers: tappable tel: links to initiate calls
- [x] Full-page / full-width layout (no horizontal scroll clipping on mobile)
- [x] Each card expandable (tap to expand) showing full details
- [x] Each card inline-editable (edit icon opens edit form within card or dialog)

## OrgChart Contact Card Extended Fields (May 2026 — round 18)
- [x] DB: add dateOfBirth, addressLine1, addressLine2, city, postcode, nokName, nokPhone, nokEmail columns to trustees table
- [x] Backend: include new fields in trustees.list and trustees.update procedures
- [x] Card front: show birthday countdown badge (e.g. "🎂 Birthday in 12 days") when within 30 days
- [x] Card expanded view: show Title, Full Name, DOB + auto-calculated age, full address, next of kin (name, phone, email)
- [x] Card edit form: all new fields editable inline (DOB date picker, address fields, NOK fields)

## Communications Hub & Staff Spreadsheet (May 2026 — round 19)
- [x] DB: create comm_channels table (id, name, type, color, icon, sortOrder, isEditable, createdAt)
- [x] DB: create comm_messages table (id, channelId, fromEmail, fromName, toEmails JSON, subject, body, sentAt, direction, isRead, whatsappNumbers JSON)
- [x] Backend: channels CRUD procedures (list, create, update, delete)
- [x] Backend: messages list/send procedures per channel
- [x] Backend: sendBulkEmail procedure (send to all members of a channel group)
- [x] Backend: sendBulkWhatsApp procedure (generate wa.me bulk links)
- [x] Frontend: Communications page with Slack-style left sidebar (channels: Urgent, Trustees, Managers, Staff, Friday Comms)
- [x] Frontend: Channel header with Edit title button
- [x] Frontend: Message thread view per channel (sent/received emails shown as chat bubbles)
- [x] Frontend: Compose panel: individual email, bulk email to channel group, WhatsApp buttons
- [x] Frontend: Bulk WhatsApp: generate individual wa.me links for each member in channel
- [x] Frontend: Add Communications link to Organisation section in sidebar
- [x] Excel: generate pre-filled staff/trustee data collection spreadsheet with all known fields
- [x] Excel: columns: Full Name, Title/Role, Email, Phone, Date of Birth, Address Line 1, Address Line 2, City, Postcode, Next of Kin Name, NOK Relationship, NOK Phone, NOK Email, Notes

## Communications Hub Mobile Fix (May 2026)
- [x] Fix Communications Hub layout: mobile-first stacked layout (channel list on top, message panel below), no horizontal clipping

## Communications Hub Upgrade (May 2026)
- [x] Show full names on all recipient chips (not just surnames)
- [x] Add/remove channel members from the top of the channel panel
- [x] Structured AQS message template: Assalamu Alaikum pre-filled, Priority dropdown (Urgent/High/Normal/Low), Reply-by dropdown (Today/Tomorrow/3 Days/7 Days/2 Weeks), Action-by dropdown (from contacts), Message body, From dropdown (Manager/Trustee names)
- [x] Individual member selection: tap name to toggle as recipient (email and WhatsApp)
- [x] WhatsApp: open individual wa.me links per selected member with pre-filled structured message
- [x] Email: send to selected individual members with structured template

## Communications Hub Fixes (May 2026)
- [x] Remove Atik Rahman and Farid Ahmed from Trustees channel default members (DB update)
- [x] Restrict "Add Member" in MemberManager to trustees only (role contains "trustee") for the Trustees channel; for other channels show all contacts
- [x] Fix WhatsApp wa.me links not opening (URL encoding / popup blocker issue)

## WhatsApp Direct Send Fix (May 2026)
- [x] Remove logWhatsApp mutation from WhatsApp tab — show per-recipient Open WhatsApp buttons immediately when a recipient is selected, no intermediate log step

## Two-Way Messaging & WhatsApp UX (May 2026)
- [x] WhatsApp tab: show per-recipient Open WhatsApp buttons immediately when recipient is tapped (no separate trigger button needed)
- [x] WhatsApp tab: still log outbound message to thread in background when button is tapped
- [x] Add logIncoming tRPC procedure to record received replies (direction=received, fromName, body, channel)
- [x] Add "Log Incoming Reply" panel in thread view: paste sender name + message body, saves as received bubble
- [x] Thread shows both sent (right, purple) and received (left, dark card) bubbles

## WhatsApp Group Link (May 2026)
- [x] Add whatsappGroupLink column to comm_channels table
- [x] Store Trustees group link: https://chat.whatsapp.com/Lcrqxr7HpDTH6PkEPFflic?mode=gi_t
- [x] Show "Open WhatsApp Group" button in channel header and WhatsApp tab when link is set

## Next Steps Implementation (May 2026)
- [x] Unread badge: add getUnreadCounts tRPC query returning per-channel unread count
- [x] Unread badge: add markChannelRead mutation to clear unread on channel open
- [x] Unread badge: show red dot/count on channel sidebar items
- [x] Send Monthly Report Now: add manual trigger button on Qarde Hasan Loans page
- [x] Send Monthly Report Now: tRPC procedure to fire the monthly trustee summary email on demand
- [x] Birthday alerts: daily cron job checks trustees DOB, sends JazakAllahu Khayran email on birthday

## Communications Hub UX Fixes (May 2026 #2)
- [x] Channel header: make member avatars horizontally scrollable (finger swipe to see all)
- [x] MemberManager: replace add-name chips with a proper + Add button that opens a dropdown/picker

## Next Steps #2 (May 2026)
- [x] WhatsApp group link: add editable field inside MemberManager so any channel's WA group link can be set/updated from the UI
- [x] Trustee DOB: show warning badge/count on Trustees page for trustees missing date of birth
- [x] Channel sidebar: drag-to-reorder channels, persist new order to DB via sortOrder column

## Header & WhatsApp Fixes (May 2026 #3)
- [x] Channel header: fix title/description being obstructed by avatar strip and buttons on mobile
- [x] WhatsApp: open with pre-filled message text highlighted (red/attention indicator in the message)

## WhatsApp Fields Fix (May 2026 #4)
- [x] WhatsApp tab: template fields (Priority, Reply By, Action By, From, Body) must appear inside the WhatsApp tab and their values must be passed into the wa.me pre-filled message

## WhatsApp Tab Redesign (May 2026 #5)
- [x] Add "Send to Group" bulk button that opens WA group link with pre-filled message
- [x] Replace always-visible recipient list with toggle chips (tap to select, then Open WhatsApp button appears)
- [x] Improve overall WhatsApp tab UI layout and spacing

## WhatsApp Message Loading Fix (May 2026 #6)
- [x] Fix wa.me URL so message text loads correctly in WhatsApp for both group and individual sends

## Next Steps #3 (May 2026)
- [x] Trustees page: show warning badge for trustees missing phone number
- [x] WhatsApp tab: show "No phone" label on member chips missing a phone number
- [x] Incoming message bubbles: add "Mark as Replied" button that sets isReplied=true and shows a green tick
- [x] Add markReplied tRPC mutation to update comm_messages isReplied field

## All-Channel WhatsApp Feature Parity (May 2026)
- [x] Verify all channels (Urgent, Managers, Staff, Friday Comms) load correct members with phone data
- [x] Ensure phone normalisation and No-phone warning works for all channel member types (staff, managers)
- [x] Ensure copy+open group send button works for all channels (already code-generic, just needs WA group links set per channel)
- [x] Add phone numbers for staff/managers missing phone via Trustees/Contacts page

## Create New Channel (May 2026)
- [x] Add createChannel tRPC procedure to insert a new comm_channel row
- [x] Add "+ New Channel" button at bottom of sidebar with title input form
- [x] New channel uses same full template (Manage Members, compose tabs, message thread)
- [x] Add deleteChannel tRPC procedure (deletes channel + all its messages)
- [x] Add delete (trash) button on custom/editable channels in sidebar with confirmation dialog

## Trustees & Staff Contacts Redesign (May 2026)
- [x] Rename sidebar nav item "Trustees" → "Trustees & Staff Contacts"
- [x] Extend org_members schema: add seniorityOrder (int), nextOfKinName, nextOfKinRelation, nextOfKinPhone, nextOfKinEmail, address fields
- [x] Add seniority rank to each role type (chair > trustee > manager > deputy > staff)
- [x] Rebuild Trustees page as "Trustees & Staff Contacts" with sections: Board of Trustees, Managers, Staff
- [x] Contact cards match reference: avatar initials, role badge (gold), age, CONTACT (email+phone+WhatsApp), DATE OF BIRTH, ADDRESS, NEXT OF KIN, notes
- [x] Add manual entry form (+ Add Member button) with all fields: name, role, email, phone, DOB, address, nextOfKin, notes, seniorityOrder
- [x] Org Chart: auto-sort members by seniorityOrder within each tier
- [x] Communications Hub: channel member pickers auto-reflect all org_members (no hardcoded IDs)

## Communications Hub Channel Member Fix (May 2026)
- [x] Fix Managers channel: memberRoles should match "manager", "senior manager", "deputy manager" roles
- [x] Fix Staff channel: memberRoles should match "staff", "volunteer" roles
- [x] Update role-matching logic to use broader keyword matching (any role containing "manager" → Managers channel)
- [x] Update default channel memberRoles seeds in DB to use correct keywords

## Role Editing, WhatsApp Links & Channel Customisation (May 2026)
- [x] Trustees & Staff Contacts: add inline role-change dropdown on each contact card (pencil icon → role select → save instantly updates seniority order and channel membership)
- [x] Communications Compose: add WhatsApp group link shortcut button that opens the channel's saved group link in a new tab
- [x] Urgent & Friday Comms channels: keep as fully customisable (no auto-role filter) — Add Member shows all org members

## Compose Panel Recipient Overhaul (May 2026)
- [x] Non-Trustees channels: default recipients = all staff + management (auto-populated)
- [x] Add optional trustee dropdown to recipient list; default pre-select Galib Khan and Dr Abdul Hamid
- [x] Bulk email: auto-copies the same pre-filled message body to WhatsApp bulk send
- [x] Individual email/WhatsApp: show all staff+management + selected trustees as recipient chips
- [x] Trustees channel: keep existing trustee-only recipient logic unchanged

## Communications Hub — Three Improvements (May 2026)
- [x] DB: comm_templates table (id, name, subject, body, priority, replyBy, createdAt)
- [x] Backend: templates.list, templates.save, templates.delete tRPC procedures
- [x] Compose: "Saved Templates" button opens a picker; selecting a template fills subject+body+priority+replyBy
- [x] Compose: "Save as Template" button saves current subject+body+priority+replyBy with a name
- [x] Compose: delete template from the picker
- [x] Bulk WA: after bulk email send, WA tab shows "Send All (1/N)" sequence button that opens each recipient's WhatsApp one by one
- [x] Sent log: per-channel "Sent Messages" history tab showing date, sender, subject, recipient count, and type (email/WA)
- [x] Sent log: pull from existing comm_messages table (already stores sent messages)

## Communications — Templates, WA Sequence, Sent History & Trustees Enhancements (May 2026)
- [x] Add Templates library button in ComposePanel header (load, save, delete templates)
- [x] Add bulk WhatsApp Send-All sequence button (opens one recipient at a time with progress)
- [x] Add Sent Messages history tab in channel view (date, sender, subject, recipient count, type)
- [x] Trustees channel: apply same Compose enhancements (templates, WA sequence, sent history)
- [x] Trustees channel: add toggle dropdown to include any staff/manager as additional recipient
- [x] Trustees channel: allow adding new trustees and managers to the channel member list

## Communications — Template Categories, Reply Tracking & Scheduled Sends (May 2026)
- [x] DB: add category column to comm_templates (Friday Comms, Urgent, Payment, General)
- [x] DB: add scheduledAt (timestamp nullable) and sendStatus (pending/sent/failed) to comm_messages
- [x] Backend: update templates.save/list to include category; add comms.updateSentStatus procedure
- [x] Backend: scheduled send job — every minute check comm_messages where scheduledAt <= now and sendStatus=pending, send via Gmail/WA
- [x] Compose: template picker shows category filter tabs; saving a template prompts for category
- [x] Sent History: each card shows "Awaiting Reply" / "Replied" badge; tap to toggle status
- [x] Compose: "Send Later" button opens date/time picker; queues message with scheduledAt timestamp
- [x] Compose: scheduled messages show in Sent History with clock icon and scheduled time

## Superadmin Full Access & Delegated Succession System (May 2026)
- [x] Audit all tRPC procedures: ensure superadmin + owner (openId = OWNER_OPEN_ID) bypass all role checks
- [x] DB: add isOwnerDelegate boolean to users table; add succession_events table (id, type, triggeredAt, triggeredBy, delegateId, notifiedAt, notes)
- [x] Backend: ownerProcedure helper that allows superadmin OR owner OR active delegate
- [x] Backend: setDelegate procedure (owner-only) — designates a trustee as emergency delegate
- [x] Backend: inactivity check scheduled job — runs daily, if superadmin/owner last active > 28 days, auto-promote delegate and email all trustees + next of kin
- [x] Backend: manual succession trigger — owner can trigger succession manually (e.g. planned absence)
- [x] Frontend: Succession & Delegation panel in Admin Panel — shows current delegate, last-active timestamps, activity log
- [x] Frontend: delegate picker — owner selects any trustee from dropdown; shows their name, role, and contact
- [x] Frontend: succession event log — table of all succession events with date, type, and who was notified
- [x] Frontend: superadmin/owner see edit/delete controls on ALL records throughout the app (receipts, expenses, income, trustees, staff, channels, templates, etc.)
- [x] Frontend: non-superadmin users see only their own records and permitted actions

## Collapsible Sections — Full Row Tap (May 2026)
- [x] Monthly Expenses: entire category section header row tappable to toggle collapse/expand (was already full-row button)
- [x] Trustees & Staff Contacts: entire card header row tappable to toggle expand/collapse
- [x] Org Chart: entire card header row tappable to toggle expand/collapse

## Bulk WhatsApp Send — Select All & Send Simultaneously (May 2026)
- [x] Compose WA tab: show recipient list with checkboxes (all pre-checked by default)
- [x] "Select All" / "Deselect All" toggle button
- [x] "Send to All Selected (N)" button opens all selected recipients' WhatsApp chats at once using window.open
- [x] Works for both channel members and the staff/manager toggle section
- [x] Shows a browser popup-blocker warning if popups are blocked

## Permission Hierarchy — Full CRUD Control (May 2026)
- [x] Backend: create `ownerOrSuperadmin` procedure guard (ctx.user.role === 'superadmin' OR ctx.user.openId === OWNER_OPEN_ID)
- [x] Backend: wrap ALL delete procedures with ownerOrSuperadmin guard (receipts, expenses, income, loans, payroll, donors, campaigns, trustees, channels, templates, messages, reconciliation, backups)
- [x] Backend: comm_channels deleteChannel — restricted to ownerOrSuperadmin only
- [x] Backend: comm_channels createChannel — allowed for manager, deputy, superadmin, owner (not staff/volunteer)
- [x] Backend: update procedures for sensitive records — restricted to manager+ (not staff/volunteer)
- [x] Frontend: useAuth hook exposes `canDelete` and `canEdit` booleans based on role/openId
- [x] Frontend: all delete buttons (trash icons, "Delete" menu items) hidden for non-superadmin/non-owner
- [x] Frontend: all edit buttons hidden for staff/volunteer roles (read-only view)
- [x] Frontend: channel sidebar delete button — only visible to superadmin/owner
- [x] Frontend: Trustees page delete member — only visible to superadmin/owner
- [x] Frontend: show "Read Only" badge in header for staff/volunteer users

## Permission Hierarchy — Full CRUD Control (May 2026 — COMPLETED)
- [x] Backend: `isOwnerOrSuperAdmin` helper updated — only superadmin role OR owner's openId qualify (generic "admin" removed)
- [x] Backend: `assertCanDelete` helper enforces owner/superadmin-only deletion on all procedures
- [x] Backend: `canDelete` helper used in all delete procedures (receipts, expenses, income, loans, payroll, trustees, channels, templates, org members)
- [x] Backend: comm_channels deleteChannel — restricted to ownerOrSuperadmin only (assertCanDelete)
- [x] Backend: comm_channels createChannel — allowed for manager, deputy, superadmin, owner
- [x] Frontend: `usePermissions` hook created at `client/src/hooks/usePermissions.ts`
  - canDelete: superadmin role OR isOwner (openId matches OWNER_OPEN_ID)
  - canEdit: superadmin, owner, admin, or trustee
  - canAdd: all authenticated users
- [x] Frontend: auth.me now returns `isOwner: true` when user is superadmin or owner by openId
- [x] Frontend: Trustees page — edit/role-change buttons gated by canEdit; Add Member gated by canAdd
- [x] Frontend: OrgChart page — edit node button gated by canEdit
- [x] Frontend: Communications page — delete channel button gated by canDelete; new channel form gated by canAdd; delete template gated by canDelete
- [x] Frontend: Income page — delete button gated by canDelete
- [x] Frontend: ReceiptDetail page — edit/save/delete buttons gated by canEdit/canDelete
- [x] Frontend: MonthlyExpenses page — authorise/reject/pay buttons gated by canEdit

## Student Accommodation System (May 2026)
- [x] Database schema: accommodationTenants and accommodationRentPayments tables in drizzle/schema.ts
- [x] Migration SQL applied via webdev_execute_sql
- [x] DB helpers: server/db.accommodation.ts
- [x] tRPC router: server/routers/accommodation.ts (tenant CRUD, rent payment, AI extraction, file upload)
- [x] Router wired: accommodation: accommodationRouter added to appRouter in server/routers.ts
- [x] Frontend page: client/src/pages/StudentAccommodation.tsx
  - [x] Summary dashboard: upcoming rent (7 days), overdue rent, total/active tenants
  - [x] Tenant list with status badges + search + filter
  - [x] Tenant detail panel: contact info, contract, deposit, rent schedule
  - [x] Add Tenant dialog with AI document extraction (file/photo upload → auto-fill form)
  - [x] Contract document upload/view
  - [x] Rent payment tracker per tenant with confirm tick (canEdit permission)
  - [x] Confirm payment dialog with evidence upload, payment method, date stamp, confirmedByName
  - [x] Mark overdue button
  - [x] Edit Tenant dialog (canEdit permission)
  - [x] Communication buttons (email/WhatsApp) per tenant record
- [x] Route registered in App.tsx (/accommodation)
- [x] Sidebar nav entry added in DashboardLayout.tsx (Income section)
- [x] Scheduled jobs in server/scheduledJobs.ts:
  - [x] Daily 08:30 UK: 7-day due notice emails to tenants
  - [x] Daily 08:30 UK: 8-14 day overdue reminder emails + status update
  - [x] Daily 08:30 UK: 14+ day escalation emails + notifyOwner notification

## AQS Fintech Layer (May 2026)
- [x] Stripe Payment Element integration (card, Apple Pay, Google Pay, Direct Debit)
- [x] QuickCapture: generate trackable payment URL pre-populated with donor name + campaign
- [x] Bank transfer reference code generator (RIMMERS-123 style) with one-tap copy of IBAN/SWIFT
- [x] Enhance AI-OCR Scan: extract donor name, amount, currency, date, campaign from uploaded images/sheets
- [x] Gift Aid R68 monthly export (CSV with Stripe transaction IDs for HMRC)
- [x] Stripe webhook handler to auto-mark Qarde Hasan repayments as paid
- [x] JazakAllah WhatsApp message trigger on payment confirmation

## Payment Orchestration & AI-OCR Data Population (May 2026)

### Multi-Channel Payment Integration
- [x] Backend: paypal.createOrder procedure — creates a PayPal order via REST API, returns approvalUrl + orderId
- [x] Backend: paypal.captureOrder procedure — captures approved PayPal order, records in stripe_payment_sessions with provider=paypal
- [x] Backend: openBanking.generateLink procedure — generates a Truelayer/GoCardless-style open banking payment link with pre-filled amount + reference
- [x] Backend: fintech.getPaymentPageData procedure — accepts ref + donorName + campaignId query params, returns pre-populated donor details for the payment page
- [x] Frontend: Fintech.tsx — add PayPal button inside StripePaymentPanel (Step 2) using @paypal/react-paypal-js
- [x] Frontend: Fintech.tsx — add "Open Banking (Bank Transfer)" tab/button that shows generated open banking link with copy + WhatsApp share
- [x] Frontend: Fintech.tsx — add PayPal and Open Banking as payment method badges in the method grid (alongside Card, Apple Pay, Google Pay, BACS)
- [x] Frontend: Public payment page (/pay) — standalone page that reads ?ref=&name=&campaign= query params, pre-populates donor form, shows all payment options
- [x] Frontend: QuickCapture — update generated URL to include ?name=&campaign=&amount= so the /pay page pre-fills automatically
- [x] Frontend: QuickCapture — update WhatsApp message template to use /pay URL with pre-populated params
- [x] Frontend: Payment success page — show PayPal order ID or open banking reference alongside Stripe reference

### AI-OCR Data Population
- [x] Backend: fintech.extractPaymentData procedure — accepts image/PDF URL, uses LLM vision to extract donor name, amount, currency, date, campaign, reference from donation receipts / bank screenshots
- [x] Frontend: Fintech.tsx — add "Scan to Pre-fill" button in donor details form that opens camera/file picker, calls extractPaymentData, auto-fills form fields
- [x] Frontend: show extraction confidence badge on each auto-filled field (green = high, amber = medium, red = low)
- [x] Frontend: allow manual override of any AI-extracted field before proceeding to payment

## Automated Banking Instructions & Real-Time Reconciliation (May 2026)

### Automated Banking Instructions
- [x] Bank Transfer tab (/fintech + /pay): dynamic reference code (RIMMERS-123 style) generated per session
- [x] Bank Transfer tab: display AQS IBAN, SWIFT/BIC, Sort Code, Account Number in formatted card
- [x] Bank Transfer tab: one-tap copy for each field individually (clipboard API)
- [x] Bank Transfer tab: "Copy All Details" button copies formatted block to clipboard
- [x] Bank Transfer tab: WhatsApp share button pre-fills bank details + reference into WA message
- [x] Bank Transfer tab: QR code for the reference code (for in-person display)

### Real-Time Reconciliation
- [x] Stripe webhook handler: /api/stripe/webhook endpoint (already exists — audit and extend)
- [x] Webhook: payment_intent.succeeded → look up stripePaymentSessions by paymentIntentId, mark completed
- [x] Webhook: checkout.session.completed → mark session completed, update externalOrderId
- [x] Webhook: auto-detect Qarde Hasan repayment by metadata.loan_repayment_id or reference code pattern
- [x] Webhook: on Qarde Hasan repayment confirmed → mark loanRepayments row as paid (status=paid, paidAt=now)
- [x] Webhook: on Qarde Hasan repayment confirmed → send JazakAllah WhatsApp message via wa.me link (server-side log + owner notification)
- [x] Loan repayment: add stripePaymentIntentId column to loan_repayments table for webhook matching
- [x] Fintech QuickCapture: when generating payment link for a loan repayment, embed metadata.loan_repayment_id in PaymentIntent

## The Donor Journey — End-to-End Flow (May 2026)

### Step 1-2: AI Collection Sheet Scanner
- [x] Backend: parseFridayCollectionSheet procedure — accepts image/PDF URL, uses LLM vision to extract all donor rows (name, phone, amount, campaign, gift aid) as a batch
- [x] Backend: returns array of DonorRecord with per-field confidence scores + "Analyzing Amanah entries..." status messaging
- [x] Backend: saveParsedDonors procedure — bulk-inserts verified donor records into donor_leads + creates pending stripe_payment_sessions
- [x] Frontend: CollectionSheetScanner component in Capture page — upload/camera, shows "Analyzing Amanah entries..." spinner
- [x] Frontend: Verification table — 50 rows, each editable, confidence badges, "Ready for verification, Dr. Abdul Hamid." header
- [x] Frontend: Bulk approve + individual edit before saving

### Step 3: WhatsApp Pledge Fulfilment
- [x] Backend: sendPledgeWhatsApp procedure — generates /pay URL with pre-filled name+campaign+amount, builds Islamic pledge message
- [x] Backend: WhatsApp message template: "JazakAllah! To fulfil your pledge for the [Campaign], click here: [URL]" — gentle, encouraging, spiritual tone
- [x] Frontend: "Send WhatsApp" button per donor row in verification table
- [x] Frontend: "Send All WhatsApp" bulk button after verification

### Step 4: Seamless Payment (already implemented)
- [x] /pay page: Apple Pay shown first in Payment Element tabs (already set via paymentMethodOrder)
- [x] /pay page: Gift Aid toggle pre-checked if donor declared on collection sheet

### Step 5: Digital Receipt + Jannah Hadith
- [x] Backend: generateDonorReceipt procedure — builds HTML receipt with: donor name, amount, campaign, reference, Gift Aid status, Jannah Hadith quote, AQS logo
- [x] Backend: Stripe webhook on payment_intent.succeeded → auto-generate receipt + send via Gmail API to donor email
- [x] Backend: WhatsApp receipt URL generated and logged (admin can tap to send)
- [x] Frontend: PaymentSuccess page — show receipt card with Hadith + download PDF button

### Step 6: Hibba Backup Vault
- [x] Backend: mirrorToBackupVault procedure — on every completed payment, write a JSON snapshot to S3 under /backup-vault/YYYY/MM/DD/{ref}.json
- [x] Backend: Stripe webhook on payment_intent.succeeded → call mirrorToBackupVault
- [x] Backend: Daily backup job: export all completed sessions for the day to S3 as a consolidated JSON
- [x] Frontend: Backups page — show vault entries with download links

## Gift Aid HMRC Compliance — R68 Audit Trail (May 2026)

- [x] Backend: store stripeTransactionId (payment_intent ID) as uniqueReferenceNumber in gift_aid_declarations
- [x] Backend: store donorIpAddress and consentTimestamp in gift_aid_declarations for Electronic Communications Act 2000 compliance
- [x] Backend: R68 export — include Stripe Transaction ID column as "Unique Reference Number" per HMRC R68 format
- [x] Backend: R68 export — include IP address and consent timestamp columns for audit
- [x] Backend: R68 export — generate HMRC-formatted CSV with all required columns (Title, First Name, Surname, House No/Name, Postcode, Donation Date, Amount, Unique Reference)
- [x] Frontend: payment form — add full UK Electronic Communications Act 2000 consent statement above Gift Aid checkbox
- [x] Frontend: payment form — require donor full address (house number/name + postcode) when Gift Aid is checked
- [x] Frontend: R68 export page — show Stripe Transaction ID column in preview table
- [x] Frontend: R68 export page — download button generates HMRC R68 CSV with all required fields
- [x] Frontend: R68 export page — show compliance notice about Electronic Communications Act 2000

## Payroll Page Fix — AI Extraction & Payment Evidence

- [x] Fix AI extraction: payslip upload must call documents.extract with moduleType=payslip and return employeeName, niNumber, grossPay, deductions, netPay, taxCode, payPeriod, employer
- [x] Batch extraction: when a multi-employee payroll PDF is uploaded, extract all employees as an array
- [x] Per-employee checkbox: each extracted row has a checkbox; only checked rows are saved
- [x] "Confirm All" bulk checkbox at top of verification table
- [x] Payment method dropdown per employee: Bank Transfer | Cheque | Cash
- [x] When Cheque selected: show cheque number field + evidence upload (photo/scan)
- [x] Cheque evidence stored in S3, URL saved to payroll record
- [x] payroll_records table: add paymentMethod, chequeNumber, chequeEvidenceUrl columns
- [x] Backend: payroll.saveVerifiedEntries procedure — accepts array of verified records with payment method
- [x] Backend: payroll.uploadChequeEvidence procedure — accepts file upload, stores in S3, returns URL
- [x] Frontend: show payment method badge on each saved payroll row in the main table
- [x] Frontend: expand row to show cheque evidence image when clicked
- [x] Date and timestamp recorded on each payroll payment record (paidAt field)
- [x] Authorising signatory field per payment: pre-filled with "Dr Abdul Hamid" (Manager & Trustee), editable
- [x] Signatory shown on each saved payroll row and in monthly export

## Payroll Improvements (May 2026)
- [x] Backend: payroll.exportMonthly procedure — returns CSV string with all records for selected month (Employee, NI, Tax Code, Gross, Income Tax, NI Contribution, Pension, Other Deductions, Net Pay, Payment Method, Cheque No, Paid At, Authorised By)
- [x] Backend: payroll.exportMonthlyPdf procedure — generates HTML receipt-style PDF for the month, includes AQS header, signatory block, and cheque register
- [x] Backend: payroll.getChequeRegister procedure — returns all payroll records with paymentMethod=cheque across all months, with bankingStatus and bankedAt
- [x] Backend: payroll.markChequeBanked procedure — updates bankingStatus=banked and bankedAt=now for a given record
- [x] Backend: payroll.getStaffProfileByName procedure — fuzzy name lookup in staff_profiles, returns niNumber, taxCode, bankName, sortCode, accountNumber
- [x] Frontend: Payroll page — "Export CSV" button downloads monthly payroll as CSV
- [x] Frontend: Payroll page — "Export PDF" button generates and opens printable monthly summary
- [x] Frontend: Payroll page — "Cheque Register" tab showing all cheques issued, with banked/unbanked toggle
- [x] Frontend: Cheque Register — each row shows employee, amount, cheque number, date issued, status badge
- [x] Frontend: Cheque Register — "Mark Banked" button with date/time stamp
- [x] Frontend: Cheque Register — cheque evidence thumbnail with click-to-expand
- [x] Frontend: AI extraction — after name is extracted, auto-lookup staff profile and pre-fill NI + Tax Code if match found
- [x] Frontend: NI/Tax Code auto-fill shows a "Pre-filled from staff profile" badge when auto-populated

## Universal AI Scan/Upload — All Pages (May 2026)
- [x] Shared ScanUploadFAB component: floating camera/upload button, accepts photo/camera/PDF/file
- [x] Shared useAIScan hook: uploads file to S3, calls documents.extract with moduleType, returns extracted fields + confidence
- [x] ScanUploadFAB: shows AI extraction result panel with field-by-field validation checkboxes
- [x] ScanUploadFAB: auto-matches extracted name to existing profiles (tenants, donors, staff, trustees)
- [x] ScanUploadFAB: pre-fills the page's Add/Edit form with extracted data for admin approval
- [x] Finance: Fundraising — scan donation receipt/collection sheet, match to donor CRM
- [x] Finance: Qarde Hasan Loans — scan loan agreement/repayment slip, match to borrower register
- [x] Finance: Income & Rentals — scan bank statement/rental receipt, match to tenant/income category
- [x] Finance: Student Accommodation — scan tenancy agreement/rent receipt, auto-select tenant from register
- [x] Finance: Donor CRM — scan donor card/letter, create or update donor profile
- [x] Finance: Monthly Expenses — scan invoice/receipt, extract supplier, amount, category
- [x] Finance: Reconciliation — scan bank statement, extract transactions for reconciliation matching
- [x] Organisation: Org Chart — scan org chart document, extract staff names and roles
- [x] Organisation: Communications — scan letter/document, extract recipient and content for message compose
- [x] Organisation: Donors — scan donor form, create/update donor profile
- [x] Organisation: Campaigns — scan campaign flyer/report, extract campaign details
- [x] Organisation: Reports — scan external report PDF, attach as evidence to report record
- [x] Administration: Admin Panel — scan governance document, attach as evidence
- [x] Administration: Trustees & Staff Contacts — scan business card/staff form, create/update staff profile
- [x] Settings — scan configuration document, extract settings values

## Universal AI Scan/Upload Feature — All Pages (May 2026)

- [x] Add `staff_profile` ModuleType to SmartUpload component with field labels
- [x] Add `staff_profile` prompt and enum to server-side documents.extract router
- [x] Add SmartUpload button to Income.tsx (income_rental — pre-fills Add Income form)
- [x] Add SmartUpload button to Fundraising.tsx (fundraising_donation — pre-fills Add Donation form)
- [x] Add SmartUpload button to Loans.tsx (loan_application — pre-fills Apply for Loan form)
- [x] Add SmartUpload button to DonorCRM.tsx (crm_donor — pre-fills donor quick-capture)
- [x] Add SmartUpload button to MonthlyExpenses.tsx (receipt — pre-fills Add Expense form)
- [x] Add SmartUpload button to Donors.tsx (crm_donor — pre-fills Add Donor dialog)
- [x] Add SmartUpload button to Campaigns.tsx (fundraising_donation — pre-fills campaign form)
- [x] Add SmartUpload button to Trustees.tsx (staff_profile — opens Add Member form)
- [x] Add SmartUpload button to OrgChart.tsx (staff_profile — shows extracted staff info)
- [x] Add SmartUpload button to Communications.tsx (business_card — extracts contact info)
- [x] Add SmartUpload button to Reports.tsx (bank_statement — extracts closing balance)
- [x] Add SmartUpload button to AdminPanel.tsx (staff_profile — opens Create Staff dialog)

## Universal AI Scan/Upload Feature — All Pages (May 2026)

- [x] Add staff_profile ModuleType to SmartUpload component with field labels
- [x] Add staff_profile prompt and enum to server-side documents.extract router
- [x] Add SmartUpload button to Income.tsx (income_rental — pre-fills Add Income form)
- [x] Add SmartUpload button to Fundraising.tsx (fundraising_donation — pre-fills Add Donation form)
- [x] Add SmartUpload button to Loans.tsx (loan_application — pre-fills Apply for Loan form)
- [x] Add SmartUpload button to DonorCRM.tsx (crm_donor — pre-fills donor quick-capture)
- [x] Add SmartUpload button to MonthlyExpenses.tsx (receipt — pre-fills Add Expense form)
- [x] Add SmartUpload button to Donors.tsx (crm_donor — pre-fills Add Donor dialog)
- [x] Add SmartUpload button to Campaigns.tsx (fundraising_donation — pre-fills campaign form)
- [x] Add SmartUpload button to Trustees.tsx (staff_profile — opens Add Member form)
- [x] Add SmartUpload button to OrgChart.tsx (staff_profile — shows extracted staff info)
- [x] Add SmartUpload button to Communications.tsx (business_card — extracts contact info)
- [x] Add SmartUpload button to Reports.tsx (bank_statement — extracts closing balance)
- [x] Add SmartUpload button to AdminPanel.tsx (staff_profile — opens Create Staff dialog)

## Payroll Enhancements (May 2026)
- [x] PAYE RTI FPS XML export — HMRC-formatted Full Payment Submission generator (server/payrollFps.ts)
- [x] Payroll approval workflow — submit, first trustee approve, second trustee approve, reject, finalise
- [x] Pension auto-enrolment tracker — assess eligibility, enrol, opt-out, contribution schedule
- [x] payrollRuns DB table — stores run status, approver chain, FPS export history
- [x] pensionEnrolments DB table — stores enrolment status, contributions, provider
- [x] Approval Workflow tab in Payroll page — timeline, totals, approve/reject dialogs
- [x] Pension Tracker tab in Payroll page — summary cards, contribution schedule, employee assessment
- [x] RTI FPS Export dialog — configurable PAYE ref, AOR ref, employer name
- [x] 30 Vitest tests for FPS XML, tax year derivation, pension thresholds, approval state machine

## Master Communications Hub
- [x] DB schema: comms_sections, comms_messages, comms_attachments, comms_replies tables
- [x] Seed 8 default sections (General, Urgent, Accountants, HMRC/Gift Aid, Trustees, Facilities, Bookings, Student Accommodation)
- [x] Backend: commsHub.listSections, getStats, createSection, updateSection, archiveSection
- [x] Backend: commsHub.listMessages, getMessage, createMessage, updateMessageStatus, deleteMessage
- [x] Backend: commsHub.pushGmailMessage with AI auto-routing to correct section
- [x] Backend: commsHub.summariseMessage with AI key points and action items extraction
- [x] Backend: commsHub.addAttachment, ocrAttachment (AI OCR + summary)
- [x] Backend: commsHub.addReply (internal note or send email)
- [x] Frontend: CommHub page with 3-panel layout (sections sidebar, message list, detail panel)
- [x] Frontend: Compose/Add Message dialog with Gmail Push-In source option
- [x] Frontend: Add Section dialog with icon and colour picker
- [x] Frontend: AI Summarise button per message (key points + action items)
- [x] Frontend: OCR button per attachment (AI reads image/PDF and summarises)
- [x] Frontend: Move-to-section dropdown in message detail
- [x] Frontend: Star, flag, archive, mark actioned, delete actions
- [x] Frontend: Reply panel (internal note or send email)
- [x] Frontend: Unread/urgent badge counts per section in sidebar
- [x] Frontend: Status filter pills (All, Unread, Flagged, Actioned)
- [x] Frontend: Search across all messages
- [x] Frontend: Role-gated (superadmin, trustee, manager, deputy, admin only)
- [x] 30 Vitest tests for slug generation, priority validation, visibility rules, auto-routing, status transitions, date formatting

## SmartUpload AI Matching Fix (May 2026)
- [x] Backend: documents.matchProfile — fuzzy-match extracted name against staff/trustees (staff_profile), donors (crm_donor), tenants (income_rental)
- [x] Backend: return top 3 candidate matches with confidence score for each module type
- [x] Frontend: SmartUpload confirmation dialog — show matched record card with confidence score
- [x] Frontend: Allow user to accept match (merge fields into existing record) or override (create new)
- [x] Frontend: OrgChart Scan/Upload — on confirm with match, auto-populate the matched staff member's edit form with extracted DOB, address, NOK
- [x] Frontend: DonorCRM Scan/Upload — on confirm with match, auto-populate matched donor's edit form
- [x] Frontend: Income Scan/Upload — on confirm with match, auto-select matched tenant in the form

## Bug Fixes & Enhancements (May 2026 — Scan/Merge Flow)
- [x] Add nokEmail column to staffProfiles table (schema already had it — confirmed)
- [x] Fix AI extraction prompt: member's own phone → phone field; NOK phone → nokPhone; NOK email → nokEmail
- [x] Fix trustees.mergeFromScan: guard against overwriting existing phone with nokPhone value
- [x] Add nokEmail to trustees.mergeFromScan Zod schema and update logic
- [x] Add pre-save confirmation step in SmartUpload: show table of proposed field changes (field | current | new) before committing
- [x] matchProfile response must return current field values of matched record for diff display
- [x] Update Trustees.tsx NOK card to display nokEmail (was already implemented)

## Suggested Next Steps Implementation (May 2026)
- [x] Extend matchProfile currentFields to donors table (name, email, phone, addressLine1, city, postcode, giftAid, notes)
- [x] Extend matchProfile currentFields to staff_profiles table (fullName, contractType, niNumber, taxCode)
- [x] SmartUpload diff table: add per-row checkbox so user can deselect individual proposed changes before saving
- [x] SmartUpload: pass only checked fields to onConfirm so merge only applies selected changes
- [x] DB: scan_merge_snapshots table (id, tableName, recordId, snapshotJson, mergedBy, mergedAt)
- [x] Backend: trustees.mergeFromScan — save snapshot before merge, return snapshotId
- [x] Backend: donors.mergeFromScan — save snapshot before merge, return snapshotId
- [x] Backend: scanMerge.revert procedure — restore record from snapshot (only within 10 min)
- [x] Frontend: Trustees page — show "Undo last scan import" toast/button for 10 min after merge
- [x] Frontend: Donors page — show "Undo last scan import" toast/button for 10 min after merge

## Next Steps Round 2 (May 2026)
- [x] Backend: scanMerge.revert — add staff_profiles branch to restore staff profile records
- [x] Backend: trustees.mergeFromScan — save snapshotId as recordId (currently saves trustee id correctly)
- [x] Frontend: Wire ScanMergeUndoBanner into OrgChart/Staff Profiles page (moduleType staff_profile)
- [x] Backend: scanMerge.listHistory procedure — return paginated list of all snapshots with tableName, recordId, mergedByName, mergedAt, reverted flag
- [x] Frontend: Merge History page (/merge-history) — admin-only audit log table with filter by table, date range, user
- [x] Register /merge-history route in App.tsx and add sidebar nav item under ADMIN
- [x] Backend: scanMerge.revertFields procedure — accepts snapshotId + array of field names to restore selectively
- [x] Frontend: ScanMergeUndoBanner — add "Partial Undo" button that opens a dialog showing snapshot diff with checkboxes, calling revertFields
- [x] Vitest: scanMerge schema mock updated; 7/7 tests passing including revert, getLatest, role gates

## Merge History Enhancements (May 2026)
- [x] Backend: scanMerge.listHistory — include snapshotJson in response for diff panel
- [x] Frontend: MergeHistory page — "View Diff" button per row opens side panel showing full field diff (before vs after)
- [x] Frontend: MergeHistory page — CSV export button downloads all rows (filtered by current table filter)
- [x] Backend: scanMerge.revert — call notifyOwner after successful full revert
- [x] Backend: scanMerge.revertFields — call notifyOwner after successful partial revert
- [x] Vitest: notifyOwner called on revert (mock + spy) — 8/8 scanMerge tests pass

## HibbaSuperPrompt Wave 1 (May 2026)

### Phase 1 — Design System Hardening
- [x] Apply Liverpool Night palette: bg #0F1B2D, surface #1A2740, accent #00B894, lavender #6C63FF, coral #FF7A7A, gold #F4C95D
- [x] Add Inter Variable font via Google Fonts CDN in index.html
- [x] Apply tabular-nums font feature to all financial figures
- [x] Add density mode toggle (Comfortable / Compact) to ProfileSettings and DashboardLayout
- [x] Add spring-based page transition (8px below, opacity 0→1, 220ms) using CSS transitions
- [x] Ensure Lucide icons use stroke-width 1.5 globally

### Phase 2 — Compliance Cockpit
- [x] DB: compliance_actions table (id, title, source, owner, dueDate, status, evidenceUrl, notes, createdAt)
- [x] DB: training_records table (id, userId, module, provider, completedAt, expiresAt, certificateUrl)
- [x] DB: policy_documents table (id, title, owner, reviewDate, version, approvedAt, fileUrl)
- [x] Backend: compliance.listActions, compliance.upsertAction, compliance.listTraining, compliance.upsertTraining, compliance.listPolicies, compliance.upsertPolicy
- [x] Frontend: ComplianceCockpit page (/compliance) with three tabs: Inquiry Actions, Training Matrix, Policies
- [x] Training matrix: per-person rows, per-module columns, green/amber/red expiry status
- [x] Add Compliance Cockpit to sidebar under ADMINISTRATION
- [x] Automated T-60/T-30/T-7/overdue training reminders via scheduled job (Monday digest covers this)

### Phase 3 — Dashboard Upgrade
- [x] Financial health strip: total bank balance (placeholder), unrestricted vs restricted split, next critical payment
- [x] Today tile: items needing Dr. Hamid — overdue compliance actions, pending approvals, unacknowledged decisions
- [x] This Week tile: upcoming meetings, training sessions, renewals due this week
- [x] Compliance heat map: green/amber/red per policy, training module, certificate
- [x] Always-visible voice button (floating, bottom-right) linking to voice agent on all pages
- [x] Page transition animation applied to main content area

### Phase 4 — Monday Compliance Digest
- [x] Scheduled job: every Monday 07:30 UK — email Dr. Hamid with overdue compliance actions, training gaps, policy review due
- [x] Email template: personalised "Dear Dr. Hamid, AssalamuAlaikum" format with structured digest

### Phase 5 — Receipt Scan Improvements
- [x] Duplicate detection: SHA-256 image hash + fuzzy vendor+amount+date match against last 7 days
- [x] £500+ approval flow: receipts above £500 flagged secondApproverRequired=true, receipts.secondApprove procedure added
- [x] DB: receipts table extended with secondApproverRequired, secondApprovedById, secondApprovedAt, imageHash, fundAllocation columns
- [x] Backend: receipts.checkDuplicate, receipts.secondApprove procedures added
- [x] Frontend: duplicate warning banner in Capture.tsx, fund allocation section for £500+ receipts
- [x] Fund allocation confirmation: fund allocation step shown when amount >= £500, with add/remove fund rows

## Wave 2 Features (May 11, 2026)

### Phase 1 — Decisions Register
- [x] DB: trustee_decisions table (id, title, motionText, proposer, seconder, votesFor, votesAgainst, abstentions, outcome, meetingDate, minutesUrl, notes, createdByUserId, createdAt)
- [x] Backend: decisions.list, decisions.upsert, decisions.delete procedures (protected, admin/trustee only)
- [x] Frontend: Decisions Register page (/decisions) with CRUD table and vote recording
- [x] Register /decisions route in App.tsx and add sidebar nav item under ADMINISTRATION

### Phase 2 — Second-Approver Queue
- [x] Frontend: Receipts page — add "Pending 2nd Approval" tab showing receipts with secondApproverRequired=true and not yet secondApproved
- [x] Frontend: Pending 2nd Approval tab — approve button calling receipts.secondApprove, prevents same-person approval

### Phase 3 — Compliance Evidence Upload
- [x] Backend: compliance.uploadEvidence procedure — accept fileUrl + recordId + recordType, save to training_records.certUrl or policy_documents.fileUrl
- [x] Frontend: Training Matrix rows — add upload button that opens file picker, uploads to S3, calls compliance.uploadEvidence
- [x] Frontend: Policy Register rows — add upload button that opens file picker, uploads to S3, calls compliance.uploadEvidence

### Phase 4 — AI OCR Smart Document Upload
- [x] AI OCR: SmartDocumentUpload component — accepts any file (image/PDF/doc), sends to LLM vision, returns extracted fields as JSON
- [x] AI OCR: LLM prompt detects document type (training cert, policy doc, decision minute, receipt, donor form, staff profile) and returns typed field set
- [x] AI OCR: SmartDocumentUpload shows auto-populated form with editable fields before saving
- [x] AI OCR: Wire into Compliance Cockpit training cert upload (auto-fills module, completedAt, expiresAt, provider)
- [x] AI OCR: Wire into Compliance Cockpit policy doc upload (auto-fills title, version, reviewDate, owner)
- [x] AI OCR: Wire into Decisions Register minutes upload (auto-fills motionText, proposer, seconder, votes, outcome, meetingDate)

## Wave 2 Remaining Next Steps (May 11, 2026)

- [x] Wire SmartDocumentUpload into Donors.tsx — "Scan Donor Letter" button, targetType="donor", auto-fills name/email/phone/address/giftAid/amount/date
- [x] Add Decisions Register section to sendComplianceDigest — count of decisions past week, flag missing minutes/votes
- [x] Bulk-approve on second-approver queue — checkbox column per row, "Approve Selected" button, Promise.all receipts.secondApprove

## Wave 3 — People Module (May 11, 2026)

### DB Schema
- [x] DB: gift_aid_claims table (id, donorId, donationId, taxYear, claimStatus, hmrcRef, claimedAt, amount)
- [x] DB: donor_segments table (id, donorId, segment enum: major/monthly/eid/friday/anonymous)
- [x] DB: donor_campaigns table (id, donorId, campaignId, donationId, attributedAt)
- [x] DB: payroll_v2 table (id, employeeId, employeeName, month, year, grossPay, incomeTax, nationalInsurance, pensionEmployee, pensionEmployer, netPay, ytdGross, ytdTax, ytdNI, payslipUrl, status, approvedById, approvedAt, notes)
- [x] DB: comms_templates table (id, name, type enum: email/sms/letter, subject, body, category, isActive)
- [x] DB: comms_outbox table (id, templateId, recipientType, recipientIds, subject, body, sentAt, status, sentCount, failCount)
- [x] DB: trustee_meetings table (id, title, scheduledAt, location, status, agendaUrl, minutesUrl, transcriptUrl, notes)
- [x] DB: meeting_agenda_items table (id, meetingId, itemNumber, title, description, ownerId, actionRequired)
- [x] DB: onboarding_pipeline table (id, userId, stage enum: contract/id_check/dbs/induction/training/payslip, status, completedAt, notes, documentUrl)

### Wave 3 Backend
- [x] donors.updateSegment procedure — set donor segment (major/monthly/eid/friday/anonymous)
- [x] donors.listLapsed procedure — donors who gave last year but not this year, with AI re-engagement draft
- [x] donors.buildGiftAidCsv procedure — HMRC-ready CSV for all eligible donations in a tax year quarter
- [x] donors.sendThankYou procedure — send personalised thank-you email within 24h of donation, queue via notifyOwner
- [x] payroll.createV2 procedure — create payroll record with statutory deductions
- [x] payroll.analyzePayslipV2 procedure — OCR payslip PDF via LLM, extract all fields
- [x] payroll.listByEmployee procedure — per-employee payslip history with YTD
- [x] comms.listTemplates / comms.upsertTemplate procedures
- [x] comms.bulkSend procedure — send to trustee-all / staff-all / donors-by-segment with quiet hours + Friday filter
- [x] comms.listOutbox procedure — paginated outbox with status
- [x] meetings.list / meetings.upsert / meetings.delete procedures
- [x] meetings.generateAgenda procedure — AI drafts agenda from open compliance actions + pending decisions
- [x] meetings.transcribeMinutes procedure — accepts audio URL, calls Whisper, returns transcript
- [x] meetings.extractDecisions procedure — AI parses transcript, auto-creates decision records
- [x] onboarding.list / onboarding.upsert / onboarding.advanceStage procedures

### Wave 3 Frontend
- [x] Enhanced Donors page: segment badges, Gift Aid status column, "Build Gift Aid CSV" button, lapsed donor AI flag
- [x] Payroll V2 page (/payroll-v2): per-employee dashboard, payslip upload OCR, manual entry, YTD stats
- [x] Communications page (/communications): template library, compose & bulk send, outbox log
- [x] Meetings page (/meetings): meeting list, schedule meeting, AI agenda, minutes upload + transcription, auto-extract decisions
- [x] Onboarding pipeline page (/onboarding): kanban-style pipeline (contract → ID → DBS → induction → training → payslip)
- [x] Add all new pages to sidebar and App.tsx routes

## Wave 3 Next Steps (May 11, 2026)

### Gift Aid HMRC R68 XML Export
- [x] Backend: donorsV3.buildGiftAidR68Xml procedure — generate HMRC R68 XML from eligible gift_aid_claims for a given tax year quarter
- [x] Backend: donorsV3.submitGiftAidToTrustee — email R68 XML as attachment to finance trustee via Gmail API for review
- [x] Frontend: GiftAid.tsx — "Generate R68 XML" button with tax year + quarter selector, preview XML, "Email to Trustee" button

### Meeting Minutes Audio Transcription
- [x] Backend: meetingsV3.transcribeAndExtract — accept audio file URL, call Whisper transcription, then auto-extract decisions via LLM, save transcript + decisions to DB
- [x] Frontend: MeetingsV3.tsx — audio upload button in meeting detail, show transcription progress, display transcript + extracted decisions side-by-side

### Payroll V3 Payslip Email on Approval
- [x] Backend: payrollV3.emailPayslip procedure — on approve, generate PDF summary (gross, deductions, net, YTD) and email to employee via Gmail API
- [x] Frontend: PayrollV3.tsx — "Email Payslip" button shown after approval, confirmation toast with recipient name

## Suggested Next Steps (May 11, 2026 — Round 2)

### HMRC R68 Submission Tracking
- [x] DB: add submittedToHmrc (boolean), submittedAt (timestamp), hmrcRef (varchar) to gift_aid_claims table
- [x] Backend: donorsV3.markGiftAidSubmitted — set submittedToHmrc=true, submittedAt, hmrcRef on a claim batch
- [x] Frontend: GiftAid.tsx — "Mark as Submitted to HMRC" button with date/ref input, badge showing submitted vs pending

### Payslip PDF Attachment
- [x] Backend: payrollV3.emailPayslip — generate pdfkit PDF (gross, tax, NI, pension, net, YTD table) and attach to Gmail email
- [x] Frontend: PayrollV3.tsx — no UI change needed; email button already present, just improves email content

### Meeting Quorum Checker
- [x] DB: add attendees (json array of userId) and quorumRequired (int, default 3) to trustee_meetings table
- [x] Backend: meetingsV3.updateMeeting — accept attendees array, compute quorumMet boolean
- [x] Backend: sendComplianceDigest — flag meetings where quorumMet=false in the weekly digest
- [x] Frontend: MeetingsV3.tsx — attendees multi-select field, quorum status badge (Met / Not Met)

## Wave 4 — Master Communications Channel (May 11, 2026)

### DB Schema
- [x] DB: inbound_emails table (id, gmailMessageId, threadId, fromAddress, fromName, subject, bodyText, bodyHtml, receivedAt, hasAttachments, attachmentUrls json, category, assignedSection, isRead, isArchived, aiSummary, createdAt)
- [x] DB: email_sections table (id, name, slug, description, colour, sortOrder, isDefault, createdAt) — seeded with: Accounts, HMRC, Gift Aid, Student Accommodation, General Staff, General Enquiries, Urgent, Friday Comms
- [x] DB: email_assignments table (id, emailId, sectionId, assignedById, assignedAt, notes)

### Wave 4 Backend
- [x] commsHub.syncInbox (commsInbox.fetchFromGmail) — pull latest emails from Gmail API (inbox label), upsert into inbound_emails, download attachment metadata
- [x] commsHub.listEmails (commsInbox.listEmails) — paginated list with section/category/read filters
- [x] commsHub.getEmail (commsInbox.getEmail) — full email detail including AI summary on first open
- [x] commsHub.assignToSection (commsInbox.updateEmail) — move email to a named section (creates email_assignment row)
- [x] commsHub.markRead / commsHub.archiveEmail (commsInbox.updateEmail) — read/archive state management
- [x] commsHub.aiSummariseEmail (commsInbox.aiSummariseEmail) — call LLM with email body + attachments, return summary + suggested section
- [x] commsHub.aiOcrAttachment (commsInbox.ocrAttachment) — accept attachment URL, call LLM vision, return extracted fields (amount, date, ref, sender)
- [x] commsHub.replyEmail (via pushEmail) — send reply via Gmail API, log in outbox
- [x] commsHub.listSections / commsHub.createSection / commsHub.updateSection (commsInbox.listSections/upsertSection) — manage custom sections
- [x] Accountants section: filter view for Accounts + HMRC + Gift Aid sections with dedicated procedures

### Wave 4 Frontend
- [x] Master Comms Inbox page (/comms-inbox): sidebar section list, email list panel, email detail panel (3-pane layout)
- [x] Email list: sender, subject, date, AI summary snippet, section badge, unread indicator
- [x] Email detail: full body render (HTML/text), AI summary card, "Move to Section" dropdown, "Reply" button
- [x] AI OCR panel: for emails with attachments, "Read Attachment" button shows extracted fields (amount, date, ref)
- [x] Accountants Comms page (/accountants-comms): filtered view of Accounts/HMRC/Gift Aid sections only
- [x] Section management: "Add Section" button, rename/recolour sections inline
- [x] Sync button: "Fetch Latest Emails" triggers commsHub.syncInbox
- [x] Add both pages to sidebar under COMMUNICATIONS group and App.tsx routes

## Wave 4 Next Steps (May 11, 2026)

### Gmail Push Webhook
- [x] Backend: register Gmail push subscription via Gmail API watch() on server startup — topic: projects/hibba/topics/gmail-inbox
- [x] Backend: POST /api/gmail/push-webhook endpoint — verify X-Goog-Resource-State, decode Pub/Sub message, call fetchFromGmail to pull new messages
- [x] Frontend: CommsInbox.tsx — "Register Push Notifications" button in settings panel, shows active/inactive status

### Email Reply Threading
- [x] Backend: commsInbox.replyToEmail procedure — accept emailId + replyBody, send via Gmail API with In-Reply-To + References headers, log reply in email_activity_log
- [x] Frontend: CommsInbox.tsx — "Reply" button in email detail opens compose panel below original message, shows thread history

### Inbox Unread Badge
- [x] Backend: commsInbox.getInboxStats — already returns unreadCount; ensure it's exposed per-section too
- [x] Frontend: DashboardLayout.tsx — fetch unread count via commsInbox.getInboxStats, show red badge on "Master Inbox" nav item

## Wave 4 Next Steps Round 2 (May 11, 2026)

- [x] Backend: commsInbox.searchEmails — full-text search across sender/subject/body, filter by section/priority/read status/date range
- [x] Backend: commsInbox.bulkAction — accept array of emailIds + action (markRead, markUnread, archive, moveToSection), execute in batch
- [x] Frontend: CommsInbox.tsx — search bar at top of email list with debounce, filter chips (section, priority, unread, date)
- [x] Frontend: CommsInbox.tsx — checkbox column in email list, floating bulk action bar when items selected (Mark Read, Move, Archive)
- [x] Frontend: CommsInbox.tsx — "Use Template" dropdown in Reply tab, fetches commsV3 templates and pre-fills compose area

## Wave 4 Next Steps Round 3 (May 11, 2026)

### Email Priority Auto-Detection
- [x] Backend: commsInbox — on fetchFromGmail, run LLM classifier to set priority (urgent/high/normal/low) based on subject+sender+snippet
- [x] Backend: gmailWebhook.ts — also run priority classifier on push-triggered email fetch

### Scheduled Gmail Sync
- [x] Backend: scheduledJobs.ts — add hourly cron job that calls fetchFromGmail automatically (every hour, 06:00–22:00)

### Email-to-Receipt Linking
- [x] Backend: commsInbox.linkToReceipt — link emailId to receiptId, store in email_activity_log with action="linked_receipt"
- [x] Backend: commsInbox.searchReceiptsForLink — search receipts/expenses by keyword for the link picker dialog
- [x] Frontend: CommsInbox.tsx — "Link to Receipt" button in email detail, opens search dialog, shows linked receipt badge

## Wave 4 Round 4 — Priority Stats, Sync Indicator, Receipt Cross-Reference

- [x] Backend: commsInbox.getPriorityStats — count emails by priority (urgent/high/normal/low) for current inbox
- [x] Backend: commsInbox.getLastSyncTime — return lastSyncedAt timestamp from a settings/metadata table
- [x] Backend: scheduledJobs.ts — update syncGmailInbox to write lastSyncedAt to DB after each sync
- [x] Backend: commsInbox.getLinkedEmailsForReceipt — given receiptId, return all emails linked to it
- [x] Frontend: CommsInbox.tsx — priority stats bar in inbox header (4 coloured chips with counts)
- [x] Frontend: CommsInbox.tsx — "Last synced X min ago" indicator in inbox header, auto-refreshes every 60s
- [x] Frontend: Receipts page or receipt detail — "Linked Emails" section showing emails linked to this receipt
- [x] Tests: Wave 4 Round 4 vitest tests for all 4 new procedures and frontend components

## Wave 4 Round 5 — Section Reply Templates, Unread Digest, Receipt-Expense Auto-Link

- [x] DB: section_reply_templates table (sectionId nullable, title, body, createdAt)
- [x] Backend: commsInbox.listSectionTemplates — list templates for a given section (or global)
- [x] Backend: commsInbox.upsertSectionTemplate — create/update a section reply template
- [x] Backend: commsInbox.deleteSectionTemplate — delete a section reply template
- [x] Backend: scheduledJobs.ts — daily 08:00 unread digest cron (urgent+high emails → notifyOwner)
- [x] Backend: receipts.suggestExpenseLink — given receiptId, search expenses by amount+date proximity
- [x] Backend: receipts.confirmExpenseLink — save the receipt↔expense link
- [x] DB: receipts table — add linkedExpenseId column
- [x] Frontend: CommsInbox.tsx — section template picker in reply tab (per-section templates shown first)
- [x] Frontend: CommsInbox.tsx — "Manage Templates" button in section header to add/edit/delete templates
- [x] Frontend: ReceiptDetail.tsx — "Suggested Expense Match" card when suggestExpenseLink returns results
- [x] Tests: Wave 4 Round 5 vitest tests

## Wave 5 — Final Wave: Reports Dashboard, Audit Trail, System Health

- [x] DB: audit_log table (userId, action, entity, entityId, meta JSON, createdAt)
- [x] Backend: audit.log helper — called from key mutations (approve, delete, pay, link)
- [x] Backend: audit.list procedure — paginated audit log with filters (entity, userId, dateRange)
- [x] Backend: reports.annualSummary — income vs expenses by month for a given year
- [x] Backend: reports.categoryBreakdown — top expense categories for a period
- [x] Backend: reports.donorRetention — new vs returning donors by month
- [x] Backend: reports.systemHealth — DB row counts, last sync time, pending approvals, failed jobs
- [x] Frontend: Reports page (/reports) — annual income/expense chart, category breakdown, donor retention chart
- [x] Frontend: Audit Trail page (/audit) — paginated log table with entity/user/date filters (superadmin only)
- [x] Frontend: System Health page (/system-health) — live stats cards (DB counts, sync status, pending items)
- [x] Sidebar: add Reports, Audit Trail, System Health nav items (role-gated)
- [x] Tests: Wave 5 vitest tests (audit, reports, systemHealth procedures)

## Master Prompt Gap Analysis — P1 Implementation

- [x] Schema: pledges table (donorId, campaignId, totalAmount, frequency, paidAmount, balanceOwing, status, nextDueDate)
- [x] Schema: donors table — add rfmScore, rfmRecency, rfmFrequency, rfmMonetary, lawfulBasis, lastContactedAt
- [x] Schema: donorLeads — add amount, paymentMethod fields for QuickCapture
- [x] Schema: majorDonorDueDiligence table (donorId, amount, sanctionsCheckStatus, trusteeSignOffUserId, trusteeSignOffAt, notes)
- [x] Backend: crm.quickCapture — add amount + paymentMethod fields
- [x] Backend: pledges router — create, list, update, getByDonor, markPaid
- [x] Backend: donors.list — add filters (segment, lifetimeValue range, lastGift range, giftAidStatus, campaign)
- [x] Backend: RFM scoring — calculate and store rfmScore on donor record (cron or on-demand)
- [x] Backend: logAudit wired into approve-receipt, delete-receipt, payroll-run, donation-create, loan-approve
- [x] Backend: majorDonorDueDiligence — trigger on donation ≥£25k, sanctions check stub, trustee sign-off
- [x] Backend: bulkMessage approval gate — require second approver when recipient count >50
- [x] Backend: voiceAgent — add add_donation, gift_aid_balance, personal_contact_history tools
- [x] Frontend: DonorProfile.tsx — full profile page with tabs (Overview/Donations/Pledges/Comms/Notes/Audit)
- [x] Frontend: DonorProfile — quick actions (New donation, New pledge, Send WhatsApp, Send email, Log meeting, Pin note)
- [x] Frontend: DonorProfile — right rail Next Best Action AI suggestion
- [x] Frontend: Donors.tsx — add filter panel (segment, LTV, last gift, Gift Aid, campaign)
- [x] Frontend: DonorCRM.tsx QuickCapture — add amount + payment method fields
- [x] Frontend: PipelineKanban.tsx — cultivation stages Kanban (Identification→Qualification→Cultivation→Solicitation→Stewardship)
- [x] Frontend: Campaigns.tsx — approval gate dialog when recipient count >50
- [x] Tests: P1 vitest tests for pledges, RFM, QuickCapture amount, filters, major donor due diligence

## Master Prompt P2 Gap Implementation

- [x] Frontend: Bulk Approvals page (/bulk-approvals) — list pending/approved/rejected bulk message requests with approve/reject actions
- [x] Frontend: RFM segment chips on Donors list — colour-coded segment badge + "Run RFM Scoring" button
- [x] Frontend: Full Donor Profile page (/donors/:id) — tabs: Overview, Donations, Pledges, Communications, Notes, Audit
- [x] Frontend: Donor list advanced filters — segment, lifetime value range, Gift Aid status, campaign, last gift range
- [x] Backend + Frontend: Recognition tiers per campaign — Foundation/Wall/Roof/Mihrab with value thresholds
- [x] Backend + Frontend: SAR (Subject Access Request) workflow — one-click export of all donor data
- [x] Backend + Frontend: Right to erasure workflow — preserve financial, remove marketing data
- [x] Backend: Lawful basis fields on donor record (donation processing, Gift Aid, marketing, safeguarding)
- [x] Backend + Frontend: Conflicts of interest register — trustees giving to AQS
- [x] Backend + Frontend: Saved views per staff member on Donors list
- [x] Backend: UTM tracking + attribution model (first_touch_channel, conversion_channel) on donor/lead
- [x] Backend + Frontend: QR code generation (unique, attributable per campaign)
- [x] Frontend: AI suggested replies (3 options per inbound) in Master Inbox
- [x] Backend: logAudit wired into pledge create/update/markPaid and pipeline moveStage mutations

## Next Steps Round 2 (May 11 2026)

- [x] Pledge reminders: nightly scheduled job finds overdue/due-soon pledges and sends personalised email reminders
- [x] Donor Profile Communications tab: wire to inbound_emails filtered by donor email address
- [x] Recognition tier badge: show donor's current tier on Donor Profile Overview tab based on lifetime giving total

## Next Steps Round 3 (May 11 2026)

- [x] Stripe pledge payment link — createPledgeCheckout procedure + Pay Now button on Pledges tab + Stripe Checkout link in reminder email
- [x] Donor Profile — New Pledge quick-create dialog on Pledges tab (pre-filled with donor name + Gift Aid status)
- [x] Recognition Tiers — campaign leaderboard view showing donors ranked by total giving with tier badges

## Next Steps Round 4 (May 11 2026)

- [x] Stripe pledge webhook handler — /api/stripe/webhook auto-marks pledge as paid on checkout.session.completed
- [x] Donor Portal — public /give/:donorToken page with pledge history, Gift Aid declaration download, and Pay Now button
- [x] Bulk Gift Aid HMRC R68 export — Export HMRC R68 CSV button on Gift Aid & CRM+ page

## Bug Fixes (May 11 2026)

- [x] Fix broken donor portal link in WhatsApp messages — URL now uses /give/:token path with correct deployed domain
## Round 5 (May 12 2026)
- [x] Send Portal Link button on Donor Profile — one-click button that generates a portal token and sends the /give/:token link to the donor via WhatsApp/email
- [x] Pledge payment receipt email — after Stripe checkout.session.completed webhook, send donor a confirmation email with amount paid, remaining balance, and JazakAllah Khayran message
- [x] Annual giving statement PDF — Export Annual Statement button on Donor Profile generating a formatted PDF of all donations and Gift Aid declarations for a selected tax year

## Bug Fixes (May 12 2026)
- [x] Fix Scanner Gallery button — on mobile it opens camera instead of file picker; need accept="image/*,application/pdf" and correct capture attribute
- [x] Fix duplicate bottom nav bar on mobile — in-app bottom nav shows twice when browser PWA bar is visible; add safe-area padding and hide duplicate
- [x] Fix Comms Hub right panel overflow on mobile — message list/detail panel overflows off-screen on narrow viewports; make it responsive single-column
- [x] Fix donor portal "Link Not Valid" error — getByToken now handles donorLeadId tokens (QuickCapture leads) in addition to donorId tokens

## Donor Portal Enhancements (May 12 2026)
- [x] Inline profile completion form on donor portal — leads can fill in address, postcode, Gift Aid consent directly without contacting AQ Society
- [x] Token expiry warning banner on donor portal — show "This link expires in X days" when fewer than 7 days remain
- [x] Resend Portal Link button on QuickCapture leads table — regenerate and resend expired/new portal links in one click

## Comms Hub Improvements (May 12 2026)
- [x] Mark All Read button in Comms Hub section header
- [x] Swipe-to-archive gesture on mobile email list items
- [x] Inline PDF/image attachment preview in Comms Hub email detail panel

## Next Steps Round 6 (May 12 2026)
- [x] Comms Hub Flagged filter shortcut — one-tap "Flagged" button in email list toolbar to instantly filter to flagged messages
- [x] Send Annual Statement email — button on Donor Profile that emails the generated PDF directly to the donor with a pre-written covering message
- [x] Donor portal Pay Pledge Stripe flow — leads can make a Stripe payment directly from the /give/:token portal page without needing a full donor account

## Round 7 Next Steps (May 12 2026)
- [x] Donor communication log — DB table (donor_comms_log), backend listCommsLog/addCommsLog procedures, Communications tab on Donor Profile showing timestamped history of portal links, statements, and emails sent
- [x] Bulk annual statement export — batchSendAnnualStatements procedure generates + emails PDFs to all donors for a selected tax year; "Export All Statements" button on Gift Aid & CRM+ page with progress feedback
- [x] Compose New Email in Comms Hub — Compose button in toolbar opens dialog pre-filled with sender address from selected thread; sends via Gmail API and saves as outbound record

## Full Spec Audit — Gap Implementation (May 12 2026)

### Voice AI Upgrade (Module 01)
- [x] Upgrade Voice AI to use Gemini Live / gemini-2.5-flash for voice agent query
- [x] Multi-language support: detect language from transcript (Arabic, Urdu, Bengali, English) and respond in same language
- [x] Expand voice agent tools: compliance actions, training records, accommodation, bills/utilities, donors, campaigns
- [x] Add Islamic context to system prompt: use Assalamu Alaikum, JazakAllah Khair appropriately
- [x] Add multi-turn conversation memory (session context array persisted in component state)
- [x] Add "navigate_to" voice commands for all major pages
- [x] Voice agent: never invent figures — if data not in DB, say so
- [x] Voice agent: flag regulated transactions (>£25k donation, related-party payments)
- [x] Keyboard shortcut: hold Spacebar to talk (web push-to-talk)

### Bills & Utilities Module (Module 06)
- [x] DB: utility_accounts table (building, supplier, accountNumber, tariff, contractEndDate, mpan, directDebitAmount, lastBillDate, lastBillAmount, category)
- [x] DB: utility_bills table (accountId, billDate, amount, consumptionUnits, billUrl, notes)
- [x] Backend: bills.list, bills.create, bills.update, bills.delete, bills.addBill procedures
- [x] Frontend: /bills page with per-building tabs, contract renewal alerts, anomaly detection display
- [x] Sidebar: add "Bills & Utilities" nav item under FINANCE

### Training Tracker Module (Module 03)
- [x] DB: training_courses table (name, provider, requiredRoles, validityMonths, category)
- [x] DB: training_completions table (userId, courseId, completedAt, expiresAt, certificateUrl, notes)
- [x] Backend: training.listCourses, training.listCompletions, training.addCompletion, training.getMatrix procedures
- [x] Frontend: /training page with per-person matrix (green/amber/red), expiry dates, upload certificate
- [x] Sidebar: add "Training Tracker" nav item under ORGANISATION

### Dashboard Cockpit Upgrade (Module 07)
- [x] Top strip: live bank balance display (all accounts), unrestricted vs restricted split
- [x] "Needs attention today" tile: compliance actions due, payments awaiting approval
- [x] This week tile: scheduled meetings, training due, renewals
- [x] Compliance heat map: green/amber/red per policy, training, certificate
- [x] Always-visible AI voice button on dashboard (floating, prominent)
- [x] Donation trends chart: rolling 30/90/365 days
- [x] Cashflow 30-day projection tile

### Compliance Cockpit Enhancements (Module 03)
- [x] Serious Incident Reporting (SIR) workflow — voice or button initiated, walks through regulator framework
- [x] Policy tracker: each policy has owner, review date, version history, trustee approval evidence
- [x] Annual return pre-population from year's data with T-90/T-30/T-7 reminders
- [x] Trustee register: DOBs, declarations of interest, appointment dates, term expiry
- [x] Statutory inquiry actions: LBMW correspondence tracker (Khalid Sofi, Hannah Fingleton, Katie Kennell)

### AI Assistant Enhancements
- [x] AI system prompt: add AQS knowledge graph context (buildings, funds, obligations)
- [x] AI tool: get_compliance_actions — query compliance cockpit actions
- [x] AI tool: get_training_status — check training matrix for a person or role
- [x] AI tool: get_accommodation_tenants — query student accommodation
- [x] AI tool: get_utility_bills — query bills & utilities
- [x] AI tool: get_campaigns — query fundraising campaigns with ROI
- [x] AI tool: send_notification — notify owner of urgent items
- [x] AI tool: get_reconciliation_status — current month reconciliation state
- [x] AI: respond in detected language (Arabic/Urdu/Bengali/English)

### Missing/Incomplete Pages
- [x] Bills & Utilities page (/bills) — full CRUD with building tabs
- [x] Training Tracker page (/training) — matrix view with certificate upload
- [x] Backups page — make real: show last backup time, retention, DR drill date
- [x] System Health page — expand with uptime, response times, job status

### Sidebar Cleanup
- [x] Remove duplicate "Payroll V3" sidebar item (keep only "Payroll")
- [x] Remove duplicate "Comms Hub V3" sidebar item (keep "Master Inbox" as primary)
- [x] Add "Bills & Utilities" to FINANCE section
- [x] Add "Training Tracker" to ORGANISATION section

## Round 9 Next Steps (May 12, 2026)

- [x] Bills & Utilities — monthly direct debit calendar view showing all upcoming DD dates colour-coded by utility type
- [x] Training Tracker — bulk enrol dialog to assign multiple staff to a course in one action
- [x] LBMW Correspondence — auto-link to compliance actions: one-click option to create a linked Compliance Action with response deadline pre-filled

## Round 10 Next Steps (May 12, 2026)

- [x] LBMW — Gmail folder pull: fetch emails from a configured Gmail label/folder, auto-create correspondence records
- [x] LBMW — AI email summary: LLM summarises each pulled email, detects if action/invoice is needed
- [x] LBMW — Auto-create task + notify trustees/staff when email requires action
- [x] LBMW — Invoice tag: flag correspondence as invoice-to-pay, auto-populate into monthly expenses
- [x] Bills & Utilities — Auto-fill bills into monthly expenses on bill record creation/update
- [x] Bills & Utilities — Editable categories (utility types) in a settings panel
- [x] Bills & Utilities — Editable buildings list in a settings panel

## Round 11 Next Steps (May 12, 2026)

- [x] Scheduled daily Gmail pull for LBMW (cron job, configurable label + time)
- [x] Supplier contacts sub-section in Bills & Utilities Settings tab (name, phone, email, role per supplier)
- [x] Monthly Expenses: source badges to distinguish auto-bill, auto-LBMW-invoice, and manual entries
- [x] LBMW Correspondence: AI-automated file/image/photo/PDF scanner — upload → AI OCR extracts all fields → auto-fills create form → user confirms before saving
- [x] Bills & Utilities: AI-automated file/image/photo/PDF scanner — upload → AI OCR extracts supplier, amount, date, account → auto-fills bill form → user confirms before saving

## Round 12 Next Steps (May 12, 2026)

- [x] LBMW Correspondence: show "View File" link on each row that has an attached document, with a preview dialog (image/PDF)
- [x] AiDocumentScanner: add camera capture button (mobile-friendly, uses device camera directly)
- [x] Bills & Utilities: link supplier contacts to utility accounts — store supplierContactId on accounts, show contact card inline on account row

## Round 13 Next Steps (May 12, 2026)

- [x] LBMW Correspondence — bulk status update: checkbox select multiple rows, bulk toolbar to set status (Responded/Closed/Pending) in one action
- [x] Bills & Utilities — contract renewal reminder emails: auto-email admin when a contract is within 60 days of expiry, including supplier name, account number, and linked supplier contact details
- [x] Receipt Capture (ScanReceipt) — AI scanner integration: confirmed already built into the main Capture page (Camera + Gallery + AI OCR + auto-fill + submit flow)

## Round 14 Next Steps (May 12, 2026)

- [x] LBMW Correspondence — Export to PDF: date range filter + formatted report table (subject, sender, date, status, priority, linked action) downloadable as PDF
- [x] Bills & Utilities — Contract end date column: show contractEndDate in the accounts table with colour-coded expiry indicator (red <30 days, amber <60 days, green OK)
- [x] Bills & Utilities — In-app expiry badge: show count of contracts expiring within 60 days as a red badge on the Bills & Utilities sidebar nav item

## Round 15 — Cash Flow Planner (May 12, 2026)

- [x] Schema: add scheduled_payments table (accountId, description, dueDate, amount, status: pending/paid/held, paidAt, paidByUserId, heldAt, heldByUserId, note, source: dd/manual/bill)
- [x] Schema: add futureDate + expectedAmount fields to utility_bills for one-off upcoming bills
- [x] Bills router: generate upcoming DD payments from billingDay on utility accounts (next 3 months rolling)
- [x] Bills router: list upcoming one-off bills with futureDate set
- [x] Expenses router: cashflow.list — merge DD schedule + one-off bills into a unified upcoming payments list
- [x] Expenses router: cashflow.markPaid — tick-box → paid with date-time-user stamp
- [x] Expenses router: cashflow.markHeld — toggle held with date-time-user stamp + required note
- [x] Expenses router: cashflow.addNote — add/edit note on any scheduled payment
- [x] Monthly Expenses: new "Cash Flow" tab showing upcoming payments table with tick-box, paid/held toggle, notes, date-time-user stamps
- [x] Cash Flow tab: summary bar — total upcoming (30/60/90 days), total held, total paid this month, projected shortfall vs current income balance
- [x] Cash Flow tab: colour coding — red=overdue, amber=due within 7 days, green=OK, grey=held
- [x] Cash Flow tab: filter by building, utility type, date range

## Round 14 Next Steps (May 12, 2026)

- [x] LBMW Correspondence — Send to Trustees: button on PDF export dialog that emails the generated PDF to all trustees in one click
- [x] Bills & Utilities — Renew Contract button on expired/expiring account cards (pre-fills new start date, opens edit dialog)
- [x] Dashboard — Bills & Utilities summary widget: total monthly DD, expiring contracts count, next upcoming DD date

## Round 16 (May 12, 2026)
- [x] Cash Flow Planner — Add Manual Payment button: description, amount, due date, building, category, note fields; saves to scheduled_payments with source=manual
- [x] Cash Flow Planner — Weekly payment digest email: every Monday 7 AM, email admin/trustees with all payments due in the next 7 days, held payments highlighted
- [x] Bills & Utilities — Per-account Payment History timeline: tab/section on each account showing all past bills and DD payments in chronological order

## Round 17 — Complete Financial Management (May 12, 2026)
- [x] Cash Flow Planner — "Generate 90-day DDs" button auto-populates next 3 months of direct debits from active accounts
- [x] Bills & Utilities — Payment History CSV export per account
- [x] Bills & Utilities — Consumption/usage sparkline chart on each account card (last 6 months of bills)
- [x] Bills & Utilities — Supplier notes field on account cards (free-text notes per supplier)
- [x] Bills & Utilities — Monthly budget per account (budget vs actual spend bar)
- [x] Trustee Financial Dashboard — dedicated /trustee-dashboard page: income vs expenses chart, cash position, budget vs actuals, approval queue widget
- [x] Expense approval workflow — manager/trustee sign-off on expenses with date-time-user stamp and confirmation prompt
- [x] Monthly Close Report — auto-generate PDF summary (income, expenses, bills, cash flow) downloadable and emailable to trustees
- [x] Cash Flow Planner — running balance column showing projected cash position after each payment
- [x] Monthly Expenses — "Awaiting Approval" badge on unapproved entries visible to managers/trustees

## Round 18 — Mobile Layout Fixes (May 12, 2026)
- [x] Remove duplicate DashboardLayout wrappers from all pages that have them (causes double top bar + bottom nav on mobile): ComplianceCockpit, Decisions, BulkApprovals, ConflictsRegister, DonorPipeline, DonorProfile, MajorDonor, Pledges, QRCodes, RecognitionTiers, SavedViews, BillsUtilities, TrainingTracker, LbmwCorrespondence, TrusteeDashboard

## Round 19 — Spec Audit & Gap Fill (May 12, 2026)
- [x] P60 year-end certificate generation (per employee, HTML download via S3) — in Payroll module
- [x] P32 employer payment record generation (monthly totals, HTML download via S3) — in Payroll module
- [x] Facilities & Room Booking module — schema (facility_rooms, facility_bookings), router, frontend page, sidebar nav
- [x] isRestricted + restrictedFundName fields added to incomeRecords schema and income.create procedure
- [x] JSX multiple-root fragment fix across 12 pages (QRCodes, RecognitionTiers, SavedViews, BulkApprovals, ConflictsRegister, DonorPipeline, DonorProfile, MajorDonor, Pledges, BillsUtilities, TrusteeDashboard, TrainingTracker)
- [x] Bistro 87 restaurant/cafe management module — schema, router, frontend page, sidebar nav
- [x] Open Banking / TrueLayer live bank balance feed — DEFERRED: requires TrueLayer API key (provide key to enable)
- [x] GoCardless direct debit integration — DEFERRED: requires GoCardless API key (provide key to enable)
- [x] Gift Aid claim builder with HMRC CSV export — already built in DonorCRM.tsx (confirmed in audit)
- [x] Lapsed donor AI re-engagement campaign — already built in donorsV3.ts (confirmed in audit)
- [x] 13-week cashflow stress-test scenarios (base/best/worst) — added to trusteeFinance router
- [x] WebAuthn / TOTP / magic link auth — DEFERRED: requires auth provider upgrade (out of scope for current stack)
- [x] Sentry / PostHog / BetterStack observability — DEFERRED: requires API keys (provide DSN/key to enable)
- [x] Calendar sync (Google/Microsoft 365) — DEFERRED: requires additional OAuth scopes (provide credentials to enable)
- [x] Anomaly detection on expenses — AI-powered flagging added to bills.ts router

## Round 20 — Open Banking & Mobile Fixes (May 12, 2026)
- [x] TrueLayer Open Banking — schema (bank_connections table) created and migrated; router/secrets deferred (user skipped for now)
- [x] TrueLayer — live bank balance card on Trustee Dashboard (DEFERRED by user request — no API key; bank_connections table ready)
- [x] TrueLayer — live balance in Cash Flow Planner (DEFERRED by user request — no API key; will build when credentials provided)
- [x] Bistro 87 — mobile layout fixed: header wraps on mobile, tab bar horizontally scrollable, order filter buttons wrap
- [x] Facilities — mobile layout fixed: header buttons wrap, upcoming bookings row wraps, tab bar horizontally scrollable

## Donor CRM Spec Audit (Round 21 — May 2026)

- [x] Donors table — added all spec-required fields: status, source, preferredChannel, language, salutationPreference, marketingConsent, totalGiven, donationCount, firstGiftDate, lastGiftDate, averageGift, largestGift, rfmScore, rfmSegment, rfmLastCalculated, giftAidStatus, firstTouchChannel, firstTouchCampaign, conversionChannel, householdId, referredByDonorId, lawfulBasis, pinnedNote, tags, lapsedAt, reactivationCount
- [x] GiftAid — renamed R68 to ChR1 throughout (router, page, download filename)
- [x] QuickCapture — added £5/£10/£20/£50/£100/£250 preset buttons above amount input
- [x] Bank transfer reference codes — updated to SURNAME-XXXX format (e.g. RIMMER-A8K2) using donor surname + random 4-char alphanum
- [x] DonorProfile — added Dedications tab (Sadaqah Jariyah entries per donor)
- [x] DonorProfile — added Next Best Action card (spec Module 01) with contextual suggestions based on status/RFM/Gift Aid
- [x] CRM router — added addDonorDedication mutation (donor-level, no campaign required)
- [x] CRM router — updated listSadaqahEntries to support donorId filter (not just campaignId)
- [x] CRM router — added getDonorsWall public procedure (top donors + dedications + stats)
- [x] Donors Wall — created /donors-wall public page with top donors, Sadaqah Jariyah dedications, and stats
- [x] Donors Wall — added to App.tsx as public route and to sidebar navigation
- [x] RFM batch recalculation job — Admin tab in DonorCRM with one-click RFM recalculation and results table
- [x] Donor Portal — employer, preferred language, and salutation (title) added to progressive profiling form
- [x] Marketing attribution — attribution source captured in QuickCapture and donors table; attribution breakdown shown in CRM Admin tab

## QA Hardening Brief Audit (Round 22 — May 2026)

### Phase 1 — Auth & Access Control (PASS items)
- [x] Decimal(10,2) used for all monetary amounts in schema
- [x] Audit log table exists (audit_log)
- [x] GDPR SAR export and right to erasure in donorsV3 router
- [x] Bulk message approval gate (>50 recipients requires second approver, self-approval blocked)
- [x] Major donor due diligence at £25,000 threshold with sanctions screening

### Phase 1 — Gaps to fix
- [x] Stripe webhook idempotency guard (prevent double-processing on retry — add stripeEventId to processed_stripe_events table)
- [x] Rate limiting middleware (express-rate-limit on /api/trpc and /api/stripe/webhook)
- [x] Helmet security headers middleware (X-Frame-Options, CSP, X-Content-Type-Options)
- [x] Amount edge cases: £0.00 reject, negative reject, £0.01 flag suspicious, £1M route to manual review

### Phase 2 — Comms (PASS items)
- [x] Broadcast approval gate >50 recipients with owner notification

### Phase 2 — Gaps to fix
- [x] Quiet hours enforcement: block sends 22:00-07:00 UK, shift Friday 12:00-14:00 Jumu'ah window
- [x] Frequency cap: block second campaign contact within 14 days per donor
- [x] WhatsApp fallback to SMS — N/A: app uses manual WhatsApp Web links (wa.me), not automated API sends; no fallback needed

### Phase 3 — Finance & Gift Aid (PASS items)
- [x] Restricted fund isRestricted + restrictedPurpose fields in schema
- [x] Gift Aid 25p/£1 calculation and storage
- [x] ChR1 XML export (renamed from R68)
- [x] Major donor sanctions screening (OpenSanctions)

### Phase 3 — Gaps to fix
- [x] Gift Aid: block toggle ON if international address (no UK postcode)
- [x] Refund flow: original row preserved, refund as separate negative-amount row, Gift Aid reversal option, refundDonation procedure in crm.ts, Refund button in DonorProfile donations tab

### Phase 4 — Failure Modes (Gaps to fix)
- [x] Stripe webhook idempotency (kill-network test: record once, not twice)
- [x] OCR confidence threshold (40%): low-confidence scans flagged as failed with manual review note, no invented rows returned
- [x] Session expiry mid-form: useFormPersist hook saves form to localStorage, session-expired toast shown before redirect, return path saved in sessionStorage

### Phase 5 — Performance & UX (Gaps to fix)
- [x] Input font-size >= 16px on all forms (prevent iOS Safari auto-zoom) — already in index.css
- [x] PWA manifest.json created with name, icons, theme-color, display:standalone; manifest link + apple-touch-icon added to index.html
- [x] Human-readable error messages (replace raw tRPC error codes with user-friendly messages) — global sonner toast in main.tsx

### Phase 6 — Security (Gaps to fix)
- [x] Helmet security headers (X-Frame-Options, CSP, X-Content-Type-Options, HSTS)
- [x] Rate limiting on /api/trpc and /api/stripe/webhook

## Voice Agent Integration (Spec: HibbaVoiceAgentDoc2Manus.docx)

### DB Schema
- [x] voiceSessions table (id, userId, startedAt, endedAt, language, device, conversationId, tokenCount, status)
- [x] voiceToolCalls table (id, sessionId, toolName, params, resultSummary, latencyMs, createdAt)
- [x] voiceTranscripts table (id, sessionId, role, content, createdAt)
- [x] voiceCostTracking table (id, userId, date, tokenCount, estimatedCost)
- [x] voiceFeatureFlags table (id, toolName, enabledRoles JSON, phase, enabled, updatedAt)

### Voice Tool Endpoints (POST /internal/voice-tools/{tool})
- [x] get_current_user — returns user profile, role, permissions
- [x] get_screen_context — returns current page/entity from client context
- [x] set_user_preference — updates user preferences (language, briefing time)
- [x] get_staff_directory — excludes payroll unless superadmin
- [x] get_trustees — returns trustee list
- [x] get_donor — filtered by role permissions (reception can't see lifetime value)
- [x] search_transactions — paginated, date-filtered
- [x] get_fund_balance — live computation from income/expense tables
- [x] get_campaign_status — campaign progress + milestones
- [x] get_gift_aid_status — Gift Aid declarations and ChR1 status
- [x] get_qarde_hasan_register — loan register with repayment status
- [x] get_priorities — tasks + approvals + flagged items + follow-ups
- [x] create_donation — triggers receipt + thank-you + reconciliation pipeline
- [x] create_expense — with fund ring-fencing check
- [x] update_donor_profile — field-level permissions enforced
- [x] log_communication — writes to comms log
- [x] create_payment_link — generates Stripe Checkout session URL
- [x] draft_whatsapp / draft_email — writes to drafts table
- [x] send_single_message — validates draft confirmed, routes via email
- [x] compose_briefing — priorities + calendar + recent transactions + open items
- [x] compose_report — structured summary data
- [x] flag_for_review — writes to review queue, notifies Dr. Hamid

### Voice Gateway
- [x] WebSocket service with session management and auth verification
- [x] Gemini API integration (ready for API key handover)
- [x] Tool-call interception and routing layer
- [x] TTS streaming integration (placeholder for Google Cloud TTS / ElevenLabs)
- [x] Per-user rate limiting and cost caps (200k tokens/day, £500/month ceiling)

### UI Components
- [x] Microphone button component (press-and-hold, tap-to-toggle, bottom-right)
- [x] Waveform animation while processing
- [x] Streaming text transcript pane
- [x] Collapsible conversation history
- [x] "Correct this" button on agent statements → flag_for_review
- [x] Form-fill mode (push screen_context when form opens)
- [x] Wire VoiceAgent into DashboardLayout with feature flag check

### Admin & Scheduling
- [x] Feature flag admin panel for phased rollout control
- [x] Morning briefing scheduler (compose_briefing at user-preferred time)
- [x] Audit logging for all voice sessions and tool calls

### Deployment & Database (May 12 2026)
- [x] Fix build error: VoiceAgent.tsx import path corrected (@/contexts/AuthContext → @/_core/hooks/useAuth)
- [x] Gemini API key validated and configured
- [x] Database tables created (voice_sessions, voice_tool_calls, voice_transcripts, voice_cost_tracking, voice_feature_flags, voice_review_queue)
- [x] Feature flags seeded for 24 tools across 4 rollout phases
- [x] 314 tests passing (3 pre-existing credential failures only)

### Bug Fix: Voice Agent Session Error (May 12 2026)
- [x] Fix "Session expired. Please log in again" error when clicking Start Session in Voice Assistant
- [x] Rewrote voiceGateway.ts auth to use SDK cookie from WebSocket upgrade headers (httpOnly cookie)
- [x] Removed client-side cookie reading from VoiceAgent.tsx (was impossible due to httpOnly)
- [x] Fixed all schema column mismatches (speaker→role, text→content, flagName→toolName, etc.)
- [x] Used voiceReviewQueue table for correct_this/flag_for_review instead of non-existent voiceTranscripts columns
- [x] 314 tests passing, production build clean
// checkpoint marker

### Bug Fix: Voice Agent WebSocket Connection (May 12 2026)
- [x] Fix "Connecting..." then "Reconnect" — WebSocket connects but auth fails on production
- [x] Root cause 1: iOS Safari doesn't send httpOnly cookies on WebSocket upgrade requests
- [x] Fix: Added /api/voice/token endpoint that generates short-lived JWT (30s) for WS auth
- [x] Frontend fetches token via fetch() (which sends cookies), then passes as ?token= query param
- [x] Root cause 2: getDb() is async but was called without await → "db.select is not a function"
- [x] Root cause 3: Feature flag name mismatch — code looked for 'voice_agent_enabled' but DB uses '*'
- [x] Full end-to-end test passing: token generation → WS connect → session_started → session_ended
- [x] 314 tests passing, production build clean

### Bug Fix: Voice Input Mode Disabled (May 12 2026)
- [x] Fix "Voice input available when Gemini API key is configured. Using text mode." — enable microphone/voice input
- [x] Added MediaRecorder audio capture with hold-to-speak UI
- [x] Server-side audio transcription via Whisper API (upload to S3 → transcribe → process as text)
- [x] Voice mode is default; keyboard icon toggles to text mode

### Feature: Live Voice Agent with Instant Natural Speech (May 12 2026)
- [x] Replace record-transcribe-respond flow with real-time bidirectional audio streaming
- [x] Implement Gemini Live API (multimodal live) server-side relay
- [x] Frontend real-time audio capture via Web Audio API (continuous streaming, not record-and-send)
- [x] Real-time audio playback of AI responses (instant speech, not TTS after text)
- [x] Natural conversation flow — speak and hear responses like a phone call
- [x] Fix Gemini Live API setup message: use `setup` key with `generationConfig` wrapper (not `config`)
- [x] Fix Gemini model: use `gemini-3.1-flash-live-preview` (not deprecated `gemini-2.0-flash-live-001`)
- [x] Fix audio input format: use `realtimeInput.audio.data` (not deprecated `mediaChunks`)
- [x] Add null-safety for getDb() calls in voiceGateway.ts helper functions
- [x] End-to-end test: direct Gemini Live API connection + gateway relay both verified working

### Voice Agent Agentic + UX Improvements (May 12 2026)
- [x] Fix tool call pipeline: Gemini Live toolCall → server executeToolCall → routeToolCall → DB query → toolResponse back to Gemini
- [x] Verify all TOOL_DECLARATIONS match routeToolCall cases (donors, emails, campaigns, expenses, etc.)
- [x] Ensure toolResponse is sent back to Gemini in correct format so it can speak the results
- [x] Add output transcription display: show live text of what Hibba is saying alongside audio
- [x] Add input transcription display: show live text of what user is saying
- [x] Add session resumption: store Gemini sessionResumptionUpdate handle, reconnect on WS drop
- [x] Test end-to-end: "find donor X" → tool call → data returned → Hibba speaks the answer
- [x] Add search_donors tool (search by name/email/phone using LIKE query)
- [x] Add send_email tool (actually sends via SMTP/Gmail, not just draft)
- [x] Add navigate_to tool (sends navigation command to frontend)
- [x] Fix totalGiven field name (was totalGiving — field didn't exist in schema)
- [x] Move outputAudioTranscription/inputAudioTranscription to top-level setup (not inside generationConfig)
- [x] Add feature flags for new tools (search_donors, send_email, navigate_to)
- [x] Merge consecutive transcript messages from same speaker in frontend
- [x] Test end-to-end: "send email to X" → tool call → email sent → Hibba confirms (SMTP configured, password length check fixed from >=16 to >=8)

### Voice Agent Next Steps (May 13 2026)
- [x] Add create_task agentic tool (create tasks/reminders for staff via voice) — verified via end-to-end test
- [x] Add schedule_meeting agentic tool (schedule meetings with attendees via trusteeMeetings table)
- [x] Add generate_report agentic tool (generate summary reports on demand via monthly close report)
- [x] Implement Voice Activity Detection (VAD) on frontend — RMS-based silence detection with 800ms threshold
- [x] Verify full audio loop works in browser (create_task test: tool called, 34 audio chunks, 14 transcripts)
- [x] Add feature flags for create_task, schedule_meeting, generate_report in DB
- [x] Visual feedback: mic button pulses with ring animation when user is speaking
- [x] Status text changes: "Hearing you..." when speaking, "Listening..." when silent

### Voice Agent Major Overhaul (May 13 2026)
- [x] Fix timezone: enforce UK timezone (Europe/London) for all time-related responses — get_current_time tool + system prompt
- [x] Add anti-hallucination guardrails: only report data from tool results, never invent information — strict system prompt rules
- [x] Remove false references: system prompt lists ALL real app modules, navigate_to only allows valid paths
- [x] Full data visibility: 30+ tools covering all modules (expenses, payroll, income, loans, fundraising, accommodation, reconciliation, compliance, pledges, meetings, bills, facilities, etc.)
- [x] Add AQS website info tool: get_mosque_info returns full details from abdullahquilliam.org and theaqs.org
- [x] Add prayer times tool: get_prayer_times fetches live data from Aladhan API for Liverpool (start + jamaat)
- [x] Add donation/bank transfer info: get_donation_info returns bank details, Donorbox link, phone number
- [x] Navigate to Donorbox for regular donation setup — included in get_donation_info response
- [x] Add voice command reference card ("?" icon showing 12 example commands)
- [x] Add interrupt/barge-in support (VAD detects user speaking → stops Hibba's audio playback)
- [x] Charity info: Abdullah Quilliam Mosque & National Heritage Centre, Charity no: 1194942 — in get_mosque_info
- [x] Bank details: Account Name: Abdullah Quilliam Society, Account Number: 01158945, Sort Code: 40-29-28 — in get_donation_info
- [x] Phone: +441512603986 / 0151 260 3986 — in get_donation_info and get_mosque_info
### Donorbox + Conversation History + Live Testing (May 13 2026)
- [x] Create Donorbox donation page with embedded recurring donation widget — DonatePage.tsx with Donorbox embed, bank details, and phone
- [x] Add route /donate in App.tsx (public route, no login required) and /voice-history (dashboard route)
- [x] Update navigate_to tool to include /donate and /voice-history paths
- [x] Update get_donation_info tool to reference in-app /donate page
- [x] Voice conversations already stored in existing voiceSessions table (schema already had it)
- [x] Voice messages already stored in existing voiceTranscripts table (schema already had it)
- [x] DB helpers already existed in voiceGateway.ts (storeTranscript, logToolCall)
- [x] tRPC procedures already existed: voiceAgent.listSessions, voiceAgent.getSessionTranscript
- [x] Create Voice History UI page — VoiceHistory.tsx with session list + detail view with timeline
- [x] Voice gateway already stores transcripts in real-time via storeTranscript calls
- [x] Tool calls and results already stored in voiceToolCalls table for full audit trail
- [x] Added Voice History link to DashboardLayout sidebar (Mic icon, near Audit Trail)

### Voice Agent Bug Fix (May 13 2026)
- [x] Voice Agent not showing welcome message or responding to interaction on deployed site — RESOLVED: connection works, Gemini API key valid
- [x] Investigate WebSocket connection, Gemini API key, and server logs — all working
- [x] Fix garbled audio playback: RESOLVED — model name needed `models/` prefix; text input changed from clientContent to realtimeInput.text per Gemini 3.1 migration guide
- [x] Verify sample rate: Gemini outputs audio/pcm;rate=24000, AudioPlaybackQueue uses sampleRate=24000 — correct
- [x] Verify base64 decoding and PCM-to-Float32 conversion in AudioPlaybackQueue — correct implementation confirmed
### TypeScript Error Fixes (May 13 2026)
- [x] Fix 17 server-side TypeScript errors: date type mismatches (string vs Date), missing await getDb(), wrong field names (donorId→donorLeadId, channel→type, goalAmount→targetAmount), missing null checks on db, type casts for leftJoin results in trusteeFinance.ts, voiceTranscripts content cast to string
- [x] Fix bistro.ts: getDailyTotals date comparison + closeDailyTill date insert
- [x] Fix scheduledJobs.ts: supplierContacts.id comparison (boolean → eq())
- [x] Fix voiceGateway.ts: voiceCostTracking.date (string→Date), fundraisingDonations insert fields, voiceTranscripts content type
- [x] Fix voiceAgent.ts: receipts.receiptDate date comparison, donorName field, commsOutbox channel→type, briefingText/assistantMessage cast to string
- [x] Fix trusteeFinance.ts: billRows leftJoin type annotation, second billRows query with utilityAccounts join
- [x] 314/317 tests passing (3 pre-existing Google Drive credential failures)
### Hibba Voice Agent Major Upgrade (May 13 2026)
- [x] Voice session analytics: charts on Voice History page showing daily usage, top tools, token cost trends
- [x] Smooth speech: system prompt rewritten with fluency rules (no repetition, no filler, concise direct responses)
- [x] Full navigation map: Hibba knows every sidebar section and can navigate to any of them
- [x] Complete section list: all 34 sidebar sections mapped with routes and descriptions
- [x] Action tools: send_email (via Gmail API), send_whatsapp (commsOutbox queue), create_donor_note
- [x] Data access tools: get_training_summary, get_bistro_summary, get_conflicts, get_decisions, get_lbmw_correspondence, get_comms_inbox, get_org_chart, get_backups_status, get_recognition_tiers, get_compliance_summary, get_facilities_bookings, get_prayer_times
- [x] WhatsApp message action: queued via commsOutbox with wa.me fallback link
- [x] Email action: compose and send via existing Gmail API integration with personalized greeting
- [x] Notes action: create/save notes to donorNotes table

### Voice Navigation Wiring (May 13 2026)
- [x] Wire navigate_to tool: voiceGateway sends {type:"navigate", path:"/path"} to frontend WebSocket client — already implemented
- [x] VoiceAgent frontend handles navigate message and calls wouter's navigate() to push route — already implemented
- [x] Improved navigation UX: human-readable section names in toast + green banner in VoiceAgent UI
- [x] Updated command reference card with navigation/actions/data query examples
- [x] Test: 314/317 passing (unchanged)

### Context-Aware Hibba (May 13 2026)
- [x] Pass current page route + title as screenContext from App.tsx to VoiceAgent — already implemented
- [x] voiceGateway buildScreenDescription() maps paths to rich descriptions injected into system prompt
- [x] Hibba knows what page user is on and answers contextually (e.g. on /donors she knows to talk about donors)
- [x] Pass entity context (e.g. donor name/ID when on a donor profile page) — VoiceContextProvider + DonorProfile useEffect
- [x] DashboardLayout reads entityContext from VoiceContextProvider and passes to VoiceAgent
- [x] Mid-session context updates: screen_context message sends silent system note to Gemini via realtimeInput.text
- [x] 314/317 tests passing (unchanged)

### Hibba Cut-off Fix + Proactive Summaries (May 13 2026)
- [x] Fix Hibba getting cut off mid-sentence: investigate VAD sensitivity, audio queue, and interruption handling
- [x] Barge-in: only interrupt Hibba when user is clearly speaking (raise VAD threshold)
- [x] Extend entity context: Loan detail (LoanDetail.tsx), Receipt detail (ReceiptDetail.tsx) with useVoiceContext
- [x] Proactive page summaries: when Hibba navigates, auto-call data tool and speak a 1-sentence summary — implemented via realtimeInput.text context note to Gemini after navigate_to tool call

- [x] Fix AudioPlaybackQueue.stop() to hard-stop all active AudioBufferSourceNode instances
- [x] Raise VAD threshold 0.015→0.04, require 5 consecutive frames for barge-in, silence timeout 800ms→1200ms
- [x] Add Gemini server-side VAD config: activityHandling=NO_INTERRUPTION, END_SENSITIVITY_LOW, silenceDurationMs=1500
- [x] Add proactive page summaries: navigate_to handler sends context note to Gemini after navigation

- [x] Extend entity context to ALL 50 dashboard pages (47 new + 3 already done): AdminPanel, AuditTrail, Backups, BillsUtilities, Bistro87, BulkApprovals, Campaigns, CommHub, CommsInbox, CommsV3, Communications, ComplianceCockpit, ConflictsRegister, Dashboard, Decisions, DonorCRM, DonorPipeline, Donors, DonorsWall, Facilities, Fintech, Fundraising, GiftAid, Income, LbmwCorrespondence, Loans, MajorDonor, MeetingsV3, MergeHistory, MonthlyExpenses, OrgChart, Payroll, PayrollV3, Pledges, ProfileSettings, QRCodes, Receipts, RecognitionTiers, Reconciliation, Reports, SavedViews, StudentAccommodation, SystemHealth, TrainingTracker, TrusteeDashboard, Trustees, VoiceHistory, DonorProfile, LoanDetail, ReceiptDetail

## Hibba Voice Agent — Three Enhancements (May 2026)
- [x] Dynamic entity context: 13 pages updated with tab/filter deps (Payroll, PayrollV3, GiftAid, Income, Reconciliation, Reports, MonthlyExpenses, Bistro87, Facilities, MeetingsV3, MergeHistory, SavedViews, ProfileSettings)
- [x] Summarise This Page button (✨ Sparkles icon) in VoiceAgent header — sends spoken summary request to Hibba
- [x] Context-aware quick action chips: 30 pages mapped with 3 relevant quick actions each, shown in empty transcript state
- [x] Fix build-breaking syntax errors: em-dash inserted into import statements by entity context script (8 files fixed)
- [x] Undo navigation chip: 5-second Undo button appears in navigation banner after Hibba navigates
- [x] Session summary email: Mail button in VoiceAgent header sends LLM-generated session summary to user
- [x] Persistent quick action customisation: pencil icon opens edit modal, saves per-page actions to DB (voice_quick_actions table)

- [x] Voice session replay: TTS playback in Voice History page using Web Speech API
- [x] Morning briefing email: upgraded generateMorningBriefing to send rich HTML email to all trustees + key staff
- [x] Admin quick action sharing: adminShareQuickActions, listAdminSharedActions, deleteAdminSharedActions, triggerMorningBriefing procedures
- [x] Admin Hibba AI tab in AdminPanel: push quick actions to all users, trigger morning briefing, view/remove shared actions
- [x] VoiceAgent admin fallback: getAdminSharedActions query as fallback when user has no saved actions
- [x] Unique constraint on voice_quick_actions (userId, pageKey) for ON DUPLICATE KEY UPDATE

- [x] Per-user morning briefing preferences: user_briefing_prefs table, getBriefingPrefs/saveBriefingPrefs procedures, Settings notifications tab UI
- [x] TTS voice selector: voice dropdown in Voice History replay bar, loads browser voices, defaults to UK English, filters to English voices
- [x] Bulk quick action templates: 4 packs (Finance, Trustee, Fundraising, Operations) in Admin Panel Hibba AI tab, each applies to 4 pages at once
- [x] QUICK_ACTION_TEMPLATES constant with pre-curated actions per page for each pack

## Bug Fix: Published Site Crash (May 13 2026)
- [x] Fix "Cannot access 'Ae' before initialization" circular dependency crash on published site — resolved via React.lazy code splitting

## Bug Fix: Production TDZ Crash (May 13 2026)
- [x] Investigate "Cannot access 'fr' before initialization" crash on published site
- [x] Root cause: `currentQuickActions` (derived from `QUICK_ACTIONS`) used at line 295 but declared at line 347 in VoiceAgent.tsx
- [x] Fix: moved QUICK_ACTIONS and currentQuickActions declarations BEFORE effectiveQuickActions which references them
- [x] Add React.lazy code splitting to App.tsx — all 60+ page components now lazy-loaded
- [x] Main bundle reduced from 4.6MB to 848KB with proper chunk splitting
- [x] Verified fix in production build: variable now declared at position 729748, used at 732463 (correct order)
- [x] Build clean, 314/317 tests passing (3 pre-existing Google Drive credential failures)

## Hibba Islamic Identity & Form-Filling (May 13 2026)
- [x] Update Hibba's system prompt with Islamic identity (Assalamu Alaikum greetings, Bismillah, warm Muslim personality, Islamic etiquette)
- [x] Add data extraction capability: Hibba can parse voice descriptions into structured data (amount, payee, category, date, department)
- [x] Add form-filling capability: Hibba can populate forms on any page based on voice commands
- [x] Frontend: handle form-fill tool call responses from Hibba to auto-populate UI fields
- [x] Quick action chips updated with Islamic-friendly language where appropriate

## Next Steps: Extend Hibba Form-Filling (May 13 2026)
- [x] Integrate useHibbaFormFill into Payroll page
- [x] Integrate useHibbaFormFill into Loans page
- [x] Integrate useHibbaFormFill into Student Accommodation page
- [x] Add confirmation step — Hibba reads back extracted data before submitting the form

## QA & Hardening Brief Implementation

### Phase 1 — Truth Audit
- [x] Run full test suite with coverage report and capture output
- [x] Spot-check 10 tests for meaningful assertions
- [x] Document spec coverage for all 11 modules
- [x] Identify any features added that weren't in the original brief

### Phase 2 — Data Integrity
- [x] Audit schema constraints: FKs, NOT NULL, unique constraints, check constraints
- [x] Verify monetary values stored as integers (pence), not floats
- [x] Verify audit log has no UPDATE/DELETE permissions
- [x] Add missing database constraints where needed

### Phase 3 — Money & Compliance
- [x] Verify Stripe webhook idempotency (same event processed only once)
- [x] Verify webhook signature verification rejects invalid signatures
- [x] Verify Gift Aid calculation accuracy (25p per £1)
- [x] Test edge amounts (£0.00 rejected, negative rejected, £0.01 flagged)

### Phase 4 — Failure Mode Hunt
- [x] Verify double-click protection on donation/form submissions
- [x] Verify optimistic locking or conflict detection on concurrent edits
- [x] Verify OCR handles blank/garbage input gracefully
- [x] Verify SQL injection in OCR input is treated as text

### Phase 5 — Performance & UX
- [x] Run Lighthouse audit on primary screens
- [x] Run axe-core accessibility check on primary screens
- [x] Verify all form inputs have font-size >= 16px for mobile
- [x] Verify error messages are human-readable, not technical

### Phase 6 — Security & Launch Readiness
- [x] Run npm audit and document results
- [x] Pin all production dependencies to exact versions
- [x] Run secrets scanner against repo
- [x] Verify authorization bypass protection (role-based access)
- [x] Verify rate limiting is in place
- [x] Verify file upload validates type and size
- [x] Document backup and restore procedure

### Deliverable
- [x] Produce comprehensive QA report document with evidence (QA-REPORT.md)

### Critical Fixes (QA Hardening)
- [x] Fix 1: Add login brute-force protection (5 failed attempts → 15-min lockout)
- [x] Fix 2: Add DOMPurify sanitization to CommsInbox email HTML rendering (XSS)
- [x] Fix 3: Add server-side positive amount validation on receipt creation
- [x] Fix 4: Reconciliation lock — block updateBankBalance after session is finalised
- [x] Fix 5: Enable CSP in helmet with appropriate directives
- [x] Fix 6: Reduce session token expiry from 1 year to 30 days
- [x] Fix 7: Document vulnerable dependencies and remediation plan
- [x] Write regression tests for all critical fixes (5 new tests added)

## Bug Fixes — Hibba Data Access & Staff Emails
- [x] Fix Hibba's inability to read app data (trustees, staff, sections)
- [x] Fix all incorrect staff emails in the system

## Bug Fix — Mobile Overflow (Right-side content cut off)
- [x] Fix page header overflow on mobile: Trustee Financial Dashboard
- [x] Fix page header overflow on mobile: LBMW Correspondence Tracker
- [x] Fix page header overflow on mobile: Training Tracker
- [x] Fix page header overflow on mobile: Bills & Utilities
- [x] Fix page header overflow on mobile: Decisions Register
- [x] Add global CSS fix to prevent horizontal overflow on all pages
- [x] Fix additional pages: ConflictsRegister, QRCodes, RecognitionTiers, SavedViews, BulkApprovals, GiftAid
- [x] Add overflow-x-hidden to DashboardLayout main content area

## Feature — Hibba WhatsApp Sending via Voice
- [x] Investigate current WhatsApp integration (API, credentials, existing send functions)
- [x] Update send_whatsapp to generate wa.me deep link and send open_url to frontend
- [x] Add open_url message handler to VoiceAgent frontend component
- [x] Update system prompt to instruct Hibba to look up phone from staff directory first

## Bug Fix — Settings Page Crash
- [x] Fix "Cannot access 'n' before initialization" error in ProfileSettings page (moved useState before useEffect)

## Bug Fix — WhatsApp Not Opening from Hibba
- [x] Fix WhatsApp link not opening on device — added persistent green "Open WhatsApp" button + anchor click fallback

## Feature — Hibba Direct Email Sending
- [x] Investigate current send_email tool in voice gateway
- [x] Enhance send_email to send via Gmail API with OAuth2 token refresh
- [x] Add personalised greeting (Dear Name, Assalamu Alaikum) and sign-off (JazakAllah Khair)
- [x] Add system prompt instruction for Hibba to look up email from staff directory first
- [x] Log sent emails to comms outbox for record-keeping

## Feature — Bulk Messaging & Email Templates
- [x] Add bulk_send_email tool (send same email to all trustees / all staff / custom group)
- [x] Add bulk_send_whatsapp tool (open WhatsApp for each person in sequence)
- [x] Add email templates (Friday Comms, Urgent, Trustee Update, Staff Announcement)
- [x] Add open_url_batch handler to VoiceAgent frontend for multiple WhatsApp buttons
- [x] Update system prompt with bulk messaging and template instructions

## Hibba Voice Agent Document 2 Implementation
- [x] Add role-based permission enforcement on all voice tool endpoints (API-level, not just prompt)
- [x] Add per-user token budget tracking (200k/day hard cap, 80% soft warning)
- [x] Role-based tool access control (TOOL_PERMISSIONS map with API-level enforcement)
- [x] Token budget enforcement (200k/day per user, already existed)
- [x] Cache get_staff_directory and get_trustees responses (60s TTL)
- [x] flag_for_review tool and "Correct this" handler (already existed)
- [x] Voice rollout feature flag (phase-based, DB-driven, already existed)
- [x] Add missing tool endpoints: get_qarde_hasan_register, get_calendar, set_user_preference
- [x] Audible progress for complex queries (progress messages + "Let me look that up")
- [x] Feature flag updated to enable voice for all staff roles (not just superadmin)
- [ ] Add cost-per-session tracking and weekly cost report (future enhancement)
- [ ] Add monthly ceiling check (£500) — pause non-superadmin sessions if exceeded (future)
- [ ] Add session token freshness validation (prevent replay attacks) (future)
- [ ] Enhanced runtime context: pass form_fields, entity_type, entity_id with every request (future)
- [ ] Add speaker mode detection with sensitive content warning (future)

## Bug Fix — Email Compose Timestamp Crash
- [x] Fix "timestamp.toLocaleTimeString is not a function" error when creating/viewing emails (progress msg used Date.now() instead of new Date(), added safety guard)

## Voice Greeting Improvement & Gmail Fix
- [x] Improve Hibba's greeting to be time-of-day aware (Good morning/afternoon/evening)
- [x] Add proactive contextual briefing on session start: pending tasks, next prayer time, new emails/messages
- [x] Send initial greeting prompt to Gemini after setup completes (auto-trigger greeting without user speaking first)
- [x] Fix Gmail OAuth error handling: detect invalid_grant and provide clear reconnection guidance
- [x] Ensure greeting sentence is not cut off (audio plays fully before listening starts)

## Google Drive / Gmail Labels / Sheets Integration
- [x] Update Google Drive credentials (Client ID, Secret, Refresh Token) to match new OAuth project (608725271076)
- [x] Implement Google Drive service: read files and save files to folder 1qyR0sy_I1FYv45YjZYUIksPr7_ZLNCYT
- [x] Implement Gmail label fetching: read all labels and fetch emails by label (especially "hibba" label)
- [x] Add email summarization and action creation from fetched emails (via AI in voice gateway)
- [x] Implement communications sorting UI for emails by label/category (tRPC router added)
- [x] Implement Google Sheets service: create expense sheets and monthly income/expense breakdowns
- [x] Add bulk email capability for trustees, staff, donors, and utility companies
- [x] Wire Hibba voice agent with Google Drive tools (read/save files)
- [x] Wire Hibba voice agent with Gmail label tools (fetch, sort, summarize emails)
- [x] Wire Hibba voice agent with Sheets tools (create expense/income reports)

## Email-to-Comms-Hub Pipeline & Daily Briefing
- [x] Auto-push fetched emails into Master Comms Hub with AI summary and action points
- [x] Priority labeling: allow Urgent/Medium/Low marking on emails in Comms Hub
- [x] Section movement: move emails between Comms Hub sections (Accounts, Staff, Urgent, etc.)
- [x] Daily 9am briefing: calendar appointments for the day + events within 2 hours + urgent emails
- [x] Google Drive document round-trip: save documents to Drive and re-upload after changes
- [x] Wire Hibba voice tools for email-to-hub pipeline (auto-summarize and push)

## Bug Fix — Hibba Can't Access Google Drive / Gmail
- [x] Fix Hibba voice tools returning "unable to perform that function" for Google Drive and Gmail operations

## Hibba Voice Assistant — Tool Calling Fix
- [x] Diagnose root cause: 73 tools sent to Gemini Live exceeds recommended 10-20 limit
- [x] Implement dynamic tool selection based on screen context (getToolsForContext)
- [x] Categorize tools into groups: CORE (6), GOOGLE (10), COMMS (10), FINANCE (10), PEOPLE (8), OPERATIONS (10), FORM (3)
- [x] Map each screen path to 1-2 relevant tool groups (max 16-19 tools per context)
- [x] Add toolConfig with mode AUTO for Gemini Live setup
- [x] Update system prompt to explain tool availability changes by screen
- [x] Verify server restarts successfully with new dynamic tool selection

## Hibba Voice Assistant — Auto-Navigate & Retry
- [x] Implement tool-to-screen mapping (reverse lookup: which screen provides which tool)
- [x] Add auto-navigate logic: when Gemini calls a tool not in current context, navigate first then retry
- [x] Update system prompt to instruct Gemini to use navigate_to before calling unavailable tools
- [x] Test cross-screen tool requests (e.g., ask for emails while on /receipts)

## Bug — Hibba still can't do emails or check Google Drive after tool selection fix
- [x] Investigate server logs for tool execution errors during voice sessions
- [x] Identify and fix root cause of Google Drive/Gmail tool failures — was redirect_uri_mismatch (wrong OAuth client used for re-auth)

## Google OAuth Re-authorization Flow
- [x] Create server-side OAuth endpoints (/api/google/auth-url, /api/google/callback)
- [x] Build admin UI page with "Re-connect Google" button showing connection status
- [x] Store new refresh tokens in environment/secrets on successful re-auth
- [x] Test the full flow end-to-end

## Bug — Change Password form sends currentPassword as undefined
- [x] Fix the change password form validation error: "Invalid input: expected string, received undefined" for currentPassword field

## Bug — Google OAuth redirect_uri_mismatch on deployed site
- [x] Fix: Re-auth flow was using GOOGLE_REAUTH_CLIENT_ID (Hibba io - 608725271076) which doesn't have the redirect URI registered
- [x] Solution: Changed code to use GMAIL_CLIENT_ID (Aqs finance app - 781074422659) which has https://receiptapp-excmtodu.manus.space/api/google/callback registered
- [x] Fix: Frontend now passes origin as query parameter for reliable URL detection behind proxy
- [x] Fix: Added proper x-forwarded-proto/host detection for HTTPS in production
- [x] Added /api/google/debug endpoint for troubleshooting redirect URI issues

## Bug — Login form "string did not match expected pattern" on iOS Safari
- [x] Fix login form to prevent iOS Safari browser-level pattern validation error on email/password fields (Login, Register, ForgotPassword — noValidate + type=text inputMode=email)

## Bug — Login cookie not persisting on deployed site (SameSite=None without Secure)
- [x] Root cause: Express behind Cloud Run/Cloudflare proxy couldn't detect HTTPS, so cookie had SameSite=None without Secure flag — browsers silently reject this
- [x] Fix: Added `app.set('trust proxy', 1)` to server/_core/index.ts so req.protocol correctly returns 'https'
- [x] Fix: Changed login redirect from setLocation("/") to window.location.href = "/" for full page reload after auth

## Bug — Hibba voice agent stuck on "Connecting to Hibba..." on deployed site
- [x] Diagnose why WebSocket connection fails for voice agent on deployed site — Gemini model gemini-3.1-flash-live-preview requires allowlist access, switched to gemini-2.5-flash-native-audio-latest, removed unsupported toolConfig, changed text input to use clientContent
- [x] Fix the voice agent connection issue — model changed, toolConfig removed, text input uses clientContent for 2.5 model

## Bug — Hibba voice agent listening and response not working properly
- [x] Diagnose audio input/output issues after switching to Gemini 2.5 model
- [x] Fix audio handling for Gemini 2.5 compatibility: switched to v1alpha API, added thinkingBudget:0, enabled proactiveAudio, changed all realtimeInput.text to clientContent, added contextWindowCompression

## Hibba Voice Agent — Native Rebuild (May 15 2026)
- [x] Replace Gemini Live WebSocket architecture with native Web Speech API approach
- [x] Build server-side tRPC voice endpoint: text-in → AI processing with tools → text-out (voiceNativeChat.ts, 1103 lines)
- [x] Build new VoiceAgent component using browser SpeechRecognition (STT) + SpeechSynthesis (TTS)
- [x] Preserve all existing Hibba tools (70+ tools: navigate, fill_form, Gmail, Drive, WhatsApp, etc.)
- [x] Preserve Hibba's Islamic identity, time-aware greeting, and personality
- [x] Preserve screen context awareness and quick actions
- [x] Add vitest tests for new voice architecture (32 tests passing)
- [ ] Test and verify on deployed site

## Bug — Hibba native voice returns "Sorry, I couldn't process that" on deployed site
- [x] Diagnose server-side error: Gemini API requires `id` on tool_calls and `name` on tool response messages
- [x] Fix: generate IDs for tool_calls, add name field to tool response messages

## Restore Gemini Live Voice — Fix Deployed Connection Issue
- [x] Diagnose why Gemini WebSocket fails on deployed site — confirmed Gemini Live API works (tested directly)
- [x] Restore original VoiceAgent.tsx with WebSocket audio playback (natural Gemini voice)
- [x] Keep nativeChat as text-mode fallback only
- [ ] Verify on deployed site after publish

## ElevenLabs Conversational AI Voice Agent Integration (deferred — user chose Gemini)
- [x] Research ElevenLabs Conversational AI API and SDK (completed, deferred in favor of Gemini)
- [ ] (deferred) Set up ElevenLabs API key
- [ ] (deferred) Build server-side signed URL endpoint for ElevenLabs
- [ ] (deferred) Build client-side VoiceAgent with ElevenLabs SDK
- [ ] (deferred) Connect Hibba's tools and personality to ElevenLabs agent

## Gemini Live Voice Agent — Full Rewrite
- [x] Diagnose exact deployed failure — Gemini Live API confirmed working (v1alpha + gemini-2.5-flash-native-audio-latest)
- [x] Verified: system prompt, tool declarations, tool implementations, personality all intact in voiceGateway.ts
- [x] Restored original WebSocket-based VoiceAgent.tsx client component (1172 lines)
- [x] All 46 tests passing (13 gateway + 33 native chat)
- [ ] Verify full voice flow on deployed site after publish

## Bug — Login fails with "The string did not match the expected pattern"
- [x] Fix: added .trim() to all email Zod schemas (login, register, forgotPassword) to handle whitespace; improved error message display in toast

## Bug — Voice WebSocket auth fails on deployed site ("Authentication failed. Please log in again.")
- [x] Deep trace of full auth chain: token fetch → token verify → WebSocket upgrade → Gemini connect
- [x] Fix: increased WS token expiry 30s→120s for Cloud Run cold starts
- [x] Fix: null check on connectToGeminiLive return value
- [x] Fix: 15s Gemini connection timeout with clear error reporting
- [x] Fix: client-side retry logic (3 attempts with backoff) for token fetch
- [x] Fix: 15s client-side connection timeout for WebSocket
- [x] Added detailed logging throughout auth chain for deployed debugging
- [x] (superseded) Publish and verify — replaced by client-side Gemini approach, no server voice logs needed
- [x] (superseded) WebSocket subprotocol fallback — replaced by client-side Gemini approach

## Voice Assistant — Full Rebuild (Gemini 2.0 Live + Aoede Voice)
- [x] Research Gemini 2.0 Live API (models, WebSocket protocol, audio format, voice options)
- [x] Extract all 70+ tools, system prompt, and personality from existing voiceGateway.ts
- [x] Build new server-side voice gateway (voiceGateway.ts) from scratch — clean WebSocket proxy to Gemini 2.0 Live
- [x] Client VoiceAgent.tsx verified compatible with new server protocol (no changes needed)
- [x] Configure Aoede voice in Gemini 2.0 Live setup message
- [x] Preserve Hibba's Islamic personality and all agentic tools
- [x] Write comprehensive vitest tests for new gateway (13 tests passing)
- [x] Integration test: verify full flow works on dev server (server running, 46 tests passing)
- [x] Save checkpoint and deliver for deployed testing (checkpoint c1b5d859)
- [x] Migrated to @google/genai SDK with ai.live.connect() (replaces raw WebSocket)
- [x] Updated tests for SDK approach (17/17 passing)
- [x] Fixed open_whatsapp to open_url message type alignment

## Merge Verification — Gemini WebSocket + VoiceAgent UI Integration
- [x] Verify server-side: voiceGateway.ts attached to Express/HTTP server in server entry point (index.ts:151)
- [x] Verify server-side: voiceTokenRoute.ts registered for /api/voice/token (index.ts:124)
- [x] Verify client-side: VoiceAgent component mounted in DashboardLayout.tsx (line 520)
- [x] Verify client-side: VoiceContext provider wrapping app in main.tsx (line 160)
- [x] No missing wiring — all connections verified
- [x] Run tests and confirm server health (46/46 tests passing, server 200 OK, voice gateway attached)

## Voice Assistant — Replace with Iframe Embed (Standalone Hibba App)
- [x] Remove server/voiceGateway.ts
- [x] Remove server/voiceTokenRoute.ts
- [x] Remove server/voiceGateway.test.ts
- [x] Remove client VoiceAgent.tsx component
- [x] Remove client VoiceContext.tsx
- [x] Remove VoiceContext provider from main.tsx
- [x] Remove VoiceAgent mounting from DashboardLayout.tsx
- [x] Remove voice-related router (server/routers/voiceAgent.ts)
- [x] Remove @google/genai dependency
- [x] (superseded) iframe embed — replaced by direct client-side HibbaVoice component
- [x] (superseded) iframe microphone — replaced by direct browser Gemini connection
- [x] (superseded) floating button — HibbaVoice already has floating panel UI
- [x] (superseded) mount in DashboardLayout — HibbaVoice already mounted
- [x] Run tests and verify server health — 8 voice tests pass
- [x] Save checkpoint — de97af98

## Voice Assistant — Component-Level Integration from Reference Repo
- [x] Read reference repo audio-utils.ts, App.tsx voice UI, and server.ts patterns
- [x] Install @google/genai SDK
- [x] Create server-side Gemini WebSocket gateway (voiceGateway.ts) from reference repo patterns
- [x] Create client-side audio-utils.ts from reference repo
- [x] Create client-side HibbaVoice.tsx floating component
- [x] Wire HibbaVoice into DashboardLayout
- [x] Connect tools to existing receipt-scanner database and tRPC procedures
- [x] Use existing GEMINI_API_KEY
- [x] Server running with voice gateway attached (Gemini 2.0 Flash Live + Aoede)
- [x] Run vitest tests (330/337 pass, 7 Google OAuth pre-existing failures)
- [x] Save checkpoint and deliver

## Bug Fix — Voice Connection Errors on Deployed Site (May 16 2026)
- [x] Root cause identified: Model `gemini-2.0-flash-live-001` no longer exists in API (returns 404)
- [x] Switch model to `gemini-2.5-flash-native-audio-latest` (supports bidiGenerateContent)
- [x] Fix greeting: use `sendClientContent` instead of `sendRealtimeInput` for text prompts
- [x] Fix text messages: use `sendClientContent` for user text input (ordered, reliable)
- [x] Add 20-second Gemini connection timeout with clear error message
- [x] Wrap all onmessage callbacks in try/catch to prevent crashes
- [x] Add clientWs.readyState checks before every WebSocket send
- [x] Add detailed [Hibba] and [VoiceToken] logging throughout auth chain
- [x] Propagate actual error messages to client (not generic "AI engine error")
- [x] Client: Add token fetch retry logic (3 attempts, exponential backoff for cold starts)
- [x] Client: Add 25-second connection timeout waiting for session_started
- [x] Client: Validate WebSocket URL before connecting
- [x] Client: Show detailed status messages during connection phases
- [x] Add 16 vitest tests covering gateway config, model availability, token auth, and code patterns
- [ ] Publish and verify voice works on deployed site (PENDING USER PUBLISH)

## Bug — Voice errors persist on deployed site after publish (May 16 2026)
- [x] Investigate: "WebSocket connection error" after "initializing AI" — WebSocket may not be supported on Cloud Run (CONFIRMED: proxy returns 200 HTML)
- [x] (resolved) Connection error after auth — root cause: leaked API key + deprecated model. Fixed with new key + client-side approach
- [x] (resolved) Auth failed — replaced server-side token route with tRPC ephemeral token (uses existing session auth)
- [x] Determine if Cloud Run supports WebSocket upgrade for /api/voice path (NO — Manus/Cloudflare proxy blocks it)
- [x] If WebSocket not supported, implement alternative approach — SSE + HTTP POST rebuild complete

## Voice Assistant — SSE+HTTP Rebuild (WebSocket not supported on deployed proxy)
- [x] Root cause: Manus/Cloudflare proxy returns 200 HTML for WebSocket upgrade instead of 101 — WebSocket not supported
- [x] Replace WebSocket gateway with SSE (server→client) + HTTP POST (client→server) architecture
- [x] Server: Create voice session management with unique session IDs
- [x] Server: SSE endpoint GET /api/voice/stream?sessionId=xxx for audio/transcript/tool events
- [x] Server: POST /api/voice/audio for sending audio chunks from client to Gemini
- [x] Server: POST /api/voice/start to initiate a Gemini Live session and return sessionId
- [x] Server: POST /api/voice/stop to end a session
- [x] Client: Update HibbaVoice.tsx to use EventSource (SSE) + fetch POST for audio
- [x] Preserve all 30+ tool declarations and executeTool function
- [x] Preserve Hibba's Islamic identity, system prompt, and Aoede voice
- [x] Remove WebSocket server (ws package) dependency from voice gateway
- [x] Add vitest tests for new SSE-based voice architecture
- [x] Verify on dev server before deploying (server running, 364 tests pass)

## Voice Agent — Clean Rebuild from GitHub Reference (May 16 2026)
- [x] Extract all Hibba skills/tools/integrations into reference doc (hibba-skills-reference.md)
- [x] Read GitHub reference repo for clean Gemini Live voice implementation
- [x] Build minimal voice gateway — pure Gemini Live audio, NO tools, NO tool declarations
- [x] Build minimal HibbaVoice client component — just mic capture + audio playback
- [x] Wire into server entry point, verify on dev server (30 tests pass)
- [ ] Save checkpoint and test on deployed site (PENDING)
- [ ] Once working: incrementally add tools back from reference doc

## Voice Agent — Client-Side Direct Gemini Connection (May 16 2026)
- [x] Remove server-side voice gateway from server entry (voiceGateway.ts kept for compat, routes removed)
- [x] Build client-side HibbaVoice component that connects directly to Gemini Live API from browser
- [x] Use ephemeral tokens via tRPC voice.getEphemeralToken (server creates token, client uses it)
- [x] Use @google/genai SDK in the browser (client-side) for live.connect()
- [x] Audio capture via AudioWorklet/MediaRecorder, playback via AudioContext
- [x] Hibba Islamic identity system prompt preserved
- [x] No server proxy needed — browser connects directly to Gemini WebSocket
- [x] Test on dev server — 8 voice tests pass, model gemini-2.5-flash-native-audio-latest
- [ ] Verify on deployed site (PENDING USER PUBLISH)

## Voice UI Improvements — Transcript & Minimizable Panel (May 16 2026)
- [x] Show full sentences/paragraphs in transcript, not individual words
- [x] Buffer incoming transcript text and only display when sentence is complete (period, question mark, etc.)
- [x] Minimizable panel — collapse to small floating button while voice continues
- [x] Audio continues playing in background when panel is minimized
- [x] User can scroll/navigate other screens while Hibba speaks
- [x] Expand back to full panel by tapping the minimized button
- [x] Clean, professional transcript layout with clear speaker labels (Hibba/You chat bubbles)

## Bug Fix — CSP blocking Gemini Live connection (May 16 2026)
- [x] Added https://generativelanguage.googleapis.com to CSP connect-src
- [x] Added wss://generativelanguage.googleapis.com to CSP connect-src
- [x] Set GEMINI_API_KEY with preventMatching to ensure correct key is used

## Bug Fix — Mic button overlapping bottom nav (May 16 2026)
- [x] Move Hibba mic button above the bottom navigation bar so it doesn't overlap with Scan tab

## Hibba Personality & Tools Re-addition (May 16 2026)
- [x] Fix mic button position — moved to bottom-right just above More nav item
- [x] Add full Hibba personality system instruction (Islamic identity, time-aware greeting, AQS context)
- [x] Add navigation tools (navigate user to different pages in the app)
- [x] Add receipt/expense query tools (lookup receipts, expenses, categories)
- [x] Add donor and loan query tools (lookup donors, loans, repayments)
- [x] Add payroll and income tools (lookup payroll, income records)
- [x] Add dashboard summary tool (get_dashboard_summary, get_monthly_expense_total)
- [x] Server-side hibbaTools router with protected read-only queries
- [ ] Test each tool addition incrementally — rollback if crash
