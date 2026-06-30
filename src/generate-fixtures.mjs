import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outDir = path.resolve("fixtures/generated");

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
    "SYNTHETIC DLP TEST CONTENT - NOT REAL DATA",
    "",
    "Fake person: Morgan Example",
    "Fake email: morgan.example@example.invalid",
    "Fake SSN-like value: 123-45-6789",
    "Common test credit card number: 4111111111111111",
    "Fake API token shape: sk-test-00000000000000000000000000000000",
    "Fake AWS key shape: AKIA0000000000000000",
    "",
    "Purpose: trigger inspection rules in a controlled lab without using live secrets or regulated records."
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
