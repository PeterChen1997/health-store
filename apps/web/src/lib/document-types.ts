export type DocumentTypeBadge = {
  label: string;
  className: string;
};

export const DOCUMENT_TYPE_BADGE_BASE = "rounded-full px-2.5 py-1 text-xs font-semibold";

const DOCUMENT_TYPE_BADGES: Record<string, DocumentTypeBadge> = {
  blood_test: {
    label: "化验单",
    className:
      "border border-[rgba(78,142,106,0.18)] bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]",
  },
  physical: {
    label: "体检报告",
    className: "border border-[rgba(72,132,91,0.18)] bg-[#e7f0e8] text-[var(--hs-success)]",
  },
  imaging: {
    label: "影像报告",
    className: "border border-[rgba(110,101,147,0.18)] bg-[var(--hs-purple-soft)] text-[var(--hs-purple)]",
  },
  clinic_note: {
    label: "门诊病历",
    className:
      "border border-[rgba(138,104,32,0.18)] bg-[var(--hs-warning-soft)] text-[var(--hs-warning)]",
  },
  other: {
    label: "其他",
    className: "border border-[var(--hs-border)] bg-[var(--hs-bg-muted)] text-[var(--hs-muted)]",
  },
};

export function getDocumentTypeBadge(documentType: string): DocumentTypeBadge {
  return DOCUMENT_TYPE_BADGES[documentType] ?? {
    label: documentType,
    className: DOCUMENT_TYPE_BADGES.other.className,
  };
}

export function getDocumentTypeLabel(documentType: string) {
  return getDocumentTypeBadge(documentType).label;
}
