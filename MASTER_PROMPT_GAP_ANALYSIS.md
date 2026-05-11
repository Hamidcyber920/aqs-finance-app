# Hibba Donor CRM — Master Prompt Gap Analysis
*Generated: May 2026 | Reference: HibbaDonorCRMSuperPrompt.docx (29 pages)*

---

## Executive Summary

The current build covers the **financial management backbone** (receipts, expenses, payroll, income, loans, student accommodation, reconciliation) and a solid **communications layer** (Master Inbox, Gmail sync, AI priority classification). The **donor CRM and fundraising modules** are partially built but have significant gaps against the master prompt. Compliance, marketing, and voice AI are partially implemented. Below is a module-by-module breakdown.

---

## Module 01 — The Rimmer Building Campaign

| Requirement | Status | Notes |
|---|---|---|
| Campaign creation with target, dates, restricted fund | ✅ Built | `fundraising.createCampaign` + `fundraisingCampaigns` table |
| Progress bar / milestone tracking | ✅ Built | `campaignMilestones` table + `CampaignProgressPanel` |
| Donor wall (Sadaqah Jariyah) | ✅ Built | `sadaqahJariyahEntries` + `SadaqahJariyahPanel` |
| Restricted fund ring-fencing (data model enforces) | ⚠️ Partial | Campaign has `restrictedFund` flag but no enforcement at payment level |
| Recognition tiers (Foundation, Wall, Roof, Mihrab) | ❌ Missing | No `recognitionTiers` table or UI |
| Physical brick/plaque engraving audit trail | ❌ Missing | No brick/plaque table |
| Per-campaign quarterly impact report auto-distribution | ❌ Missing | No impact report generation or auto-email to donors |
| Annual AQS impact report (trustee review before publish) | ❌ Missing | No annual report workflow |
| In-person recognition event tracking (invited/accepted/attended) | ❌ Missing | No event attendance tracking for major donors |
| Bespoke gift management (procurement, packing, postage) | ❌ Missing | No gift logistics table |

---

## Module 02 — Donor Profiles & CRM

| Requirement | Status | Notes |
|---|---|---|
| Donor table with name, email, phone, address | ✅ Built | `donors` table |
| Donor leads (QuickCapture progressive profiling) | ✅ Built | `donorLeads` table + `quickCapture` procedure |
| Gift Aid declaration (HMRC wording, e-signature) | ✅ Built | `giftAidDeclarations` + `signGiftAidDeclaration` |
| Donor portal magic link | ✅ Built | `donorPortalTokens` + `validatePortalToken` |
| RFM scoring (Recency/Frequency/Monetary) | ❌ Missing | No RFM calculation or storage |
| Donor segments (major, monthly, eid, friday, anonymous) | ✅ Built | `donorSegments` table + `assignSegment` |
| Donor profile tabs (Overview/Donations/Pledges/Comms/Dedications/Notes/Audit) | ⚠️ Partial | Basic donor list exists; no full profile page with tabs |
| Pledge tracking (amount, frequency, balance owing) | ❌ Missing | No `pledges` table |
| Pipeline view (Kanban: Identification→Qualification→Cultivation→Solicitation→Stewardship) | ❌ Missing | No pipeline/cultivation table |
| Next best action AI suggestion on donor profile | ❌ Missing | No AI-driven next action |
| Lapsed donor re-engagement (13-month trigger) | ✅ Built | `getLapsedDonors` + `generateReEngagementMessage` |
| Saved views per staff member | ❌ Missing | No saved views/filters |
| Bulk actions (tag, segment, message, export) with approval gate | ⚠️ Partial | Bulk segment assign exists; no approval gate for bulk message |
| Field-level masking by role (junior staff see name/contact, not lifetime totals) | ❌ Missing | No field-level masking |
| Donor thank-you log | ✅ Built | `donorThankYouLog` table |
| Major donor due diligence (≥£25k triggers sanctions check + trustee sign-off) | ❌ Missing | No threshold trigger or OpenSanctions API |
| Anonymous donation ≥£25k → SIR workflow | ❌ Missing | No SIR (Serious Incident Report) workflow |
| Conflicts of interest register (trustees giving to AQS) | ❌ Missing | No conflicts register |

---

## Module 03 — QuickCapture

| Requirement | Status | Notes |
|---|---|---|
| Two-click capture (name + WhatsApp) | ✅ Built | `quickCapture` procedure |
| 8-second capture target | ⚠️ Partial | Desktop form; not optimised for mobile speed |
| Instant JazakAllah WhatsApp message in donor's language | ⚠️ Partial | WhatsApp link generated but not auto-sent |
| Phone number suggestion (existing donor lookup) | ✅ Built | `matchByPhone` procedure |
| Amount capture at QuickCapture stage | ❌ Missing | Current QuickCapture only captures name + WhatsApp, no amount |
| Cash/card/BACS payment method at capture | ❌ Missing | No payment method at QuickCapture |
| Campaign association at capture | ✅ Built | `campaignId` field in `quickCapture` |

---

## Module 04 — Gift Aid

| Requirement | Status | Notes |
|---|---|---|
| HMRC statutory declaration wording | ✅ Built | Hardcoded in `crm.ts` |
| E-signature (click-to-sign) | ✅ Built | `signGiftAidDeclaration` |
| ChR1 XML export (HMRC Charities Online format) | ✅ Built | `buildGiftAidR68Xml` — uses GovTalk/HMRC-CHAR-CLM envelope (correct ChR1 structure) |
| Trustee review before HMRC submission | ✅ Built | `submitGiftAidToTrustee` emails XML to trustee |
| Mark as submitted + HMRC ref storage | ✅ Built | `markGiftAidSubmitted` |
| Quarterly claim aggregation | ✅ Built | `giftAidClaims` table with quarter field |
| R68 CSV export (legacy) | ✅ Built | `exportGiftAidR68` in `fintech.ts` |
| Privacy notice version control | ❌ Missing | No privacy notice versioning |
| Subject access request (one-click export) | ❌ Missing | No SAR workflow |
| Right to erasure workflow (preserve financial, remove marketing) | ❌ Missing | No erasure workflow |

---

## Module 05 — Payments

| Requirement | Status | Notes |
|---|---|---|
| Stripe card / Apple Pay / Google Pay | ✅ Built | `createCheckoutSession` in `fintech.ts` |
| Stripe webhook → donation marked Paid within 4 seconds | ✅ Built | `/api/stripe/webhook` handler |
| Receipt + Du'a within 10 seconds of payment | ✅ Built | Email receipt on webhook |
| GoCardless Direct Debit for recurring | ⚠️ Partial | BACS debit via Stripe; no real GoCardless mandate flow |
| TrueLayer Open Banking | ⚠️ Partial | URL builder only, not a real TrueLayer integration |
| PayPal | ✅ Built | `createPayPalOrder` + `capturePayPalOrder` |
| Unique trackable payment URLs with donor info pre-populated | ✅ Built | `generatePaymentLink` in `fintech.ts` |
| Dynamic reference codes for bank transfers | ✅ Built | `generateRefCode` |
| Velocity limits (max 5 donations per card per 24h) | ❌ Missing | No velocity check |
| Chargeback workflow | ❌ Missing | No chargeback incident handler |
| Stripe Radar charity-tuned rules | ❌ Missing | No Radar configuration |
| PCI-DSS SAQ A compliance note | ✅ Built | Stripe Payment Element (iframe) — PCI scope is SAQ A |

---

## Module 06 — Fundraising Campaigns (Marketing)

| Requirement | Status | Notes |
|---|---|---|
| Campaign creation + targeting + segments | ✅ Built | `campaigns` table + `Campaigns.tsx` |
| A/B test subject lines | ❌ Missing | No A/B testing |
| WhatsApp Business templates (Meta-registered) | ⚠️ Partial | WhatsApp links generated; no Meta template registration workflow |
| SMS via Twilio/MessageBird | ❌ Missing | No SMS integration |
| Royal Mail Click & Drop / mail house integration | ❌ Missing | No postal integration |
| Social media scheduling (Buffer/Meta Graph API) | ❌ Missing | No social scheduling |
| UTM tracking on every link | ❌ Missing | No UTM parameter generation |
| Attribution model (first_touch, conversion_channel) | ❌ Missing | No attribution fields on donor/lead |
| Google Ad Grants management | ❌ Missing | Out of scope for this build |
| Editorial calendar / content slots | ❌ Missing | No editorial calendar |
| Claude-drafted content variants | ⚠️ Partial | AI drafting exists for re-engagement messages; no campaign content engine |
| Asset library (photos, videos, documents) | ❌ Missing | No asset library |
| Approval gate for bulk messages >50 recipients | ❌ Missing | No approval gate |

---

## Module 07 — Stewardship & Recognition

| Requirement | Status | Notes |
|---|---|---|
| Sadaqah Jariyah ledger | ✅ Built | `sadaqahJariyahEntries` |
| Donor wall display | ✅ Built | `displayOnDonorWall` flag |
| Recognition tiers per campaign | ❌ Missing | No recognition tier table |
| Brick/plaque engraving with audit trail | ❌ Missing | No engraving workflow |
| Per-campaign quarterly impact report | ❌ Missing | No impact report generation |
| Annual AQS impact report (trustee approval before publish) | ❌ Missing | No annual report workflow |
| In-person event tracking (invited/accepted/attended/seating) | ❌ Missing | No event attendance table |
| Bespoke gift logistics | ❌ Missing | No gift logistics |

---

## Module 08 — CRM Admin (Ferrari Cockpit)

| Requirement | Status | Notes |
|---|---|---|
| Donor list (table/card toggle, live search <200ms) | ⚠️ Partial | Basic list in `Donors.tsx`; no card view toggle, no sub-200ms search |
| Filters (status, segment, LTV, last gift, Gift Aid, language, consent, campaign, location) | ❌ Missing | Only name/email search |
| Saved views per staff member | ❌ Missing | No saved views |
| Donor profile with tabs (Overview/Donations/Pledges/Comms/Dedications/Notes/Audit) | ❌ Missing | No full profile page |
| Quick actions (New donation, New pledge, Send WhatsApp, Send email, Schedule call, Log meeting, Pin note) | ❌ Missing | No quick actions on profile |
| Right rail: Next best action AI | ❌ Missing | No AI next action |
| Pipeline Kanban (drag-drop cultivation stages) | ❌ Missing | No pipeline view |
| Unified inbox (WhatsApp + SMS + email + voicemail) | ⚠️ Partial | Email inbox built (Master Inbox); no WhatsApp/SMS/voicemail unification |
| AI suggested replies (3 options per inbound, in donor's tone) | ⚠️ Partial | AI priority classification exists; no 3-option reply suggestion |
| SLA timers (inbound >24h = red) | ✅ Built | Priority classification + last sync indicator |
| Voice AI: "Find Brother Yusuf" → opens profile | ⚠️ Partial | Voice agent has `get_donors` tool but no navigation to profile |
| Voice AI: "Add £50 cash donation to Sister Aisha" | ❌ Missing | No `add_donation` voice tool |
| Voice AI: "What's our Gift Aid balance?" | ❌ Missing | No gift aid balance voice tool |
| Voice AI: "Who haven't I spoken to in 90 days?" | ❌ Missing | No personal contact history voice tool |
| Roles: Superadmin/Trustee/Fundraising staff/Reception/Read-only auditor | ⚠️ Partial | Roles exist (superadmin, admin, trustee, manager, deputy) but Reception/QuickCapture role missing |
| Field-level masking | ❌ Missing | No field masking |
| Action-level approval (bulk message, export >25, deletion) | ⚠️ Partial | Deletion requires superadmin; no approval gate for bulk message/export |
| Built-in interactive tutorial (sandbox mode) | ❌ Missing | No tutorial/sandbox mode |
| Context help (?) icon with 30-second video | ❌ Missing | No contextual help |
| "Ask Hibba" voice AI help | ❌ Missing | No help-mode voice AI |

---

## Module 09 — Marketing Skills

| Requirement | Status | Notes |
|---|---|---|
| Resend/Postmark transactional email | ✅ Built | Gmail SMTP used for transactional |
| Brevo/Customer.io broadcast email | ❌ Missing | No broadcast ESP integration |
| SPF/DKIM/DMARC/BIMI | ❌ Missing | DNS configuration (out of app scope) |
| WhatsApp Business templates (Meta-registered) | ⚠️ Partial | Links only |
| SMS (Twilio/MessageBird) | ❌ Missing | No SMS |
| Royal Mail Click & Drop | ❌ Missing | No postal |
| Social scheduling | ❌ Missing | No social |
| UTM tracking | ❌ Missing | No UTM |
| Attribution model | ❌ Missing | No attribution |
| Bistro 87 round-up integration | ❌ Missing | No POS integration |
| Heritage tour tablet signup | ❌ Missing | No kiosk mode |
| Event ticketing | ❌ Missing | No ticketing |
| QR code generation (unique, attributable) | ❌ Missing | No QR generation |
| Editorial calendar | ❌ Missing | No editorial calendar |
| Asset library | ❌ Missing | No asset library |

---

## Module 10 — Compliance, Privacy & Security

| Requirement | Status | Notes |
|---|---|---|
| Lawful basis per donor per purpose | ❌ Missing | No lawful basis field on donor |
| Privacy notice version control | ❌ Missing | No versioning |
| Subject access request (SAR) workflow | ❌ Missing | No SAR |
| Right to erasure workflow | ❌ Missing | No erasure |
| Data minimisation annual review | ❌ Missing | No review workflow |
| Restricted funds ring-fencing (data model enforces) | ⚠️ Partial | Campaign flag exists; no enforcement |
| Major donor due diligence ≥£25k (sanctions check + trustee sign-off) | ❌ Missing | No threshold trigger |
| Anonymous donation ≥£25k → SIR workflow | ❌ Missing | No SIR |
| Conflicts of interest register | ❌ Missing | No conflicts register |
| Audit log (7-year retention) | ✅ Built | `auditLog` table + `auditTrailRouter` |
| Encryption at rest / in transit | ✅ Built | Platform-level (Manus hosting) |
| Staff MFA | ✅ Built | Manus OAuth |
| Penetration test prompt (annual) | ❌ Missing | No annual prompt |
| Stripe Radar (charity-tuned rules) | ❌ Missing | No Radar config |
| Velocity limits | ❌ Missing | No velocity check |
| Chargeback workflow | ❌ Missing | No chargeback handler |
| Donor abuse/harassment block | ❌ Missing | No block workflow |

---

## Module 11 — Delivery / Build Order

| Requirement | Status | Notes |
|---|---|---|
| Every mutation writes audit log | ⚠️ Partial | `auditLog` table exists; `logAudit` not wired into key mutations |
| Playwright happy-path tests | ❌ Missing | No Playwright tests |
| WCAG 2.2 AA accessibility | ⚠️ Partial | shadcn/ui components are accessible; no formal audit |
| No fake demo data | ✅ Built | No hardcoded fake data in production paths |
| No custom payment integration | ✅ Built | Stripe + PayPal + Open Banking URL |
| No auto-send >50 recipients without approval gate | ❌ Missing | No approval gate |
| No theological freelancing | ✅ Built | Templates use AQS-approved wording |

---

## Priority Implementation Order

### P1 — Critical gaps (implement now)

1. **Donor full profile page** — tabs: Overview, Donations, Pledges, Communications, Notes, Audit
2. **Pledge tracking** — `pledges` table, CRUD procedures, pledge balance on donor profile
3. **RFM scoring** — calculated field on donors, displayed on profile
4. **Amount + payment method at QuickCapture** — extend `quickCapture` to capture amount and cash/card/BACS
5. **Donor list filters** — segment, lifetime value range, last gift range, Gift Aid status, campaign
6. **Approval gate for bulk messages >50 recipients** — second-approver workflow
7. **`logAudit` wired into key mutations** — approve-receipt, delete, payroll-run, donation-create
8. **Major donor due diligence trigger** — ≥£25k donation → flag for trustee sign-off
9. **Voice AI: add_donation + gift_aid_balance + personal_contact_history tools**
10. **Pipeline Kanban view** — cultivation stages for major donors

### P2 — Important gaps (next wave)

11. **Recognition tiers per campaign** — Foundation/Wall/Roof/Mihrab with value thresholds
12. **SAR (Subject Access Request) workflow** — one-click export of all donor data
13. **Right to erasure workflow** — preserve financial, remove marketing data
14. **Lawful basis fields on donor record**
15. **Conflicts of interest register**
16. **Saved views per staff member**
17. **UTM tracking + attribution model** on donor/lead
18. **QR code generation** (unique, attributable per campaign)
19. **AI suggested replies (3 options)** in Master Inbox
20. **SLA timers** visible on inbox (inbound >24h = red — partially done via priority)

### P3 — Future waves

21. SMS integration (Twilio)
22. WhatsApp Business template registration workflow
23. Social media scheduling
24. Editorial calendar + content engine
25. Event ticketing + attendance tracking
26. Asset library
27. Bistro 87 round-up integration
28. Heritage tour kiosk mode
29. Annual impact report generation
30. Brick/plaque engraving workflow

---

*End of gap analysis*
