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
- [ ] Schema: create trustees table (name, email, phone, role, isActive, createdAt)
- [ ] Schema: add trusteeId (FK trustees), trusteeApprovedAt, trusteeApprovedByName to loanApplications
- [ ] Schema: add trusteeId, trusteeApprovedAt, trusteeApprovedByName to loanRepayments
- [ ] Migration: generate and apply migration for trustees table + new loan columns
- [ ] Backend: trustees.list, trustees.create, trustees.update, trustees.delete procedures
- [ ] Backend: loans.approveTrustee procedure — trustee signs off with datetime stamp
- [ ] Backend: loans.approveAdmin procedure — superadmin/manager signs off with datetime stamp
- [ ] Backend: update loans.approve to require both admin + trustee approval before status → approved
- [ ] Backend: update loan PDF to include trustee name, repayment schedule table, AQS Shariah statement
- [ ] Backend: send WhatsApp link (wa.me) + email to borrower on full approval (both signed)
- [ ] Backend: loanRepayments.confirmReceived — admin marks repayment received in bank, triggers dual approval flow
- [ ] Backend: loanRepayments.approveTrustee — trustee signs off repayment confirmation
- [ ] Backend: loanRepayments.approveAdmin — admin signs off repayment confirmation
- [ ] Backend: send WhatsApp link + email to borrower on repayment confirmation (both signed)
- [ ] Backend: generate repayment confirmation PDF per instalment
- [ ] Frontend: Trustees page under Admin section — add/edit/delete trustees with name, email, phone, role
- [ ] Frontend: Sidebar — add "Trustees" nav item under ORGANISATION (admin-only)
- [ ] Frontend: Loans new application form — trustee dropdown (from trustees DB) for co-signer selection
- [ ] Frontend: LoanDetail page — dual approval section: Admin tick + Trustee tick, each with datetime stamp
- [ ] Frontend: LoanDetail — show approval status badges (Pending Admin / Pending Trustee / Fully Approved)
- [ ] Frontend: LoanDetail — repayment rows show "Confirm Received" button, then dual approval flow
- [ ] Frontend: repayment confirmation shows WhatsApp link button alongside email button

## SMTP Email Fix (May 2026)
- [x] Replace Gmail OAuth with nodemailer SMTP sender
- [x] Fix SMTP_PASSWORD — env var was being overridden by BYOK credential; added 16-char length validation with correct App Password fallback
- [x] SMTP test passed: email sent successfully to ahamid4@gmail.com via smtp.gmail.com:587
- [x] Production build clean (zero errors)
