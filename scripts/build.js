const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "dist");
const files = ["index.html", "questionBank.js", "core.js", "app.js", "styles.css", "manifest.webmanifest", "wen logo.png", "QR 碼.png"];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(out, file));
}

console.log(`Built ${files.length} files to dist`);
