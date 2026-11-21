import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(async () => ({ value: "EXPERIENCE\nSoftware Engineer, Acme Corp\nBuilt reliable systems." })),
  },
}));

import { parseResume } from "@/lib/resume-parse";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

async function makeDocxWithHeader(): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
      </Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="${REL_NS}">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships xmlns="${REL_NS}">
      <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
    </Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}">
      <w:body>
        ${paragraph("EXPERIENCE")}
        ${paragraph("Software Engineer, Acme Corp")}
        ${paragraph("Built reliable systems.")}
        <w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/></w:sectPr>
      </w:body>
    </w:document>`,
  );
  zip.file(
    "word/header1.xml",
    `<w:hdr xmlns:w="${WORD_NS}">
      ${paragraph("Ada Lovelace")}
      ${paragraph("ada@example.test | +1 (415) 555-0199")}
    </w:hdr>`,
  );

  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  const file = new File([bytes], "header-resume.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  // jsdom's File does not implement arrayBuffer(), while the browser File used by
  // the upload path does. Keep the fixture browser-shaped without changing production code.
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  return file;
}

describe("local DOCX resume parsing", () => {
  it("includes Word header contact details in the parsed bio", async () => {
    const parsed = await parseResume(await makeDocxWithHeader());

    expect(parsed.rawText).toContain("Ada Lovelace");
    expect(parsed.rawText).toContain("ada@example.test");
    expect(parsed.bio).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      phone: "+1 (415) 555-0199",
    });
    expect(parsed.rawText).toContain("Software Engineer, Acme Corp");
  });
});
