// Regression for DOCX contact details stored in a Word page header.
const JSZip = require("jszip");
const { makeWindow, load } = require("./harness");

let pass = 0, fail = 0;
const fails = [];
function ok(name, condition, extra) {
  if (condition) pass++;
  else fails.push(name + (extra ? "  ->  " + extra : "")), fail++;
}

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const paragraph = (text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

async function makeDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  </Types>`);
  zip.file("_rels/.rels", `<Relationships xmlns="${REL_NS}">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  </Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<Relationships xmlns="${REL_NS}">
    <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  </Relationships>`);
  zip.file("word/document.xml", `<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}"><w:body>
    ${paragraph("EXPERIENCE")}${paragraph("Software Engineer, Acme Corp")}
    <w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/></w:sectPr>
  </w:body></w:document>`);
  zip.file("word/header1.xml", `<w:hdr xmlns:w="${WORD_NS}">
    ${paragraph("Ada Lovelace")}${paragraph("ada@example.test | +1 (415) 555-0199")}
  </w:hdr>`);
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function run() {
  const w = makeWindow();
  load(w, "src/lib/parser-core.js");
  w.JSZip = JSZip;
  w.mammoth = { extractRawText: async () => ({ value: "EXPERIENCE\nSoftware Engineer, Acme Corp" }) };
  load(w, "src/lib/parser.js");

  const bytes = await makeDocx();
  const file = new w.File([bytes], "header-resume.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes });
  const parsed = await w.JAF.parser.parse(file, {});
  const text = parsed.__rawText || "";
  const bio = w.JAF.parser.parseBio(text);
  ok("extension: header name reaches raw text", text.includes("Ada Lovelace"), text);
  ok("extension: header email reaches bio", bio.email === "ada@example.test", JSON.stringify(bio));
  ok("extension: header phone reaches bio", bio.phone === "+1 (415) 555-0199", JSON.stringify(bio));
  ok("extension: body text remains present", text.includes("Software Engineer, Acme Corp"), text);
}

run().then(() => {
  console.log(`\n[parser-docx] ${pass} passed, ${fail} failed`);
  if (fails.length) { fails.forEach((f) => console.log("  x " + f)); process.exit(1); }
  console.log("[parser-docx] All green.");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
