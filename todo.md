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
