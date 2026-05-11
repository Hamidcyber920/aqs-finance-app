import { describe, it, expect } from "vitest";

// ─── Unit tests for CommHub helper logic ──────────────────────────────────────
// These tests cover pure utility functions extracted from the commsHub router.
// Database-dependent procedures are integration-tested separately.

// ─── Section slug generation ──────────────────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_")
    .slice(0, 50);
}

describe("CommHub section slug generation", () => {
  it("converts spaces to underscores", () => {
    expect(generateSlug("HMRC Correspondence")).toBe("hmrc_correspondence");
  });

  it("strips special characters", () => {
    expect(generateSlug("Gift Aid & Tax!")).toBe("gift_aid_tax");
  });

  it("lowercases the slug", () => {
    expect(generateSlug("Trustees Only")).toBe("trustees_only");
  });

  it("trims whitespace", () => {
    expect(generateSlug("  General Enquiries  ")).toBe("general_enquiries");
  });

  it("truncates to 50 chars", () => {
    const long = "This is a very long section name that exceeds fifty characters in total";
    expect(generateSlug(long).length).toBeLessThanOrEqual(50);
  });

  it("handles single word", () => {
    expect(generateSlug("Urgent")).toBe("urgent");
  });
});

// ─── Priority validation ──────────────────────────────────────────────────────

const VALID_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
type Priority = typeof VALID_PRIORITIES[number];

function isValidPriority(p: string): p is Priority {
  return VALID_PRIORITIES.includes(p as Priority);
}

describe("CommHub priority validation", () => {
  it("accepts valid priorities", () => {
    expect(isValidPriority("urgent")).toBe(true);
    expect(isValidPriority("high")).toBe(true);
    expect(isValidPriority("normal")).toBe(true);
    expect(isValidPriority("low")).toBe(true);
  });

  it("rejects invalid priorities", () => {
    expect(isValidPriority("critical")).toBe(false);
    expect(isValidPriority("")).toBe(false);
    expect(isValidPriority("URGENT")).toBe(false);
  });
});

// ─── Visibility rules ─────────────────────────────────────────────────────────

const VISIBILITY_ROLES: Record<string, string[]> = {
  all_senior: ["superadmin", "trustee", "manager", "deputy", "admin"],
  trustees_only: ["superadmin", "trustee"],
  chair_only: ["superadmin"],
};

function canViewMessage(visibility: string, role: string): boolean {
  const allowed = VISIBILITY_ROLES[visibility] ?? [];
  return allowed.includes(role);
}

describe("CommHub visibility rules", () => {
  it("all_senior allows superadmin, trustee, manager, deputy, admin", () => {
    expect(canViewMessage("all_senior", "superadmin")).toBe(true);
    expect(canViewMessage("all_senior", "trustee")).toBe(true);
    expect(canViewMessage("all_senior", "manager")).toBe(true);
    expect(canViewMessage("all_senior", "deputy")).toBe(true);
    expect(canViewMessage("all_senior", "admin")).toBe(true);
  });

  it("all_senior blocks volunteer and user", () => {
    expect(canViewMessage("all_senior", "volunteer")).toBe(false);
    expect(canViewMessage("all_senior", "user")).toBe(false);
  });

  it("trustees_only allows superadmin and trustee only", () => {
    expect(canViewMessage("trustees_only", "superadmin")).toBe(true);
    expect(canViewMessage("trustees_only", "trustee")).toBe(true);
    expect(canViewMessage("trustees_only", "manager")).toBe(false);
  });

  it("chair_only allows only superadmin", () => {
    expect(canViewMessage("chair_only", "superadmin")).toBe(true);
    expect(canViewMessage("chair_only", "trustee")).toBe(false);
    expect(canViewMessage("chair_only", "manager")).toBe(false);
  });
});

// ─── Gmail push-in section auto-routing ──────────────────────────────────────

const SECTION_KEYWORDS: Record<string, string[]> = {
  accountants: ["accountant", "accounts", "audit", "balance sheet", "p&l", "profit and loss"],
  hmrc_gift_aid: ["hmrc", "gift aid", "tax return", "self assessment", "vat", "paye", "rti"],
  trustees: ["trustee", "board meeting", "agm", "minutes", "resolution", "governance"],
  facilities: ["facilities", "maintenance", "repair", "boiler", "cleaning", "security"],
  bookings: ["booking", "reservation", "hire", "hall", "room", "event"],
  urgent: ["urgent", "asap", "immediately", "deadline", "overdue", "final notice"],
  student_accommodation: ["student", "accommodation", "tenancy", "rent", "deposit", "room"],
};

function autoRouteSectionSlug(subject: string, body: string): string {
  const text = `${subject} ${body}`.toLowerCase();
  for (const [slug, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) return slug;
  }
  return "general_enquiries";
}

describe("CommHub Gmail auto-routing", () => {
  it("routes HMRC emails to hmrc_gift_aid", () => {
    expect(autoRouteSectionSlug("HMRC PAYE notice", "")).toBe("hmrc_gift_aid");
  });

  it("routes gift aid emails to hmrc_gift_aid", () => {
    expect(autoRouteSectionSlug("Gift Aid claim", "Please process the gift aid claim")).toBe("hmrc_gift_aid");
  });

  it("routes accountant emails to accountants", () => {
    expect(autoRouteSectionSlug("Accounts query", "Your accountant has sent the audit report")).toBe("accountants");
  });

  it("routes trustee emails to trustees", () => {
    expect(autoRouteSectionSlug("Board meeting minutes", "")).toBe("trustees");
  });

  it("routes urgent emails to urgent", () => {
    expect(autoRouteSectionSlug("URGENT: Action required", "Please respond immediately")).toBe("urgent");
  });

  it("routes booking emails to bookings", () => {
    expect(autoRouteSectionSlug("Hall booking request", "We would like to book the hall")).toBe("bookings");
  });

  it("routes student accommodation emails correctly", () => {
    expect(autoRouteSectionSlug("Student tenancy renewal", "")).toBe("student_accommodation");
  });

  it("falls back to general_enquiries for unrecognised content", () => {
    expect(autoRouteSectionSlug("Hello there", "Just checking in")).toBe("general_enquiries");
  });
});

// ─── Message status transitions ───────────────────────────────────────────────

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  unread: ["read", "flagged", "archived", "actioned"],
  read: ["flagged", "archived", "actioned", "unread"],
  flagged: ["read", "archived", "actioned", "unread"],
  actioned: ["archived", "read"],
  archived: ["read"],
};

function canTransition(from: string, to: string): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

describe("CommHub message status transitions", () => {
  it("allows unread → read", () => expect(canTransition("unread", "read")).toBe(true));
  it("allows unread → flagged", () => expect(canTransition("unread", "flagged")).toBe(true));
  it("allows unread → actioned", () => expect(canTransition("unread", "actioned")).toBe(true));
  it("allows read → archived", () => expect(canTransition("read", "archived")).toBe(true));
  it("allows archived → read (unarchive)", () => expect(canTransition("archived", "read")).toBe(true));
  it("blocks archived → flagged directly", () => expect(canTransition("archived", "flagged")).toBe(false));
  it("blocks actioned → flagged directly", () => expect(canTransition("actioned", "flagged")).toBe(false));
});

// ─── Date formatting helper ───────────────────────────────────────────────────

function formatRelativeDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

describe("CommHub date formatting", () => {
  it("shows 'just now' for very recent messages", () => {
    const ts = new Date(Date.now() - 5000).toISOString();
    expect(formatRelativeDate(ts)).toBe("just now");
  });

  it("shows minutes for messages under 1 hour", () => {
    const ts = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    expect(formatRelativeDate(ts)).toBe("30m ago");
  });

  it("shows hours for messages under 24 hours", () => {
    const ts = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    expect(formatRelativeDate(ts)).toBe("3h ago");
  });
});
