import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("fixtures/generated");

const pciLines = [
  "SYNTHETIC PCI DLP TEST CONTENT - NOT REAL PAYMENT DATA",
  "",
  "Avery Example,4111111111111111,12/29,123",
  "Blake Example,5555555555554444,11/28,456",
  "Casey Example,378282246310005,10/27,7890",
  "Drew Example,6011111111111117,09/26,234",
  "Emery Example,3530111333300000,08/30,567"
];

const medicalLines = [
  "SYNTHETIC MEDICAL DLP TEST CONTENT - NOT A REAL PATIENT",
  "",
  "Patient: Taylor Example",
  "DOB: 04/17/1979",
  "MRN: MED-482913",
  "Encounter: urgent care visit for chest pain and shortness of breath",
  "Diagnosis: hypertension, Type 2 diabetes, possible atrial fibrillation",
  "Medication list: metformin 500 mg, lisinopril 10 mg, atorvastatin 20 mg",
  "Lab result: HbA1c 8.2%, LDL 146 mg/dL",
  "Insurance member ID: HLT-77881234"
];

const files = {
  "ai-policy-note.txt": [
    "Synthetic test fixture for browser upload and DLP inspection.",
    "Topic: enterprise AI usage policy.",
    "",
    "Employees should avoid pasting customer records, private keys, passwords, source code secrets, or regulated data into public AI tools.",
    "Use approved tools, test tenants, and clearly labeled synthetic examples."
  ].join("\n"),
  "embedded-ai-requirements.md": [
    "# Embedded AI Requirements",
    "",
    "- Device: industrial gateway",
    "- Model: small anomaly detector",
    "- Input: temperature, vibration, acoustic signal",
    "- Latency target: under 200 ms",
    "- Connectivity: intermittent",
    "",
    "This file contains no real customer data."
  ].join("\n"),
  "synthetic-dlp-samples.txt": [
    ...pciLines,
    "",
    "Fake SSN-like value: 123-45-6789",
    "Fake API token shape: sk-test-00000000000000000000000000000000",
    "Fake AWS key shape: AKIA0000000000000000",
    "",
    "Purpose: trigger inspection rules in a controlled lab without using live secrets or regulated records."
  ].join("\n"),
  "synthetic-pci-cards.csv": [
    "name,card_number,expiry,cvv",
    "Avery Example,4111111111111111,12/29,123",
    "Blake Example,5555555555554444,11/28,456",
    "Casey Example,378282246310005,10/27,7890",
    "Drew Example,6011111111111117,09/26,234",
    "Emery Example,3530111333300000,08/30,567"
  ].join("\n"),
  "synthetic-payment-cards.json": JSON.stringify({
    notice: "SYNTHETIC PCI DLP TEST CONTENT - NOT REAL PAYMENT DATA",
    records: [
      { name: "Avery Example", card_number: "4111111111111111", expiry: "12/29", cvv: "123" },
      { name: "Blake Example", card_number: "5555555555554444", expiry: "11/28", cvv: "456" },
      { name: "Casey Example", card_number: "378282246310005", expiry: "10/27", cvv: "7890" },
      { name: "Drew Example", card_number: "6011111111111117", expiry: "09/26", cvv: "234" },
      { name: "Emery Example", card_number: "3530111333300000", expiry: "08/30", cvv: "567" }
    ]
  }, null, 2),
  "synthetic-pci-cards.rtf": toRtf(pciLines),
  "synthetic-pci-cards.doc": toRtf(pciLines),
  "synthetic-pci-cards.pdf": toSimplePdf("Synthetic PCI DLP Test", pciLines),
  "synthetic-medical-record.txt": [...medicalLines, "", "Purpose: synthetic lab fixture for medical DLP inspection."].join("\n"),
  "synthetic-medical-record.rtf": toRtf(medicalLines),
  "synthetic-medical-record.doc": toRtf(medicalLines),
  "synthetic-medical-record.pdf": toSimplePdf("Synthetic Medical DLP Test", medicalLines),
  "synthetic-medical-record.html": [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\"><title>Synthetic Medical DLP Test</title></head><body>",
    "<h1>Synthetic Medical DLP Test - Not A Real Patient</h1>",
    ...medicalLines.slice(2).map((line) => `<p>${escapeHtml(line)}</p>`),
    "</body></html>"
  ].join("\n"),
  "synthetic-medical-record.xml": [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<syntheticMedicalRecord>",
    "  <notice>NOT A REAL PATIENT</notice>",
    "  <patient>Taylor Example</patient>",
    "  <dob>04/17/1979</dob>",
    "  <mrn>MED-482913</mrn>",
    "  <diagnosis>hypertension; Type 2 diabetes; possible atrial fibrillation</diagnosis>",
    "  <medication>metformin 500 mg; lisinopril 10 mg; atorvastatin 20 mg</medication>",
    "  <lab>HbA1c 8.2%; LDL 146 mg/dL</lab>",
    "  <insuranceMemberId>HLT-77881234</insuranceMemberId>",
    "</syntheticMedicalRecord>"
  ].join("\n"),
  "sample-ai-metrics.csv": [
    "date,tool,category,interactions,uploads,downloads",
    "2026-06-01,chatbot,genai,14,1,0",
    "2026-06-02,copilot,embedded-ai,9,0,1",
    "2026-06-03,assistant,business,22,2,1"
  ].join("\n")
};

await mkdir(outDir, { recursive: true });

for (const [name, body] of Object.entries(files)) {
  await writeFile(path.join(outDir, name), `${body}\n`, "utf8");
  console.log(`wrote ${path.join(outDir, name)}`);
}

function toRtf(lines) {
  const body = lines
    .map((line) => line.replace(/[\\{}]/g, "\\$&"))
    .join("\\line\n");
  return `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Arial;}}\n\\f0\\fs22\n${body}\n}`;
}

function toSimplePdf(title, lines) {
  const textLines = [title, ...lines].slice(0, 24);
  const content = textLines
    .map((line, index) => `BT /F1 10 Tf 50 ${760 - index * 24} Td (${escapePdf(line)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function escapePdf(value) {
  return String(value).replace(/[\\()]/g, "\\$&").slice(0, 120);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
