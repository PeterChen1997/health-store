import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDocumentTypeBadge, getDocumentTypeLabel } from "./document-types";

describe("document type display helpers", () => {
  it("gives clinic notes and lab reports distinct labels and badge tones", () => {
    const clinicNote = getDocumentTypeBadge("clinic_note");
    const labReport = getDocumentTypeBadge("blood_test");

    assert.equal(clinicNote.label, "门诊病历");
    assert.equal(labReport.label, "化验单");
    assert.notEqual(clinicNote.className, labReport.className);
  });

  it("falls back to the raw document type when unknown", () => {
    assert.equal(getDocumentTypeLabel("custom_report"), "custom_report");
  });
});
