const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const jsFiles = ["questionBank.js", "core.js", "app.js", "scripts/build.js", "scripts/lint.js", "scripts/test.js", "scripts/browser-smoke.js"];
const forbidden = [
  "WenMind Coach Console",
  "育林國中",
  "育林國中跆拳道隊",
  "團隊儀表板",
  "選手名單按鈕",
  "個人心理報告按鈕",
  "全隊分析按鈕",
  "焦慮症",
  "憂鬱症",
  "確診",
  "罹患"
];

for (const file of jsFiles) {
  childProcess.execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
}

for (const file of ["index.html", "core.js", "app.js", "styles.css", "README.md"]) {
  const text = fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";
  for (const term of forbidden) {
    if (text.includes(term)) throw new Error(`${file} contains forbidden term: ${term}`);
  }
}

console.log("Lint passed");
