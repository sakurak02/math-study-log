const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const vm = require("node:vm");
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
    `logs/${dateKey.slice(0, 4)}/${dateKey}/${dateKey}.md`,
    `# ${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6)}\n\nLog ${dateKey}\n\n全文です。`
  ]));
  files["logs/2026/20261010/20261010.md"] = `# 2026-10-10

- 数学III
- 1ページ
- 47 関数の極限
- 48 極限値の条件から関数を考える`;
  files["logs/2026/20261009/20261009.md"] = `# 2026-10-09

-数学II
-1ページ
-関数の極限`;
  files["logs/2026/20261010/20261010-10.webp"] = webp;
  files["logs/2026/20261010/20261010-2.webp"] = webp;
  files["logs/2026/20261010/20261010-1.webp"] = webp;
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
    "logs/2026/20261002/20261002.md": source
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
    const build = fixture(t, { "logs/2026/20261025/20261025.md": source });
    const [log] = build.loadLogs();
    assert.equal(log.category, category, source);
    assert.equal(log.markdown, body, source);
    assert.equal(log.date, "2026-10-25");
  }
});

function categorySection(page, category) {
  return page.split(`data-category-name="${category}"`)[1]?.split("</details>")[0] || "";
}

test("categories appear on cards and daily pages, with text lists independent of chronology", (t) => {
  const source = "---\ncategory: 数学III｜極限\n---\n\n今日は47番と48番。\n48番は係数決定の考え方をもう一度見直したい。";
  const build = fixture(t, {
    "logs/2026/20261025/20261025.md": source,
    "logs/2026/20261018/20261018.md": "---\ncategory: 数学III｜極限\n---\n極限の復習",
    "logs/2026/20261017/20261017.md": "---\ncategory: 数学B｜数列\n---\n漸化式。",
    "logs/2026/20261016/20261016.md": "---\ncategory: 未分類\n---\n未分類の記録",
    "logs/2026/20261015/20261015.md": "古い記録"
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

  build.write("logs/2026/20261025/20261025.md", source.replace("数学III｜極限", "数学B｜数列"));
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
    "logs/2026/20261025/20261025.md": "---\ncategory: 数学III｜極限\n---\n\nカテゴリ表示テスト。",
    "logs/2026/20261024/20261024.md": "---\ncategory: 未分類\n---\n\n未分類の本文。",
    "logs/2026/20261023/20261023.md": "古い記録の本文。"
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
    "logs/2026/20261025/20261025.md": `---\ncategory: '${category}'\n---\n\n# 漸化式の気づき\n\n本文。\n\n---\n\n後半。`
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
    return [`logs/2026/${key}/${key}.md`, `---\ncategory: 数学III｜極限\n---\n記録${key}`];
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
