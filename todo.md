# Receipt Scanner - Project TODO

## Database & Backend
- [x] Add receipts table to drizzle schema (id, userId, vendor, date, amount, tax, category, status, imageUrl, thumbnailUrl, rawText, lineItems, notes, createdAt)
- [x] Add expense_categories table (id, name, color, icon)
- [x] Generate and apply DB migration
- [x] Add receipt query helpers in server/db.ts
- [x] Add receipt CRUD tRPC procedures (create, list, get, update, delete)
- [x] Add file upload endpoint (multipart form via multer, store to S3, return url)
- [x] Add AI OCR procedure: send image/PDF to LLM, extract structured data (vendor, date, amount, tax, items, category suggestion)
- [x] Add export procedure: generate CSV and PDF report
- [x] Add owner notification on receipt processed and monthly threshold exceeded

## Frontend
- [x] Design system: clean business theme (navy/slate), index.css tokens
- [x] DashboardLayout with sidebar nav (Capture, Dashboard, Receipts, Reports)
- [x] Camera capture page: live camera preview, capture button, retake, confirm & process
- [x] Drag-and-drop upload page: file picker, preview, upload progress, AI processing status
- [x] Dashboard page: summary stats cards, category pie/bar chart, recent receipts table
- [x] Receipts list page: filterable table (date range, category, vendor, status), pagination
- [x] Receipt detail page: image viewer, extracted data fields, manual edit form, save
- [x] Export page/modal: date range picker, format selector (CSV/PDF), download button
- [x] Month-based filter (March 2026 preset + custom range)
- [x] Loading/empty/error states throughout

## Testing
- [x] Vitest: receipt CRUD procedures
- [x] Vitest: upload validation (size, type)
- [x] Vitest: export CSV generation
- [x] Vitest: category totals
- [x] Vitest: auth logout (existing)

## Auth & Admin (Phase 2)
- [x] Add passwordHash, resetToken, resetTokenExpiry fields to users table
- [x] Generate and apply DB migration for auth fields
- [x] Backend: POST /api/auth/register (name, email, password)
- [x] Backend: POST /api/auth/login (email, password → JWT session cookie)
- [x] Backend: POST /api/auth/logout (clear cookie)
- [x] Backend: POST /api/auth/forgot-password (send reset email via notification)
- [x] Backend: POST /api/auth/reset-password (token + new password)
- [x] Backend: GET /api/auth/me (return current user from session)
- [x] Admin tRPC procedures: listAllUsers, updateUserRole, suspendUser, listAllReceipts
- [x] Frontend: Login page (email + password form)
- [x] Frontend: Register page (name + email + password)
- [x] Frontend: Forgot Password page (email input)
- [x] Frontend: Reset Password page (token from URL + new password)
- [x] Frontend: Admin Panel page (user management table + all-receipts view)
- [x] Guard all receipt procedures: regular users see only their own; admins see all
- [x] Replace Manus OAuth login button with email/password form
- [x] Vitest: register, login, forgot-password, reset-password procedures
- [x] Vitest: admin-only procedures reject non-admin users
