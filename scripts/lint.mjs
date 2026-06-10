import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = globSync("{src,tests,scripts}/**/*.{ts,mjs}", { cwd: root });
const failures = [];

for (const file of files) {
  const fullPath = path.join(root, file);
  const text = readFileSync(fullPath, "utf8");
  if (/\t/.test(text)) failures.push(`${file}: contains tabs`);
  if (/[ \t]$/m.test(text)) failures.push(`${file}: contains trailing whitespace`);
  if (!text.endsWith("\n")) failures.push(`${file}: missing final newline`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Lint passed for ${files.length} files.`);
