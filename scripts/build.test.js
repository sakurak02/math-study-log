const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const vm = require("node:vm");
const { loadLogs } = require("./load-logs");

const projectDir = path.resolve(__dirname, "..");

function markdownPathForDate(dateKey) {
  const year = dateKey.slice(0, 4);
  const month = dateKey.slice(4, 6);
  const day = dateKey.slice(6, 8);
  return `logs/${year}/${month}/${day}/${dateKey}.md`;
}

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
    write(file, contents) {
      fs.writeFileSync(path.join(tempDir, file), contents);
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

test("logs loader derives the date from year, month and day and sorts WebP pages numerically", (t) => {
  const webp = createVp8xWebp();
  const source = "# 2026-10-02\n\n数学III。極限。\n\n自由記載の本文。\n";
  const build = fixture(t, {
    "logs/2026/10/02/20261002.md": source,
    "logs/2026/10/02/20261002-10.webp": webp,
    "logs/2026/10/02/20261002-2.webp": webp,
    "logs/2026/10/02/20261002-1.webp": webp,
    "logs/2026/10/02/20261002-0.webp": webp,
    "logs/2026/10/02/other.webp": webp
  });
  const [log] = build.loadLogs();

  assert.equal(log.date, "2026-10-02");
  assert.equal(log.dateKey, "20261002");
  assert.equal(log.markdown, source);
  assert.deepEqual(log.images, ["20261002-1.webp", "20261002-2.webp", "20261002-10.webp"]);
  assert.equal(log.coverImage, "20261002-1.webp");
  assert.equal(log.pageCount, 3);
});

test("logs loader skips malformed folders and the old layout and returns dates in ascending order", (t) => {
  const build = fixture(t, {
    "logs/2026/10/03/20261003.md": "third",
    "logs/2026/10/01/20261001.md": "first",
    "logs/2024/02/29/20240229.md": "leap day",
    "logs/2026/02/30/20260230.md": "invalid",
    "logs/2026/13/01/20261301.md": "invalid month",
    "logs/2026/10/00/20261000.md": "invalid day",
    "logs/2026/1/05/20260105.md": "single digit month",
    "logs/2026/10/5/20261005.md": "single digit day",
    "logs/misc/10/05/20261005.md": "wrong parent",
    "logs/2026/20261005/20261005.md": "old layout"
  });

  assert.deepEqual(build.loadLogs().map((log) => log.dateKey), ["20240229", "20261001", "20261003"]);
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
  assert.match(page, /property="og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/og-image\.png"/);
  assert.match(page, /name="twitter:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/og-image\.png"/);
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
    markdownPathForDate(dateKey),
    `# ${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6)}\n\nLog ${dateKey}\n\n全文です。`
  ]));
  files["logs/2026/10/10/20261010.md"] = `# 2026-10-10

- 数学III
- 1ページ
- 47 関数の極限
- 48 極限値の条件から関数を考える`;
  files["logs/2026/10/09/20261009.md"] = `# 2026-10-09

-数学II
-1ページ
-関数の極限`;
  files["logs/2026/10/10/20261010-10.webp"] = webp;
  files["logs/2026/10/10/20261010-2.webp"] = webp;
  files["logs/2026/10/10/20261010-1.webp"] = webp;
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/index.html");
  const archiveStart = page.indexOf('id="daily-log-archive"');
  const latestHtml = page.slice(page.indexOf('id="daily-log-latest"'), archiveStart);
  const archiveHtml = page.slice(archiveStart, page.indexOf('<section class="category-index"', archiveStart));
  const expectedOrder = [...dateKeys].sort((a, b) => b.localeCompare(a));
  const latestKeys = [...latestHtml.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);
  const archiveKeys = [...archiveHtml.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);

  assert.deepEqual(latestKeys, expectedOrder.slice(0, 20));
  assert.deepEqual(archiveKeys, expectedOrder.slice(20));
  assert.equal(new Set([...latestKeys, ...archiveKeys]).size, dateKeys.length);
  assert.match(latestHtml, /class="daily-log-image"/);
  assert.match(latestHtml, /<p class="daily-log-excerpt">数学III\n1ページ\n47 関数の極限\n48 極限値の条件から関数を考える<\/p>/);
  assert.match(latestHtml, /data-card-excerpt="数学III&#10;1ページ&#10;47 関数の極限&#10;48 極限値の条件から関数を考える"/);
  assert.match(latestHtml, /<p class="daily-log-excerpt">数学II\n1ページ\n関数の極限<\/p>/);
  assert.doesNotMatch(latestHtml, /<p class="daily-log-excerpt">-/);
  assert.doesNotMatch(archiveHtml, /class="daily-log-card"|class="daily-log-image"|class="daily-log-pages"|<img\b/);
  assert.match(archiveHtml, /data-archive-excerpt="Log 20260905 全文です。"/);
  assert.match(archiveHtml, /data-archive-month="2026-09"[\s\S]*<summary>9月<\/summary>/);
  assert.match(archiveHtml, /data-archive-year="2025"[\s\S]*data-archive-month="2025-08"/);
  assert.match(page, /const latestCount = mobile\.matches \? 5 : tablet\.matches \? 12 : 20;/);
  assert.match(page, /@media \(max-width: 600px\)[\s\S]*\.daily-log-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(page, /\.daily-log-excerpt \{[^}]*white-space: pre-line;[^}]*-webkit-line-clamp: 3;/);
  assert.match(page, /property="og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/daily\/20261010\/images\/20261010-1\.webp"/);
  assert.match(page, /name="twitter:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/daily\/20261010\/images\/20261010-1\.webp"/);
  assert.match(page, /property="og:url" content="https:\/\/sakurak02\.github\.io\/math-study-log\/"/);
  assert.match(page, /rel="canonical" href="https:\/\/sakurak02\.github\.io\/math-study-log\/"/);
  assertInlineScriptsParse(page);

  const dailyPage = build.read("public/daily/20261010/index.html");
  const images = [...dailyPage.matchAll(/class="daily-sheet-image" src="\.\/images\/([^"]+)"/g)].map((match) => match[1]);
  const markdownSection = dailyPage.match(/<div class="daily-markdown-content">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.deepEqual(images, ["20261010-1.webp", "20261010-2.webp", "20261010-10.webp"]);
  assert.match(dailyPage, /<title>2026\.10\.10 \| 数学学習記録<\/title>/);
  assert.match(dailyPage, /← 学習記録へ戻る/);
  assert.match(dailyPage, /og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/daily\/20261010\/images\/20261010-1\.webp"/);
  assert.match(markdownSection, /<ul>[\s\S]*<li>数学III<\/li>[\s\S]*<li>1ページ<\/li>[\s\S]*<li>47 関数の極限<\/li>[\s\S]*<li>48 極限値の条件から関数を考える<\/li>[\s\S]*<\/ul>/);
  assert.doesNotMatch(markdownSection, /<h1>|2026-10-10/);
  assert.match(dailyPage, /href="\.\/images\/20261010-1\.webp" target="_blank"/);
  assert.match(dailyPage, /href="\.\.\/20261009\/">← 2026\.10\.09<\/a>/);
  assertInlineScriptsParse(dailyPage);

  const sitemap = build.read("public/sitemap.xml");
  assert.equal((sitemap.match(/<loc>/g) || []).length, dateKeys.length + 1);
  assert.match(sitemap, /\/daily\/20261010\//);
  assert.doesNotMatch(sitemap, /records|\/log\/|\/session\//);
});

test("study note renders compact dash lines as a list between paragraphs", (t) => {
  const source = `# 2026-10-02

今日は極限を勉強した。

-47 関数の極限
-48 極限値の条件から係数決定

48番は少し迷った。`;
  const build = fixture(t, {
    "logs/2026/10/02/20261002.md": source
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/daily/20261002/index.html");
  const note = page.match(/<div class="daily-markdown-content">([\s\S]*?)<\/div>/)?.[1] || "";

  assert.match(note, /<p>今日は極限を勉強した。<\/p>[\s\S]*<ul>[\s\S]*<li>47 関数の極限<\/li>[\s\S]*<li>48 極限値の条件から係数決定<\/li>[\s\S]*<\/ul>[\s\S]*<p>48番は少し迷った。<\/p>/);
  assert.doesNotMatch(note, /<h1>|# 2026-10-02|<p>-47/);
  assert.match(page, /\.daily-markdown-content ul, \.daily-markdown-content ol \{[^}]*margin: \.75rem 0 \.75rem 1\.5rem;[^}]*padding-left: 1rem;/);
  assert.match(page, /\.daily-markdown-content li \{[^}]*line-height: 1\.8;[^}]*overflow-wrap: anywhere;/);
});

test("front matter categories are separated from free-form notes with safe defaults", (t) => {
  const cases = [
    ["---\ncategory: 数学III｜極限\n---\n\n今日は47番と48番。", "数学III｜極限", "\n今日は47番と48番。"],
    ["---\ncategory: 未分類\n---\n漸化式。", "未分類", "漸化式。"],
    ["昔の自由記入。", "未分類", "昔の自由記入。"],
    ["---\ntitle: テスト\n---\n本文", "未分類", "本文"],
    ["---\ncategory: \n---\n本文", "未分類", "本文"],
    ['\uFEFF---\r\ncategory: "数学B｜数列"\r\n---\r\n本文', "数学B｜数列", "本文"],
    ["---\ncategory: '数学III｜極限' # コメント\n---\n本文", "数学III｜極限", "本文"],
    ["---\ncategory: 数学III｜極限 # コメント\n---\n本文", "数学III｜極限", "本文"],
    ['---\ncategory: "数学III｜極限 # 復習" # コメント\n---\n本文', "数学III｜極限 # 復習", "本文"],
    ["---\ncategory: [数列]\n---\n本文", "未分類", "本文"],
    ["---\ncategory: null\n---\n本文", "未分類", "本文"],
    ["---\ncategory: |\n  数列\n---\n本文", "未分類", "本文"],
    ["---\ncategory: 未分類\n---", "未分類", ""],
    ["本文\n\n---\ncategory: 本文中\n---", "未分類", "本文\n\n---\ncategory: 本文中\n---"]
  ];
  for (const [source, category, body] of cases) {
    const build = fixture(t, { "logs/2026/10/25/20261025.md": source });
    const [log] = build.loadLogs();
    assert.equal(log.category, category, source);
    assert.equal(log.markdown, body, source);
    assert.equal(log.date, "2026-10-25");
  }
});

function categorySection(page, category) {
  return page.split(`data-category-name="${category}"`)[1]?.split("</details>")[0] || "";
}

test("a single category includes all of the day's photos", (t) => {
  const webp = createVp8xWebp();
  const build = fixture(t, {
    "logs/2026/11/09/20261109.md": "---\ncategory: 数学III｜極限\n---\n",
    "logs/2026/11/09/20261109-1.webp": webp,
    "logs/2026/11/09/20261109-2.webp": webp
  });
  const [log] = build.loadLogs();
  assert.deepEqual(log.categories, [{
    category: "数学III｜極限",
    images: ["20261109-1.webp", "20261109-2.webp"]
  }]);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const home = build.read("public/index.html");
  assert.match(categorySection(home, "数学III｜極限"), /href="\.\/daily\/20261109\/"/);
  const daily = build.read("public/daily/20261109/index.html");
  assert.match(daily, /class="daily-sheet-image" src="\.\/images\/20261109-1\.webp"/);
  assert.match(daily, /class="daily-sheet-image" src="\.\/images\/20261109-2\.webp"/);
});

test("category links open filtered photos while the daily page shows every photo and the shared note", (t) => {
  const webp = createVp8xWebp();
  const source = `---
categories:
  - category: '数学III｜積分法'
    images: [2, 1] # 写真番号
  - category: 数学B｜数列
    images: [3]
  - category: 未分類
    images: []
教材: 青チャート
---

積分は置換積分を復習。数列は漸化式を進めた。`;
  const build = fixture(t, {
    "logs/2026/11/10/20261110.md": source.replace(/\n/g, "\r\n"),
    "logs/2026/11/10/20261110-1.webp": webp,
    "logs/2026/11/10/20261110-2.webp": webp,
    "logs/2026/11/10/20261110-3.webp": webp,
    "logs/2026/11/10/20261110-4.webp": webp
  });
  const groups = [
    { category: "数学III｜積分法", images: ["20261110-1.webp", "20261110-2.webp"] },
    { category: "数学B｜数列", images: ["20261110-3.webp"] },
    { category: "未分類", images: [] }
  ];
  const [log] = build.loadLogs();
  assert.deepEqual(log.categories, groups);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");

  const imagesIn = (page) => [...page.matchAll(/class="daily-sheet-image" src="\.\/images\/([^"]+)"/g)]
    .map((match) => match[1]);
  const home = build.read("public/index.html");
  assert.match(home, /class="daily-log-card-link" href="\.\/daily\/20261110\/"/);
  assert.match(home, /class="log-category">数学III｜積分法 \/ 数学B｜数列 \/ 未分類<\/p>/);
  const daily = build.read("public/daily/20261110/index.html");
  assert.match(daily, /class="log-category">数学III｜積分法 \/ 数学B｜数列 \/ 未分類<\/p>/);
  assert.match(daily, /積分は置換積分を復習。数列は漸化式を進めた。/);
  assert.deepEqual(imagesIn(daily), [...groups.flatMap(({ images }) => images), "20261110-4.webp"]);

  for (const { category, images } of groups) {
    const section = categorySection(home, category);
    const href = section.match(/href="\.\/(daily\/20261110\/[^"]+)"/)?.[1];
    assert.ok(href, category);
    const page = build.read(`public/${href}`);
    assert.deepEqual(imagesIn(page), images);
    assert.ok(page.includes(`class="log-category">${category}</p>`));
    assert.match(page, /積分は置換積分を復習。数列は漸化式を進めた。/);
    assert.match(page, /<dt>教材<\/dt><dd>青チャート<\/dd>/);
    assert.match(page, /href="\.\/">この日の全写真を見る/);
  }
});

test("invalid, missing and overlapping photo numbers warn without breaking an empty note", (t) => {
  const webp = createVp8xWebp();
  const build = fixture(t, {
    "logs/2026/11/10/20261110.md": `---
categories:
  - category: 数学III｜積分法
    images: [1, 8, 2-4]
  - category: 未分類
    images: [1, 2]
  - category: 未分類
    images: [3, 3]
---
`,
    "logs/2026/11/10/20261110-1.webp": webp,
    "logs/2026/11/10/20261110-2.webp": webp,
    "logs/2026/11/10/20261110-3.webp": webp
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /20261110\.md（数学III｜積分法）: 画像番号 8 .*見つかりません/);
  assert.match(result.stderr, /不正な画像番号「2-4」/);
  assert.match(result.stderr, /20261110\.md（未分類）: 画像番号 1 .*重複/);
  const daily = build.read("public/daily/20261110/index.html");
  assert.doesNotMatch(daily, /<section class="daily-markdown"/);
  const section = categorySection(build.read("public/index.html"), "未分類");
  const links = [...section.matchAll(/href="\.\/(daily\/20261110\/[^"]+)"/g)];
  assert.equal(links.length, 1);
  const page = build.read(`public/${links[0][1]}`);
  assert.doesNotMatch(page, /20261110-1\.webp|<section class="daily-markdown"/);
  assert.deepEqual([...page.matchAll(/class="daily-sheet-image" src="\.\/images\/([^"]+)"/g)]
    .map((match) => match[1]), ["20261110-2.webp", "20261110-3.webp"]);
});

test("categories appear on cards and daily pages, with text lists independent of chronology", (t) => {
  const source = "---\ncategory: 数学III｜極限\n---\n\n今日は47番と48番。\n48番は係数決定の考え方をもう一度見直したい。";
  const build = fixture(t, {
    "logs/2026/10/25/20261025.md": source,
    "logs/2026/10/18/20261018.md": "---\ncategory: 数学III｜極限\n---\n極限の復習",
    "logs/2026/10/17/20261017.md": "---\ncategory: 数学B｜数列\n---\n漸化式。",
    "logs/2026/10/16/20261016.md": "---\ncategory: 未分類\n---\n未分類の記録",
    "logs/2026/10/15/20261015.md": "古い記録"
  });
  let result = build.run();
  assert.equal(result.status, 0, result.stderr);
  let home = build.read("public/index.html");
  const daily = build.read("public/daily/20261025/index.html");
  assert.match(home, /<time class="daily-log-date"[^>]*>2026\.10\.25<\/time>\s*<p class="log-category">数学III｜極限<\/p>/);
  assert.match(daily, /<h1>2026\.10\.25<\/h1><p class="log-category">数学III｜極限<\/p>/);
  assert.match(daily, /<p>今日は47番と48番。\n48番は係数決定の考え方をもう一度見直したい。<\/p>/);
  assert.doesNotMatch(home + daily, /category:|<hr>|<h2>category/);
  const limits = categorySection(home, "数学III｜極限");
  assert.match(limits, /20261025\/[^]*2026\.10\.25[^]*今日は47番と48番。[^]*20261018\/[^]*極限の復習/);
  assert.doesNotMatch(limits, /<img|20261017|20261016|20261015|data-daily-log-entry/);
  assert.match(categorySection(home, "数学B｜数列"), /20261017\/[^]*漸化式。/);
  assert.match(categorySection(home, "未分類"), /20261016\/[^]*20261015\//);
  assert.equal((home.match(/data-category-name=/g) || []).length, 30);
  assert.equal((home.match(/data-daily-log-entry data-category=/g) || []).length, 5);
  assertInlineScriptsParse(home);
  const sitemap = build.read("public/sitemap.xml");
  assert.equal((sitemap.match(/<loc>/g) || []).length, 6);
  assert.match(sitemap, /\/daily\/20261025\//);

  build.write("logs/2026/10/25/20261025.md", source.replace("数学III｜極限", "数学B｜数列"));
  result = build.run();
  assert.equal(result.status, 0, result.stderr);
  home = build.read("public/index.html");
  assert.doesNotMatch(categorySection(home, "数学III｜極限"), /20261025/);
  assert.match(categorySection(home, "数学B｜数列"), /20261025\/[^]*20261017\//);
  assert.match(build.read("public/daily/20261025/index.html"), /class="log-category">数学B｜数列/);
  assert.equal(build.read("public/sitemap.xml"), sitemap);
});

test("daily pages show a subtle category below the date for categorized and legacy notes", (t) => {
  const build = fixture(t, {
    "logs/2026/10/25/20261025.md": "---\ncategory: 数学III｜極限\n---\n\nカテゴリ表示テスト。",
    "logs/2026/10/24/20261024.md": "---\ncategory: 未分類\n---\n\n未分類の本文。",
    "logs/2026/10/23/20261023.md": "古い記録の本文。"
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  for (const [key, category, body] of [
    ["20261025", "数学III｜極限", "カテゴリ表示テスト。"],
    ["20261024", "未分類", "未分類の本文。"],
    ["20261023", "未分類", "古い記録の本文。"]
  ]) {
    const page = build.read(`public/daily/${key}/index.html`);
    const content = page.split('<main class="record-main">')[1].split("</main>")[0];
    const dotDate = `${key.slice(0, 4)}.${key.slice(4, 6)}.${key.slice(6)}`;
    assert.ok(content.includes(`<h1>${dotDate}</h1><p class="log-category">${category}</p>`));
    assert.ok(content.indexOf('class="log-category"') < content.indexOf("STUDY NOTE"));
    assert.ok(content.includes(`<div class="daily-markdown-content"><p>${body}</p>`));
    assert.equal((content.match(/class="log-category"/g) || []).length, 1);
    assert.doesNotMatch(content, /category:|CATEGORY:|---/);
    assert.match(page, /\.page-head \.log-category \{[^}]*display: block;[^}]*color: var\(--ink-soft\);[^}]*font-size: 12px;/);
  }
});

test("free-form headings and category values render safely", (t) => {
  const category = '<script>alert("test")</script>';
  const build = fixture(t, {
    "logs/2026/10/25/20261025.md": `---\ncategory: '${category}'\n---\n\n# 漸化式の気づき\n\n本文。\n\n---\n\n後半。`
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const daily = build.read("public/daily/20261025/index.html");
  const home = build.read("public/index.html");
  assert.match(daily, /<h1>漸化式の気づき<\/h1>/);
  assert.match(daily, /<hr>/);
  assert.match(home, /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(home + daily, /<script>alert/);
});

test("responsive card rebuilding retains categories without duplicating chronological entries", (t) => {
  const files = Object.fromEntries(Array.from({ length: 25 }, (_, index) => {
    const key = `202610${String(index + 1).padStart(2, "0")}`;
    return [markdownPathForDate(key), `---\ncategory: 数学III｜極限\n---\n記録${key}`];
  }));
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const home = build.read("public/index.html");
  // A minimal DOM for executing the actual generated responsive script.
  const element = () => ({
    dataset: {}, children: [],
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {},
    querySelectorAll() { return []; }
  });
  const targets = Object.fromEntries(["#daily-log-latest", "#daily-log-archive", "#daily-log-years"].map((id) => [id, element()]));
  const entries = [...home.matchAll(/<article[^>]+data-daily-log-entry ([^>]+)>/g)].map((match) => {
    const node = element();
    for (const attr of match[1].matchAll(/data-([\w-]+)="([^"]*)"/g)) {
      const key = attr[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      node.dataset[key] = attr[2];
    }
    return node;
  });
  const queries = new Map();
  const script = [...home.matchAll(/<script>([\s\S]*?)<\/script>/g)].find((match) => match[1].includes("const latestGrid"))[1];
  vm.runInNewContext(script, {
    document: {
      querySelector: (id) => targets[id],
      querySelectorAll: () => entries,
      createElement: element
    },
    window: {
      matchMedia: (query) => {
        const media = { matches: false, addEventListener: (_, callback) => { media.change = callback; } };
        queries.set(query, media);
        return media;
      }
    }
  });
  const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
  for (const [width, count] of [[1200, 20], [800, 12], [390, 5], [1200, 20]]) {
    for (const [query, media] of queries) media.matches = width <= Number(query.match(/\d+/)[0]);
    [...queries.values()][0].change();
    const cards = targets["#daily-log-latest"].children;
    assert.equal(cards.length, count);
    for (const card of cards) {
      assert.equal(card.dataset.category, "数学III｜極限");
      assert.equal(descendants(card).find((node) => node.className === "log-category").textContent, "数学III｜極限");
    }
    const chronological = [...cards, ...descendants(targets["#daily-log-years"]).filter((node) => node.className === "daily-log-archive-item")];
    assert.equal(chronological.length, 25);
    assert.equal(new Set(chronological.map((node) => node.dataset.dateKey)).size, 25);
    assert.deepEqual(chronological.map((node) => node.dataset.dateKey), entries.map((node) => node.dataset.dateKey).sort().reverse());
  }
});

test("runtime and dependencies contain only the new log system", () => {
  const source = fs.readFileSync(path.join(__dirname, "build.js"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
  assert.doesNotMatch(source, /classification|createMonthCalendar|TableOfContents|ORIGINAL QUESTION|EXPLANATION|content[\\/]records/i);
  assert.deepEqual(Object.keys(packageJson.dependencies), ["markdown-it"]);
});

test("new template renders all fields in order and keeps paper and photo counts separate", (t) => {
  const source = `---
category: 数学III｜極限
教材: 青チャート 数学III
範囲: 数列の極限・例題15〜20
問題数: 12
用紙: 8
苦戦度: 🌧️🌧️🌧️🌧️
喜び度: ☀️☀️☀️
---

## 記録メモ

今日は計算が長かった。でも最後の問題が解けた。`;
  const build = fixture(t, {
    "logs/2026/11/03/20261103.md": source,
    "logs/2026/11/03/20261103-1.webp": createVp8xWebp()
  });
  const [log] = build.loadLogs();
  assert.equal(log.problemCount, 12);
  assert.equal(log.paperCount, 8);
  assert.equal(log.pageCount, 1);
  assert.equal(log.scope, "数列の極限・例題15〜20");
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const home = build.read("public/index.html");
  const daily = build.read("public/daily/20261103/index.html");
  const content = daily.split('<main class="record-main">')[1].split("</main>")[0];
  const ordered = [
    "<h1>2026.11.03</h1>", 'class="daily-sheet-image"',
    "<dt>教材</dt><dd>青チャート 数学III</dd>",
    "<dt>範囲</dt><dd>数列の極限・例題15〜20</dd>",
    "<dt>問題数</dt><dd>12問</dd>", "<dt>用紙枚数</dt><dd>8枚</dd>",
    "<dt>苦戦度</dt><dd>🌧️🌧️🌧️🌧️</dd>", "<dt>喜び度</dt><dd>☀️☀️☀️</dd>",
    'id="daily-markdown-heading">記録メモ</h2>', "今日は計算が長かった。"
  ];
  let previous = -1;
  for (const value of ordered) {
    const position = content.indexOf(value);
    assert.ok(position > previous, value);
    previous = position;
  }
  assert.match(home, /class="daily-log-pages">写真 1枚/);
  assert.match(daily, /class="daily-sheet-label">写真 1 \/ 1枚/);
  assert.match(home, /pages.textContent = "写真 " \+ entry.pageCount \+ "枚"/);
  assert.match(categorySection(home, "数学III｜極限"), /20261103/);
  assert.doesNotMatch(home, /記録メモ/);
  assert.equal((content.match(/記録メモ/g) || []).length, 1);
  assert.match(daily, /grid-template-columns: 6em minmax\(0, 1fr\)/);
  assert.match(daily, /\.study-details dd \{[^}]*overflow-wrap: anywhere/);
});

test("counts distinguish missing, blank and zero; blank notes and fields stay hidden", (t) => {
  const build = fixture(t, {
    "logs/2026/11/03/20261103.md": "---\n問題数: 0\n用紙: 0\n---\n\n## 記録メモ\n\n  ",
    "logs/2026/11/02/20261102.md": "---\n教材: \n範囲: \n問題数: \n用紙: \n苦戦度: \n喜び度: \n---\n\n## 記録メモ\n",
    "logs/2026/11/01/20261101.md": "古い記録。"
  });
  const [legacy, blank, zero] = build.loadLogs();
  assert.equal(legacy.problemCount, undefined);
  assert.equal(legacy.paperCount, undefined);
  assert.equal(blank.problemCount, null);
  assert.equal(blank.paperCount, null);
  assert.equal(zero.problemCount, 0);
  assert.equal(zero.paperCount, 0);
  assert.equal(build.run().status, 0);
  const zeroPage = build.read("public/daily/20261103/index.html");
  assert.match(zeroPage, /<dt>問題数<\/dt><dd>0問<\/dd>/);
  assert.match(zeroPage, /<dt>用紙枚数<\/dt><dd>0枚<\/dd>/);
  for (const key of ["20261103", "20261102"]) {
    const page = build.read(`public/daily/${key}/index.html`);
    assert.doesNotMatch(page, /<section class="daily-markdown"|id="daily-markdown-heading"|記録メモ/);
  }
  for (const key of ["20261102", "20261101"]) {
    assert.doesNotMatch(build.read(`public/daily/${key}/index.html`), /<dl class="study-details"|<dt>/);
  }
  assert.match(build.read("public/daily/20261101/index.html"), /古い記録。/);
  assert.doesNotMatch(build.read("public/index.html"), /記録メモ/);
});

test("single-line fields support quotes, comments and safe rendering without using date metadata", (t) => {
  const build = fixture(t, {
    "logs/2026/11/03/20261103.md": `---
date: 2000-01-01
category: '数学III｜極限'
教材: "青チャート # III" # コメント
範囲: '<script>alert(1)</script>'
問題数: "0"
用紙: 8 # コメント
苦戦度: '🌧️'
喜び度: "☀️☀️☀️☀️☀️"
---

## 記録メモ

# 自由な見出し

本文。`
  });
  const [log] = build.loadLogs();
  assert.equal(log.date, "2026-11-03");
  assert.equal(log.material, "青チャート # III");
  assert.equal(log.paperCount, 8);
  assert.equal(log.problemCount, 0);
  assert.equal(build.run().status, 0);
  const page = build.read("public/daily/20261103/index.html");
  assert.match(page, /<dd>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/dd>/);
  assert.doesNotMatch(page, /<script>alert/);
  assert.match(page, /<h1>自由な見出し<\/h1>/);
});

test("counts and ratings reject invalid input with the source filename", (t) => {
  for (let count = 1; count <= 5; count += 1) {
    const build = fixture(t, {
      "logs/2026/11/03/20261103.md": `\uFEFF---\r\n苦戦度:\t${"🌧️".repeat(count)}\r\n喜び度: ${"☀️".repeat(count)}\r\n---\r\n`
    });
    const [log] = build.loadLogs();
    assert.equal(log.difficulty, "🌧️".repeat(count));
    assert.equal(log.joy, "☀️".repeat(count));
  }
  for (const [key, value] of [
    ["問題数", "-1"], ["用紙", "1.5"], ["問題数", "abc"],
    ["用紙", "9007199254740992"], ["苦戦度", "🌧️🌧️🌧️🌧️🌧️🌧️"],
    ["喜び度", "☀️☀️☀️☀️☀️☀️"], ["苦戦度", "☀️"], ["喜び度", "3"]
  ]) {
    const build = fixture(t, {
      "logs/2026/11/03/20261103.md": `---\n${key}: ${value}\n---\n`
    });
    assert.throws(() => build.loadLogs(), (error) => {
      assert.match(error.message, /20261103\.md/);
      assert.ok(error.message.includes(key));
      return true;
    });
  }
});

test("mixed old and new logs retain chronology, monthly archives and category hierarchy", (t) => {
  const files = {};
  for (let day = 1; day <= 25; day += 1) {
    const dateKey = `202610${String(day).padStart(2, "0")}`;
    files[markdownPathForDate(dateKey)] = day % 2
      ? `---\ncategory: 数学III｜極限\n教材: 青チャート\n範囲: 独立した範囲\n問題数: 1\n---\n\n## 記録メモ\n\n記録${dateKey}`
      : `# 2026-10-${String(day).padStart(2, "0")}\n\n記録${dateKey}`;
  }
  const build = fixture(t, files);
  const logs = build.loadLogs();
  assert.equal(logs[0].dateKey, "20261001");
  assert.equal(logs.at(-1).dateKey, "20261025");
  assert.equal(build.run().status, 0);
  const home = build.read("public/index.html");
  const keys = [...home.matchAll(/data-date-key="(\d{8})"/g)].map((match) => match[1]);
  assert.deepEqual(keys, logs.map((log) => log.dateKey).reverse());
  assert.match(home, /data-archive-month="2026-10"/);
  assert.match(home, /class="category-subject"><summary>数学III<\/summary>/);
  assert.match(categorySection(home, "数学III｜極限"), /20261025/);
  assert.match(categorySection(home, "未分類"), /20261024/);
  assert.doesNotMatch(home, /data-category-name="独立した範囲"|記録メモ/);
  const oldPage = build.read("public/daily/20261024/index.html");
  assert.doesNotMatch(oldPage, /<dl class="study-details"/);
  assert.match(oldPage, /記録20261024/);
});

test("mathlog offers two templates and keeps the existing category selection snippet", () => {
  const snippets = JSON.parse(fs.readFileSync(path.join(projectDir, ".vscode/math-log.code-snippets"), "utf8"));
  const templates = Object.entries(snippets).filter(([, snippet]) => snippet.prefix);
  assert.deepEqual(templates.map(([name]) => name), ["数学学習記録｜1分野", "数学学習記録｜複数分野"]);
  const [[, single], [, multi]] = templates;
  assert.equal(single.prefix, "mathlog");
  assert.equal(multi.prefix, "mathlog");
  assert.equal(single.scope, "markdown");
  assert.equal(multi.scope, "markdown");
  assert.deepEqual(single.body, ["---", "category: 未分類", "---", "", "$0"]);
  assert.deepEqual(multi.body, [
    "---", "categories:", "  - ${1:category: 未分類}", "    images: [${2}]",
    "  - ${3:category: 未分類}", "    images: [${4}]", "---", "", "$0"
  ]);
  const picker = snippets["カテゴリ選択"];
  assert.equal(picker.prefix, undefined);
  const choices = picker.body[0].match(/^category: \$\{1\|(.+)\|\}$/)?.[1].split(",");
  assert.equal(choices.length, 30);
  assert.ok(choices.includes("数学III｜積分法"));
  assert.ok(choices.includes("数学B｜数列"));
  assert.ok(choices.includes("未分類"));
});
