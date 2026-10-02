const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { loadLogs } = require("./load-logs");

const projectDir = path.resolve(__dirname, "..");

function createVp8xWebp(width = 1200, height = 1600) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

function assertInlineScriptsParse(html) {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(match[1])) continue;
    assert.doesNotThrow(() => new Function(match[2]));
  }
}

function fixture(t, files = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "math-study-log-test-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tempDir, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "build.js"), path.join(tempDir, "scripts/build.js"));
  fs.copyFileSync(path.join(__dirname, "load-logs.js"), path.join(tempDir, "scripts/load-logs.js"));

  for (const [file, contents] of Object.entries({
    "public/assets/cloud.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
    "public/images/kuumo/s1.png": "s1",
    "public/images/kuumo/s2.png": "s2",
    "public/images/kuumo/s3.png": "s3",
    "public/og-image.png": "og",
    ...files
  })) {
    const target = path.join(tempDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }

  return {
    run() {
      return spawnSync(process.execPath, [path.join(tempDir, "scripts/build.js")], {
        encoding: "utf8",
        env: { ...process.env, NODE_PATH: path.join(projectDir, "node_modules") }
      });
    },
    read(file) {
      return fs.readFileSync(path.join(tempDir, file), "utf8");
    },
    exists(file) {
      return fs.existsSync(path.join(tempDir, file));
    },
    loadLogs() {
      return loadLogs(path.join(tempDir, "logs"));
    }
  };
}

test("logs loader safely handles missing and empty input", (t) => {
  let build = fixture(t);
  assert.deepEqual(build.loadLogs(), []);
  let result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Daily logs\s+: 0/);

  build = fixture(t, { "logs/.gitkeep": "" });
  assert.deepEqual(build.loadLogs(), []);
  result = build.run();
  assert.equal(result.status, 0, result.stderr);
});

test("logs loader reads Markdown and sorts WebP pages numerically", (t) => {
  const webp = createVp8xWebp();
  const source = "# 2026-10-02\n\n数学III。極限。\n\n自由記載の本文。\n";
  const build = fixture(t, {
    "logs/2026/20261002/20261002.md": source,
    "logs/2026/20261002/20261002-10.webp": webp,
    "logs/2026/20261002/20261002-2.webp": webp,
    "logs/2026/20261002/20261002-1.webp": webp,
    "logs/2026/20261002/20261002-0.webp": webp,
    "logs/2026/20261002/other.webp": webp
  });
  const [log] = build.loadLogs();

  assert.equal(log.date, "2026-10-02");
  assert.equal(log.markdown, source);
  assert.deepEqual(log.images, ["20261002-1.webp", "20261002-2.webp", "20261002-10.webp"]);
  assert.equal(log.coverImage, "20261002-1.webp");
  assert.equal(log.pageCount, 3);
});

test("logs loader skips malformed dates and returns dates in ascending order", (t) => {
  const build = fixture(t, {
    "logs/2026/20261003/20261003.md": "third",
    "logs/2026/20261001/20261001.md": "first",
    "logs/2026/20260230/20260230.md": "invalid",
    "logs/2025/20261004/20261004.md": "wrong year",
    "logs/misc/20261005/20261005.md": "wrong parent"
  });

  assert.deepEqual(build.loadLogs().map((log) => log.dateKey), ["20261001", "20261003"]);
});

test("empty build keeps current branding and removes stale generated output", (t) => {
  const build = fixture(t, {
    "logs/.gitkeep": "",
    "public/records/old/index.html": "old",
    "public/log/index.html": "old",
    "public/session/index.html": "old",
    "public/daily/19990101/index.html": "old"
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/index.html");
  const sitemap = build.read("public/sitemap.xml");

  assert.match(page, /学習記録はまだありません。/);
  assert.match(page, /数学をひとつずつ学び直しながら、/);
  assert.match(page, /その日に勉強したノートや答案を、写真と短い記録で残しています。/);
  assert.match(page, /images\/kuumo\/s1\.png/);
  assert.match(page, /images\/kuumo\/s2\.png/);
  assert.match(page, /images\/kuumo\/s3\.png/);
  assert.match(page, /https:\/\/sakurak02\.github\.io\/some-clouds\//);
  assert.match(page, /googletagmanager\.com\/gtag\/js\?id=G-LTZZZFVRKP/);
  assert.match(page, /assets\/cloud\.svg/);
  assertInlineScriptsParse(page);
  assert.equal(build.exists("public/records"), false);
  assert.equal(build.exists("public/log"), false);
  assert.equal(build.exists("public/session"), false);
  assert.equal(build.exists("public/daily/19990101"), false);
  assert.equal(build.exists("public/daily/.gitkeep"), true);
  assert.doesNotMatch(sitemap, /math-study-log\/(?:daily|records|log|session)\//);
  assert.match(build.read("public/robots.txt"), /Sitemap: https:\/\/sakurak02\.github\.io\/math-study-log\/sitemap\.xml/);
});

test("build creates responsive latest cards, text archives, daily pages, and sitemap", (t) => {
  const webp = createVp8xWebp();
  const dateKeys = [
    ...Array.from({ length: 10 }, (_, index) => `202610${String(index + 1).padStart(2, "0")}`),
    ...Array.from({ length: 15 }, (_, index) => `202609${String(index + 1).padStart(2, "0")}`),
    ...Array.from({ length: 3 }, (_, index) => `202508${String(index + 1).padStart(2, "0")}`)
  ];
  const files = Object.fromEntries(dateKeys.map((dateKey) => [
    `logs/${dateKey.slice(0, 4)}/${dateKey}/${dateKey}.md`,
    `# ${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6)}\n\nLog ${dateKey}\n\n全文です。`
  ]));
  files["logs/2026/20261010/20261010-10.webp"] = webp;
  files["logs/2026/20261010/20261010-2.webp"] = webp;
  files["logs/2026/20261010/20261010-1.webp"] = webp;
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/index.html");
  const archiveStart = page.indexOf('id="daily-log-archive"');
  const latestHtml = page.slice(page.indexOf('id="daily-log-latest"'), archiveStart);
  const archiveHtml = page.slice(archiveStart, page.indexOf('<div class="guide-divider"', archiveStart));
  const expectedOrder = [...dateKeys].sort((a, b) => b.localeCompare(a));
  const latestKeys = [...latestHtml.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);
  const archiveKeys = [...archiveHtml.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);

  assert.deepEqual(latestKeys, expectedOrder.slice(0, 20));
  assert.deepEqual(archiveKeys, expectedOrder.slice(20));
  assert.equal(new Set([...latestKeys, ...archiveKeys]).size, dateKeys.length);
  assert.match(latestHtml, /class="daily-log-image"/);
  assert.doesNotMatch(archiveHtml, /class="daily-log-card"|class="daily-log-image"|class="daily-log-pages"|<img\b/);
  assert.match(archiveHtml, /data-archive-month="2026-09"[\s\S]*<summary>9月<\/summary>/);
  assert.match(archiveHtml, /data-archive-year="2025"[\s\S]*data-archive-month="2025-08"/);
  assert.match(page, /const latestCount = mobile\.matches \? 5 : tablet\.matches \? 12 : 20;/);
  assert.match(page, /@media \(max-width: 600px\)[\s\S]*\.daily-log-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assertInlineScriptsParse(page);

  const dailyPage = build.read("public/daily/20261010/index.html");
  const images = [...dailyPage.matchAll(/class="daily-sheet-image" src="\.\/images\/([^"]+)"/g)].map((match) => match[1]);
  const markdownSection = dailyPage.match(/<div class="daily-markdown-content">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.deepEqual(images, ["20261010-1.webp", "20261010-2.webp", "20261010-10.webp"]);
  assert.match(dailyPage, /<title>2026\.10\.10 \| 数学学習記録<\/title>/);
  assert.match(dailyPage, /← 学習記録へ戻る/);
  assert.match(dailyPage, /og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/daily\/20261010\/images\/20261010-1\.webp"/);
  assert.match(markdownSection, /<p>Log 20261010<\/p>[\s\S]*<p>全文です。<\/p>/);
  assert.doesNotMatch(markdownSection, /<h1>|2026-10-10/);
  assert.match(dailyPage, /href="\.\/images\/20261010-1\.webp" target="_blank"/);
  assert.match(dailyPage, /href="\.\.\/20261009\/">← 2026\.10\.09<\/a>/);
  assertInlineScriptsParse(dailyPage);

  const sitemap = build.read("public/sitemap.xml");
  assert.equal((sitemap.match(/<loc>/g) || []).length, dateKeys.length + 1);
  assert.match(sitemap, /\/daily\/20261010\//);
  assert.doesNotMatch(sitemap, /records|\/log\/|\/session\//);
});

test("runtime and dependencies contain only the new log system", () => {
  const source = fs.readFileSync(path.join(__dirname, "build.js"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  assert.doesNotMatch(source, /classification|createMonthCalendar|TableOfContents|ORIGINAL QUESTION|EXPLANATION|content[\\/]records/i);
  assert.deepEqual(Object.keys(packageJson.dependencies), ["markdown-it"]);
});
