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

function fixture(t, files) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "math-study-log-test-"));
  t.after(() => {
    assert.equal(path.dirname(tempDir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tempDir).startsWith("math-study-log-test-"));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  for (const dir of ["scripts", "public/log", "public/session"]) {
    fs.mkdirSync(path.join(tempDir, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(__dirname, "build.js"), path.join(tempDir, "scripts/build.js"));
  fs.copyFileSync(path.join(__dirname, "load-logs.js"), path.join(tempDir, "scripts/load-logs.js"));
  fs.mkdirSync(path.join(tempDir, "content"), { recursive: true });
  fs.copyFileSync(
    path.join(projectDir, "content/classification-master.json"),
    path.join(tempDir, "content/classification-master.json")
  );
  for (const [file, contents] of Object.entries(files)) {
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

function recordFiles(date = "20260828", sequence = "001", overrides = {}) {
  const dir = `content/records/${date}/${sequence}`;
  const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
  const classification = "<!--\nsubject: 数学III\ncategory: 極限\nsubcategory: 数列の極限\n-->\n\n";
  return {
    [`${dir}/session.md`]: `${classification}# Session title ${sequence}\n\nSession text.`,
    [`${dir}/question.md`]: `${classification}# オリジナル問題\n\nQuestion text.\n\n<details>\n<summary>ヒント</summary>\n\nHint text.\n\n</details>`,
    [`${dir}/answer.md`]: `${classification}# 解説\n\n## EXPLANATION\n\nExplanation text with $E=mc^2$.\n\n## MODEL ANSWER\n\nAnswer text.`,
    [`${dir}/meta.json`]: JSON.stringify({
      studyId: `${date}-${sequence}`,
      date: isoDate,
      sequence,
      title: `Article ${sequence}`,
      subject: "数学III",
      category: "極限",
      topic: "数列の極限"
    }),
    [`${dir}/images/${date}-${sequence}-1.webp`]: createVp8xWebp(),
    ...overrides
  };
}

function classifiedRecordFiles(subject, category, topic) {
  const files = recordFiles();
  const classification = `<!--\nsubject: ${subject}\ncategory: ${category}\nsubcategory: ${topic}\n-->\n\n`;

  for (const name of ["session.md", "question.md", "answer.md"]) {
    const file = `content/records/20260828/001/${name}`;
    files[file] = files[file].replace(/^<!--[\s\S]*?-->\n\n/, classification);
  }

  const metaFile = "content/records/20260828/001/meta.json";
  const meta = JSON.parse(files[metaFile]);
  files[metaFile] = JSON.stringify({ ...meta, subject, category, topic });
  return files;
}

test("new logs loader safely handles a missing or empty logs directory", (t) => {
  let build = fixture(t, {});
  assert.deepEqual(build.loadLogs(), []);
  let result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /New logs\s+: 0/);

  build = fixture(t, { "logs/.gitkeep": "" });
  assert.deepEqual(build.loadLogs(), []);
  result = build.run();
  assert.equal(result.status, 0, result.stderr);
});

test("new logs loader reads markdown-only days without front matter", (t) => {
  const source = "# 2026-10-02\n\n数学III。極限。\n\n新しい学習記録方式のテスト。\n";
  const build = fixture(t, {
    "logs/2026/20261002/20261002.md": source
  });
  const logs = build.loadLogs();

  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], {
    date: "2026-10-02",
    dateKey: "20261002",
    markdown: source,
    markdownHtml: "<h1>2026-10-02</h1>\n<p>数学III。極限。</p>\n<p>新しい学習記録方式のテスト。</p>\n",
    images: [],
    coverImage: null,
    pageCount: 0
  });

  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /New logs\s+: 1/);
});

test("new logs loader sorts WebP page numbers numerically and exposes the cover", (t) => {
  const webp = createVp8xWebp();
  const build = fixture(t, {
    "logs/2026/20261002/20261002-10.webp": webp,
    "logs/2026/20261002/20261002-2.webp": webp,
    "logs/2026/20261002/20261002-1.webp": webp,
    "logs/2026/20261002/20261002-0.webp": webp,
    "logs/2026/20261002/unrelated.webp": webp
  });
  const [log] = build.loadLogs();

  assert.deepEqual(log.images, [
    "20261002-1.webp",
    "20261002-2.webp",
    "20261002-10.webp"
  ]);
  assert.equal(log.coverImage, "20261002-1.webp");
  assert.equal(log.pageCount, 3);
});

test("new logs loader skips malformed dates and only scans the matching year", (t) => {
  const webp = createVp8xWebp();
  const build = fixture(t, {
    "logs/2026/20261003/20261003-2.webp": webp,
    "logs/2026/20260230/20260230.md": "invalid date",
    "logs/2025/20261004/20261004.md": "wrong year",
    "logs/misc/20261005/20261005.md": "wrong parent",
    "logs/2026/not-a-date/note.md": "wrong name"
  });
  const logs = build.loadLogs();

  assert.equal(logs.length, 1);
  assert.equal(logs[0].dateKey, "20261003");
  assert.deepEqual(logs[0].images, ["20261003-2.webp"]);
  assert.equal(logs[0].coverImage, null);
  assert.equal(logs[0].pageCount, 1);
});

test("new-format article renders QUESTION, ANSWER, LOG, and SESSION in order", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  const headings = ["question-heading", "answer-heading", "log-heading", "session-heading"]
    .map((id) => page.indexOf(`id="${id}"`));
  assert.ok(headings.every((index) => index >= 0));
  assert.deepEqual(headings, [...headings].sort((a, b) => a - b));
  assert.match(page, /id="question-heading">ORIGINAL QUESTION　by ChatGPT<\/h2>/);
  assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="https:\/\/sakurak02\.github\.io\/math-study-log\/assets\/cloud\.svg">/);
  assert.match(page, /<summary>ヒント<\/summary>/);
  assert.match(page, /<h2 class="section-heading" id="answer-heading">ANSWER<\/h2>/);
  assert.match(page, /<details class="answer-details"><summary>ANSWERを開く<\/summary><article class="session-content">/);
  assert.doesNotMatch(page, /<details class="answer-details"\s+open/);
  assert.match(page, /<h2>EXPLANATION<\/h2>[\s\S]*<h2>MODEL ANSWER<\/h2>/);
  assert.match(page, /\$E=mc\^2\$/);
  assert.ok(page.indexOf("id=\"question-heading\"") < page.indexOf("id=\"answer-heading\""));
  assert.ok(page.indexOf("id=\"answer-heading\"") < page.indexOf("id=\"log-heading\""));
  assert.ok(page.indexOf("id=\"log-heading\"") < page.indexOf("id=\"session-heading\""));
  assert.doesNotMatch(page, /<h1>オリジナル問題<\/h1>|<h1>解説<\/h1>/);
});

test("homepage adds MY GOAL before the unchanged ABOUT THIS STUDY section", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/index.html");
  const goal = page.indexOf('<div class="about-kicker">MY GOAL</div>');
  const about = page.indexOf('<div class="about-kicker">ABOUT THIS STUDY</div>');
  assert.ok(goal >= 0 && about > goal);
  assert.match(page, /<div class="about-title">64歳から、数学を学びなおしたい<\/div>/);
  assert.match(page, /<div class="about-title">このサイトについて<\/div>/);
  assert.match(page, /<div class="about-start">STARTED AUGUST 2026<\/div>/);
  assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="https:\/\/sakurak02\.github\.io\/math-study-log\/assets\/cloud\.svg">/);
  assert.match(page, /<div class="header-guide-wrap">[\s\S]*<span class="header-guide-copy">クーモとまなぶ<\/span>[\s\S]*class="header-guide" src="\.\/images\/kuumo\/s1\.png"[\s\S]*<\/div>/);
  assert.match(page, /class="divider-guide" src="\.\/images\/kuumo\/s2\.png"/);
  assert.match(page, /<figure class="about-guide">[\s\S]*class="about-guide-image" src="\.\/images\/kuumo\/s3\.png"[\s\S]*<figcaption class="about-guide-caption">some clouds からちぎれて生まれた、学びの案内役クーモ。<\/figcaption>[\s\S]*<\/figure>/);
  assert.match(page, /<section class="topic-entry" aria-labelledby="topic-entry-title">/);
  assert.match(page, /<h2 class="topic-entry-title" id="topic-entry-title">分野から見る<\/h2>/);
  assert.match(page, /<p class="topic-entry-description">数学I・A・II・B・III・Cをテーマ別に探す<\/p>/);
  assert.match(page, /<button class="topic-toc-button toc-toggle"[^>]*>目次<\/button>/);
  assert.doesNotMatch(page, /<nav class="entry-nav"|href="\.\/(?:log|session|question)\/index\.html"/);
  assert.equal(build.exists("public/log/index.html"), true);
  assert.equal(build.exists("public/session/index.html"), true);
  assert.equal(build.exists("public/question/index.html"), false);
  assert.match(page, /@media \(max-width: 820px\)[\s\S]*\.about-with-guide/);
  assert.match(page, /\.header-guide-wrap \{[^}]*display: flex;[^}]*align-items: center;[^}]*\}/);
  assert.match(page, /\.about-with-guide \{[^}]*overflow: visible;[^}]*\}/);
  assert.match(page, /\.about-guide-caption \{[^}]*max-width: 100%;[^}]*overflow: visible;[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;[^}]*\}/);
  assert.match(page, /@media \(max-width: 600px\)[\s\S]*\.header-guide-wrap[\s\S]*\.header-guide[\s\S]*\.guide-divider[\s\S]*\.about-guide/);
  assert.match(page, /@media \(max-width: 600px\)[\s\S]*\.about-guide \{\s*position: static;\s*width: min\(240px, 82%\);\s*margin: 22px auto 0;/);
  assert.doesNotMatch(page, /padding-bottom: 76px/);
});

test("homepage renders new daily log cards with published cover images", (t) => {
  const webp = createVp8xWebp();
  const build = fixture(t, {
    ...recordFiles(),
    "logs/2026/20261002/20261002.md": "# 2026-10-02\n\n数学III。極限。\n\n新しい学習記録方式のテスト。",
    "logs/2026/20261002/20261002-1.webp": webp,
    "logs/2026/20261002/20261002-2.webp": webp,
    "logs/2026/20261002/20261002-10.webp": webp,
    "logs/2026/20261003/20261003.md": "# 2026-10-03\n\n**翌日**の記録。",
    "logs/2026/20261003/20261003-1.webp": webp
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);

  const page = build.read("public/index.html");
  const cards = [...page.matchAll(/<article class="daily-log-card"[^>]*>([\s\S]*?)<\/article>/g)]
    .map((match) => match[1]);

  assert.equal(cards.length, 2);
  assert.match(page, /<div class="daily-log-kicker">LEARNING LOG<\/div>/);
  assert.match(page, /<h2 id="daily-log-title">学習記録<\/h2>/);
  assert.ok(page.indexOf("2026.10.03") < page.indexOf("2026.10.02"));
  assert.match(cards[1], /src="\.\/daily\/20261002\/images\/20261002-1\.webp"/);
  assert.match(cards[1], /<time[^>]*>2026\.10\.02<\/time>/);
  assert.match(cards[1], /<p class="daily-log-excerpt">数学III。極限。 新しい学習記録方式のテスト。<\/p>/);
  assert.doesNotMatch(cards[1], /<h1>|# 2026-10-02|<a\b/);
  assert.match(cards[1], /<div class="daily-log-pages">3 pages<\/div>/);
  assert.match(cards[0], /<div class="daily-log-pages">1 page<\/div>/);
  assert.equal(build.exists("public/daily/20261002/images/20261002-1.webp"), true);
  assert.equal(build.exists("public/daily/20261002/images/20261002-2.webp"), true);
  assert.equal(build.exists("public/daily/20261002/images/20261002-10.webp"), true);
  assert.match(page, /\.daily-log-media \{[\s\S]*?aspect-ratio: 1 \/ 1;/);
  assert.match(page, /\.daily-log-image \{[\s\S]*?object-fit: cover;[\s\S]*?object-position: top;/);
  assert.match(page, /\.daily-log-excerpt \{[\s\S]*?min-height: calc\(1\.55em \* 2\);[\s\S]*?-webkit-line-clamp: 2;/);
  assert.match(page, /\.daily-log-grid \{[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
  assert.match(page, /@media \(max-width: 900px\)[\s\S]*?\.daily-log-grid \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(page, /@media \(max-width: 820px\)[\s\S]*?\.daily-log-grid \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(page, /@media \(max-width: 700px\)[\s\S]*?\.daily-log-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(page, /@media \(max-width: 600px\)[\s\S]*?\.daily-log-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
});

test("daily logs use responsive latest limits and non-duplicated year-month archives", (t) => {
  const dateKeys = [
    ...Array.from({ length: 10 }, (_, index) => `202610${String(index + 1).padStart(2, "0")}`),
    ...Array.from({ length: 15 }, (_, index) => `202609${String(index + 1).padStart(2, "0")}`),
    ...Array.from({ length: 3 }, (_, index) => `202508${String(index + 1).padStart(2, "0")}`)
  ];
  const files = Object.fromEntries(
    dateKeys.map((dateKey) => [
      `logs/${dateKey.slice(0, 4)}/${dateKey}/${dateKey}.md`,
      `# ${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6)}\n\nLog ${dateKey}`
    ])
  );
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);

  const page = build.read("public/index.html");
  const latestStart = page.indexOf('id="daily-log-latest"');
  const archiveStart = page.indexOf('id="daily-log-archive"');
  const latestHtml = page.slice(latestStart, archiveStart);
  const archiveHtml = page.slice(
    archiveStart,
    page.indexOf('<div class="section-divider guide-divider"', archiveStart)
  );
  const latestKeys = [...latestHtml.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);
  const archiveKeys = [...archiveHtml.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);
  const expectedOrder = [...dateKeys].sort((a, b) => b.localeCompare(a));

  assert.deepEqual(latestKeys, expectedOrder.slice(0, 20));
  assert.deepEqual(archiveKeys, expectedOrder.slice(20));
  assert.equal(new Set([...latestKeys, ...archiveKeys]).size, dateKeys.length);
  assert.doesNotMatch(archiveHtml, /data-archive-month="2026-10"/);
  assert.match(archiveHtml, /<h3>2026<\/h3>[\s\S]*data-archive-month="2026-09"[\s\S]*<summary>9月<\/summary>/);
  assert.match(archiveHtml, /<h3>2025<\/h3>[\s\S]*data-archive-month="2025-08"[\s\S]*<summary>8月<\/summary>/);
  assert.ok(archiveHtml.indexOf("<h3>2026</h3>") < archiveHtml.indexOf("<h3>2025</h3>"));
  assert.match(page, /const latestCount = mobileLogs\.matches \? 5 : tabletLogs\.matches \? 12 : 20;/);
  assert.match(page, /latestGrid\.replaceChildren\(\.\.\.latestCards\)/);
  assert.match(page, /archive\.hidden = archivedCards\.length === 0;/);
  assert.doesNotMatch(page, /<div class="calendar-grid">|class="day-cell/);

  const buildSource = fs.readFileSync(path.join(__dirname, "build.js"), "utf8");
  assert.match(buildSource, /function createMonthCalendar\(/);
  assert.match(buildSource, /function createCalendarSections\(/);
  assert.match(buildSource, /\.calendar-grid \{/);
  assert.match(buildSource, /\.day-detail-toggle/);
});

test("one LOG is displayed directly without more", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  assert.equal((page.match(/class="sheet"/g) || []).length, 1);
  assert.doesNotMatch(page, /<details class="more-logs">/);
});

test("multiple LOGs keep numeric order and fold pages after the first under more", (t) => {
  const files = recordFiles();
  const dir = "content/records/20260828/001/images";
  files[`${dir}/20260828-001-10.webp`] = createVp8xWebp();
  files[`${dir}/20260828-001-2.webp`] = createVp8xWebp();
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  const sources = [...page.matchAll(/class="sheet" src="\.\/images\/([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sources, ["20260828-001-1.webp", "20260828-001-2.webp", "20260828-001-10.webp"]);
  assert.match(page, /<details class="more-logs">\s*<summary>more<\/summary>/);
  assert.ok(page.indexOf("20260828-001-1.webp") < page.indexOf('<details class="more-logs">'));
});

test("same-day 001 and 002 remain independent while the top calendar stays hidden", (t) => {
  const build = fixture(t, { ...recordFiles("20260829", "001"), ...recordFiles("20260829", "002") });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(build.exists("public/records/20260829/001/index.html"), true);
  assert.equal(build.exists("public/records/20260829/002/index.html"), true);
  const index = build.read("public/index.html");
  assert.match(index, /href="\.\/records\/20260829\/001\/"/);
  assert.match(index, /href="\.\/records\/20260829\/002\/"/);
  assert.doesNotMatch(index, /<div class="calendar-grid">|class="day-cell/);
  assert.equal((index.match(/<h4>数列の極限<\/h4>/g) || []).length, 1);
});

test("table of contents keeps four levels and sorts articles newest first", (t) => {
  const build = fixture(t, {
    ...recordFiles("20260828", "001"),
    ...recordFiles("20260829", "001"),
    ...recordFiles("20260829", "002")
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/index.html");
  const toc = page.match(/<section class="toc-section"[\s\S]*?(?=\n\n  <div class="section-divider"><\/div>)/)?.[0] || "";
  const subject = toc.indexOf("<summary>数学III</summary>");
  const category = toc.indexOf("<h3>極限</h3>");
  const topic = toc.indexOf("<h4>数列の極限</h4>");
  assert.ok(subject >= 0 && category > subject && topic > category);
  assert.equal((toc.match(/<h4>数列の極限<\/h4>/g) || []).length, 1);
  assert.match(toc, /<details class="toc-subject">/);
  assert.doesNotMatch(toc, /<h3>微分法<\/h3>|<h3>積分法<\/h3>/);

  const newestSecond = toc.indexOf('href="./records/20260829/002/"');
  const newestFirst = toc.indexOf('href="./records/20260829/001/"');
  const oldest = toc.indexOf('href="./records/20260828/001/"');
  assert.ok(newestSecond > topic && newestFirst > newestSecond && oldest > newestFirst);
  assert.match(toc, /<time datetime="2026-08-29">2026\/08\/29<\/time>/);
});

test("registered topic in a category with topics builds successfully", (t) => {
  const build = fixture(t, classifiedRecordFiles("数学III", "極限", "関数の極限"));
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(build.exists("public/records/20260828/001/index.html"), true);
});

test("unregistered topic in a category with topics fails the build", (t) => {
  const build = fixture(t, classifiedRecordFiles("数学III", "極限", "無限等比数列"));
  const result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /分類マスターにない小分類です:\s*数学III → 極限 → 無限等比数列/
  );
});

test("topic remains free-form when its category has no topics", (t) => {
  const build = fixture(t, classifiedRecordFiles("数学B", "数学と社会生活", "任意の既存小分類"));
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/index.html");
  assert.match(page, /<summary>数学B<\/summary>[\s\S]*<h3>数学と社会生活<\/h3>[\s\S]*<h4>任意の既存小分類<\/h4>/);
});

test("existing subject and category validation still rejects unknown values", (t) => {
  let build = fixture(t, classifiedRecordFiles("数学X", "極限", "数列の極限"));
  let result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /分類マスターにない科目です: 数学X/);

  build = fixture(t, classifiedRecordFiles("数学III", "未登録分野", "数列の極限"));
  result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /分類マスターにない中分類です: 数学III → 未登録分野/);
});

test("legacy standalone QUESTION output is removed while article QUESTION remains", (t) => {
  const build = fixture(t, {
    ...recordFiles(),
    "public/question/index.html": "stale QUESTION index",
    "public/question/legacy.html": "stale QUESTION article"
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(build.exists("public/question/index.html"), false);
  assert.equal(build.exists("public/question/legacy.html"), false);
  const article = build.read("public/records/20260828/001/index.html");
  assert.match(article, /id="question-heading">ORIGINAL QUESTION　by ChatGPT<\/h2>/);
  assert.match(article, /Question text\./);
  const sitemap = build.read("public/sitemap.xml");
  assert.doesNotMatch(sitemap, /\/question(?:\/|\.html)/);
  assert.match(sitemap, /\/records\/20260828\/001\/index\.html/);
});

test("LOG and SESSION archive pages retain their focused views", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const log = build.read("public/records/20260828/001/log.html");
  const session = build.read("public/records/20260828/001/session.html");
  assert.match(log, /id="log-heading"/);
  assert.doesNotMatch(log, /id="session-heading"|id="question-heading"|id="answer-heading"/);
  assert.match(session, /id="session-heading"/);
  assert.doesNotMatch(session, /id="log-heading"|id="question-heading"|id="answer-heading"/);
});

test("new image naming is enforced and page one is required", (t) => {
  const oldName = recordFiles();
  delete oldName["content/records/20260828/001/images/20260828-001-1.webp"];
  oldName["content/records/20260828/001/images/20260828-001r-1.webp"] = createVp8xWebp();
  let build = fixture(t, oldName);
  let result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の命名形式が不正/);

  const missingFirst = recordFiles();
  delete missingFirst["content/records/20260828/001/images/20260828-001-1.webp"];
  missingFirst["content/records/20260828/001/images/20260828-001-2.webp"] = createVp8xWebp();
  build = fixture(t, missingFirst);
  result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の1ページ目がありません/);
});

test("session and question are required", (t) => {
  for (const name of ["session.md", "question.md"]) {
    const files = recordFiles();
    delete files[`content/records/20260828/001/${name}`];
    const build = fixture(t, files);
    const result = build.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`新形式の必須ファイルがありません: ${name.replace(".", "\\.")}`));
  }
});

test("article without answer.md renders QUESTION, LOG, and SESSION without an ANSWER section", (t) => {
  const files = recordFiles();
  delete files["content/records/20260828/001/answer.md"];
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  const headings = ["question-heading", "log-heading", "session-heading"]
    .map((id) => page.indexOf(`id="${id}"`));
  assert.ok(headings.every((index) => index >= 0));
  assert.deepEqual(headings, [...headings].sort((a, b) => a - b));
  assert.doesNotMatch(page, /id="answer-heading"|class="answer-details"|ANSWERを開く/);
});

test("conflicting classifications across the three documents fail the build", (t) => {
  const files = recordFiles();
  files["content/records/20260828/001/question.md"] = "<!--\nsubject: 数学B\ncategory: 数列\nsubcategory: 種々の漸化式\n-->\n\n# Question";
  const build = fixture(t, files);
  const result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /同じ学習記録内のSESSION分類が一致しません/);
});

test("responsive article CSS stays single-column without horizontal layout", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  assert.match(page, /\.study-flow \{ display: grid; gap: 28px; \}/);
  assert.doesNotMatch(page, /grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(0, 1fr\)/);
  assert.match(page, /@media \(max-width: 900px\)[\s\S]*\.study-section \{ padding: 14px; \}/);
  assert.match(page, /\.sheet \{[^}]*width: 100%;[^}]*height: auto;/);
});
