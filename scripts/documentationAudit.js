const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const required = [
  'docs/user-guide.md',
  'docs/mvp-requirement-traceability.md',
  'docs/release-readiness-audit.md',
  'docs/release-notes-v0.1.0.md',
  'docs/security-threat-model.md',
  'docs/architecture/adr-0002-mvp-platform-packaging-and-update-policy.md'
];
const failures = [];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`missing required document: ${relative}`);
}

const markdownFiles = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') visit(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(full);
  }
}
visit(root);

for (const file of markdownFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) failures.push(`broken local link in ${path.relative(root, file)}: ${target}`);
  }
}

if (failures.length) {
  console.error('Documentation audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Documentation audit passed (${markdownFiles.length} Markdown files checked).`);
}
