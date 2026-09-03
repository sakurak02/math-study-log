const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const projectDir = path.resolve(__dirname, "..");
const defaultImagesDir = "content/records/20260828/001/images";

function createVp8xWebp(width, height) {
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

function createVp8Webp(width, height) {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8 ", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer.set([0, 0, 0, 0x9d, 0x01, 0x2a], 20);
  buffer.writeUInt16LE(width, 26);
  buffer.writeUInt16LE(height, 28);
  return buffer;
}

function createVp8lWebp(width, height) {
  const buffer = Buffer.alloc(26);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(18, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8L", 12, "ascii");
  buffer.writeUInt32LE(5, 16);
  buffer[20] = 0x2f;
  buffer.writeUInt32LE((((height - 1) << 14) | (width - 1)) >>> 0, 21);
  return buffer;
}

function fixture(t, files) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "math-study-log-test-"));
  t.after(() => {
    // Delete only this test's own temporary directory, never the real workspace.
    assert.equal(path.dirname(tempDir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tempDir).startsWith("math-study-log-test-"));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  for (const dir of ["scripts", "public/log", "public/session"]) {
    fs.mkdirSync(path.join(tempDir, dir), { recursive: true });
  }
  fs.copyFileSync(path.join(__dirname, "build.js"), path.join(tempDir, "scripts/build.js"));
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
    }
  };
}

test("build publishes first/retry pages in numeric order and keeps study sets separate", (t) => {
  const ordered = [
    "20260828-001f-1.webp",
    "20260828-001f-2.webp",
    "20260828-001f-10.webp",
    "20260828-001r-1.webp",
    "20260828-001r-2.webp",
    "20260828-001r-10.webp"
  ];
  const files = {
    "content/records/20260828/001/session.md": "# Sample session\n\nUnchanged content.",
    "content/records/20260828/002/session.md": "# Second set",
    "content/records/20260828/002/images/20260828-002f-1.webp": "second set",
    "content/records/20260827/001/session.md": "# Previous day",
    "content/records/20260827/001/images/20260827-001r-1.webp": "selected retry",
    "public/records/20260828/001/images/20260828-001f-1.jpg": "stale generated JPEG",
    [`${defaultImagesDir}/notes.txt`]: "not an image",
    // QUESTION images retain their independent naming convention.
    "content/question/example/meta.json": JSON.stringify({ title: "Question", date: "2026-08-28" }),
    "content/question/example/article.md": "# Question\n\n## LOG",
    "content/question/example/images/free-name.png": "question image"
  };
  for (const file of [...ordered].reverse()) files[`${defaultImagesDir}/${file}`] = file;
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const log = build.read("public/records/20260828/001/index.html");
  assert.deepEqual([...log.matchAll(/src="\.\/images\/([^"]+)"/g)].map((match) => match[1]), ordered);
  for (const file of ordered) {
    assert.equal(build.read(`public/records/20260828/001/images/${file}`), file);
  }
  assert.match(build.read("public/records/20260828/002/index.html"), /20260828-002f-1\.webp/);
  assert.match(build.read("public/records/20260827/001/index.html"), /20260827-001r-1\.webp/);
  assert.match(log, /Unchanged content\./);
  assert.equal(build.exists("public/records/20260828/001/images/20260828-001f-1.jpg"), false);
  assert.equal(build.read("public/question/example/images/free-name.png"), "question image");
  assert.match(result.stdout, /Study days : 2/);
  assert.match(result.stdout, /Problems   : 3/);
  assert.match(result.stdout, /Images     : 8/);
});

test("study and homepage OGP use absolute URLs, the first displayed LOG, and SESSION description", (t) => {
  const realWebp = createVp8xWebp(1668, 2157);
  const build = fixture(t, {
    "content/records/20260828/001/session-f.md": "# OGP title\n\nA concise SESSION description for the social card.",
    [`${defaultImagesDir}/20260828-001r-1.webp`]: "retry",
    [`${defaultImagesDir}/20260828-001f-2.webp`]: "first page 2",
    [`${defaultImagesDir}/20260828-001f-1.webp`]: realWebp
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);

  const page = build.read("public/records/20260828/001/index.html");
  const head = page.split("</head>")[0];
  assert.match(head, /<meta property="og:title" content="OGP title \| 数学学習記録">/);
  assert.match(head, /<meta property="og:description" content="A concise SESSION description for the social card\.">/);
  assert.match(head, /<meta property="og:url" content="https:\/\/sakurak02\.github\.io\/math-study-log\/records\/20260828\/001\/">/);
  assert.match(head, /<meta property="og:type" content="article">/);
  assert.match(head, /<meta property="og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/records\/20260828\/001\/images\/20260828-001f-1\.webp">/);
  assert.match(head, /<meta property="og:image:width" content="1668">/);
  assert.match(head, /<meta property="og:image:height" content="2157">/);
  assert.match(head, /<meta property="og:image:type" content="image\/webp">/);
  assert.match(head, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(head, /<meta name="twitter:title" content="OGP title \| 数学学習記録">/);
  assert.match(head, /<meta name="twitter:description" content="A concise SESSION description for the social card\.">/);
  assert.match(head, /<meta name="twitter:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/records\/20260828\/001\/images\/20260828-001f-1\.webp">/);

  const homeHead = build.read("public/index.html").split("</head>")[0];
  assert.match(homeHead, /<meta property="og:type" content="website">/);
  assert.match(homeHead, /<meta property="og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/og-image\.png">/);

  for (const file of ["public/index.html", "public/records/20260828/001/index.html"]) {
    const html = build.read(file);
    assert.equal((html.match(/class="some-clouds-link"/g) || []).length, 1);
    assert.match(html, /<a class="some-clouds-link" href="https:\/\/sakurak02\.github\.io\/some-clouds\/">some clouds<\/a>/);
    assert.doesNotMatch(html, /class="some-clouds-link"[^>]*target=/);
    assert.match(html, /\.some-clouds-link \{[\s\S]*position: absolute;[\s\S]*top: 3px;[\s\S]*left: 12px;[\s\S]*color: #000;/);
  }
});

for (const [format, webp] of [
  ["VP8 lossy", createVp8Webp(640, 480)],
  ["VP8L lossless", createVp8lWebp(321, 654)]
]) {
  test(`OGP reads ${format} WebP dimensions and MIME type`, (t) => {
    const build = fixture(t, {
      "content/records/20260828/001/session.md": "# WebP metadata",
      [`${defaultImagesDir}/20260828-001f-1.webp`]: webp
    });
    const result = build.run();
    assert.equal(result.status, 0, result.stderr);

    const head = build.read("public/records/20260828/001/index.html").split("</head>")[0];
    const width = format === "VP8 lossy" ? 640 : 321;
    const height = format === "VP8 lossy" ? 480 : 654;
    assert.match(head, new RegExp(`<meta property="og:image:width" content="${width}">`));
    assert.match(head, new RegExp(`<meta property="og:image:height" content="${height}">`));
    assert.match(head, /<meta property="og:image:type" content="image\/webp">/);
  });
}

test("an unnumbered retry-only LOG becomes both the first displayed image and social image", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session-r.md": "# Retry only\n\nRetry description.",
    [`${defaultImagesDir}/20260828-001r.webp`]: "retry"
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  assert.match(page, /src="\.\/images\/20260828-001r\.webp"/);
  assert.match(page, /<meta property="og:image" content="https:\/\/sakurak02\.github\.io\/math-study-log\/records\/20260828\/001\/images\/20260828-001r\.webp">/);
});

const invalidNames = [
  "20260828-001-f.webp",
  "20260828-001-r.webp",
  "20260828-001-1-r.webp",
  "20260828-001.webp",
  "20260828-001-1.webp",
  "20260828-001x-1.webp",
  "20260828-001F-1.webp",
  "20260828-001r-0.webp",
  "20260828-001r--1.webp",
  "20260828-001r-1.5.webp",
  "20260828-001r-01.webp",
  "20260828-001r-1r.webp",
  "20260828-001r-1.WEBP",
  "20260828-001r-1.jpg",
  "20260828-001r-1.JPG",
  "20260828-001r-1.png",
  "20260828-001r-1.jpeg"
];

test("split SESSION files pair each stage, preserve math/details, and link independent sets", (t) => {
  const files = {};
  for (const number of ["001", "002", "003"]) {
    const dir = `content/records/20260828/${number}`;
    files[`${dir}/session-f.md`] = `---\ntitle: Set ${number}\n---\n# 教材問題の振り返り ${number}\n\nFirst explanation $a=1$.\n\n<details>\n<summary>Hint</summary>\n\n$$a_n=2^n$$\n\n</details>`;
    files[`${dir}/session-r.md`] = `# オリジナル問題 ${number}\n\nRetry explanation.`;
    if (number === "001") {
      files[`${dir}/session-r-extra.md`] = `# 発展解説\n\nExtended explanation with $x=1$.\n\n- first item\n- second item\n\n> important quote\n\n<details>\n<summary>Extra answer</summary>\n\n$$x^2=1$$\n\n</details>`;
    }
    for (const suffix of ["f-1", "f-10", "f-3", "f-2", "r-1", "r-10", "r-3", "r-2"]) {
      files[`${dir}/images/20260828-${number}${suffix}.webp`] = suffix;
    }
  }
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  for (const number of ["001", "002", "003"]) {
    const page = build.read(`public/records/20260828/${number}/index.html`);
    assert.equal((page.match(/class="study-stage"/g) || []).length, 2);
    assert.equal((page.match(/class="study-pair"/g) || []).length, 2);
    assert.match(page, /id="stage-f">教材問題<\/h2>/);
    assert.match(page, /id="stage-r">オリジナル問題<\/h2>/);
    assert.doesNotMatch(page, /FIRST|RETRY|legacy-log-stage/);
    const first = page.split('data-stage="f"')[1].split('data-stage="r"')[0];
    const retry = page.split('data-stage="r"')[1].split('</main>')[0];
    const retryStage = retry.split('</section>')[0];
    assert.match(first, /First explanation/);
    assert.doesNotMatch(first, /Retry explanation/);
    assert.match(retryStage, /Retry explanation/);
    assert.doesNotMatch(retryStage, /First explanation|Extended explanation/);
    for (const [section, stage, pages] of [[first, "f", [1, 2, 3, 10]], [retry, "r", [1, 2, 3, 10]]]) {
      assert.deepEqual([...section.matchAll(/src="\.\/images\/([^"]+)"/g)].map(m => m[1]),
        pages.map(p => `20260828-${number}${stage}-${p}.webp`));
      assert.ok(section.indexOf('data-column="log"') < section.indexOf('data-column="session"'));
      const left = section.match(/data-column="log">([\s\S]*?)<\/div>/)[1];
      assert.doesNotMatch(left, /explanation|Hint|<article|<p>|<details>|\$a/);
      assert.equal((left.match(/<img /g) || []).length, pages.length);
    }
    assert.match(first, /<details>\s*<summary>Hint<\/summary>/);
    assert.match(first, /\$a=1\$/);
    assert.match(first, /\$\$a_n=2\^n\$\$/);
    assert.match(page, /mathjax@3/);
    assert.doesNotMatch(page, /target="_blank"/);
    assert.doesNotMatch(page, /href="\.\/(?:log|session)\.html"/);
    for (const kind of ["log", "session"]) {
      const categoryPage = build.read(`public/records/20260828/${number}/${kind}.html`);
      const categoryBody = categoryPage.split("<body>")[1];
      assert.doesNotMatch(categoryPage, /http-equiv="refresh"/);
      assert.match(categoryPage, /href="\.\/index\.html"/);
      assert.ok(categoryBody.includes(`data-column="${kind}"`));
      assert.ok(!categoryBody.includes(`data-column="${kind === "log" ? "session" : "log"}"`));
      if (kind === "log") {
        assert.doesNotMatch(categoryBody, /First explanation|Retry explanation/);
        assert.match(categoryPage, /class="sheet"/);
        assert.doesNotMatch(categoryPage, /class="retry-extra/);
      } else {
        assert.match(categoryBody, /First explanation/);
        assert.match(categoryBody, /Retry explanation/);
        assert.doesNotMatch(categoryPage, /class="sheet"|class="lightbox"/);
      }
    }
    if (number === "001") {
      const extraStart = page.indexOf('<section class="retry-extra study-column"');
      assert.ok(extraStart > page.indexOf('data-stage="r"'));
      assert.ok(page.lastIndexOf('</section>', extraStart) > page.indexOf('data-stage="r"'));
      const extra = page.slice(extraStart, page.indexOf('</section>', extraStart) + 10);
      assert.match(extra, /Extended explanation with \$x=1\$\./);
      assert.match(extra, /<ul>[\s\S]*<li>first item<\/li>/);
      assert.match(extra, /<blockquote>[\s\S]*important quote/);
      assert.match(extra, /<details>\s*<summary>Extra answer<\/summary>/);
      assert.match(extra, /\$\$x\^2=1\$\$/);
      assert.match(build.read(`public/records/20260828/${number}/session.html`), /class="retry-extra study-column"/);
    } else {
      assert.doesNotMatch(page, /class="retry-extra study-column"/);
      assert.doesNotMatch(build.read(`public/records/20260828/${number}/session.html`), /class="retry-extra study-column"/);
    }
    for (const index of ["records/20260828", "log", "session"]) {
      const listing = build.read(`public/${index}/index.html`);
      const target = index.startsWith("records/") ? "index" : index;
      assert.ok(listing.includes(`${number}/${target}.html`));
    }
  }
  const day = build.read("public/records/20260828/index.html");
  assert.deepEqual([...day.matchAll(/class="record-number">(\d+)</g)].map(m => m[1]), ["001", "002", "003"]);
  assert.equal((day.match(/>OPEN<\/a>/g) || []).length, 3);
  const sitemap = build.read("public/sitemap.xml");
  assert.match(sitemap, /20260828\/001\/index\.html/);
  assert.match(sitemap, /20260828\/001\/log\.html/);
  assert.match(sitemap, /20260828\/001\/session\.html/);
});

test("homepage buttons lead to separate category lists and exclude articles without category content", (t) => {
  const files = {
    "content/records/20260828/001/session-f.md": "# Both categories\n\nSession explanation.",
    "content/records/20260828/004/session.md": "# Legacy session\n\nLegacy explanation.",
    "content/records/20260828/003/session-f.md": "---\ntitle: Empty session\n---\n\n",
    "content/question/example/meta.json": JSON.stringify({ title: "Question only", date: "2026-08-28" }),
    "content/question/example/article.md": "# Question only\n\nQuestion explanation."
  };
  for (const [number, title] of [["001", "Both categories"], ["002", "Log only"], ["003", "Empty session"], ["004", "Legacy session"]]) {
    const dir = `content/records/20260828/${number}`;
    files[`${dir}/images/20260828-${number}f-1.webp`] = "log image";
    files[`${dir}/meta.json`] = JSON.stringify({ studyId: `20260828-${number}`, date: "2026-08-28", sequence: number, title });
  }
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const home = build.read("public/index.html");
  assert.deepEqual([...home.matchAll(/class="entry-card" href="([^"]+)"/g)].map(m => m[1]),
    ["./log/index.html", "./session/index.html", "./question/index.html"]);
  for (const kind of ["log", "session", "question"]) {
    const listing = build.read(`public/${kind}/index.html`);
    assert.match(listing, new RegExp(`<h1>${kind.toUpperCase()}</h1>`));
    assert.doesNotMatch(listing, /http-equiv="refresh"/);
    const links = [...listing.matchAll(/class="archive-title" href="([^"]+)"/g)].map(m => m[1]);
    const expected = kind === "log" ? ["004", "003", "002", "001"] : ["004", "001"];
    assert.deepEqual(links, kind === "question" ? ["./example.html"]
      : expected.map(number => `../records/20260828/${number}/${kind}.html`));
    for (const link of links) {
      const target = path.posix.normalize(`public/${kind}/${link}`);
      const page = build.read(target);
      assert.doesNotMatch(page, /http-equiv="refresh"/);
      if (kind !== "question") assert.doesNotMatch(page, /Question explanation/);
    }
  }
  assert.match(build.read("public/records/20260828/004/session.html"), /Legacy explanation/);
  assert.doesNotMatch(build.read("public/records/20260828/004/log.html").split("<body>")[1], /Legacy explanation/);
});

test("unmigrated legacy SESSION never restores the all-LOG/all-SESSION columns", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session.md": "# Existing title\n\nLegacy paragraph.\n\n## FIRST SESSION\n\nDo not split headings.\n\n<details>\n<summary>Answer</summary>\n\nLegacy answer.\n\n</details>",
    [`${defaultImagesDir}/20260828-001f-1.webp`]: "first",
    [`${defaultImagesDir}/20260828-001r-1.webp`]: "retry"
  });
  assert.equal(build.run().status, 0);
  const page = build.read("public/records/20260828/001/index.html");
  const body = page.split("<body>")[1];
  assert.equal((body.match(/Legacy paragraph\./g) || []).length, 1);
  assert.match(page, /未分類の旧SESSION/);
  assert.match(page, /<h2>FIRST SESSION<\/h2>/);
  assert.match(page, /Legacy answer\./);
  assert.equal((page.match(/class="study-pair"/g) || []).length, 2);
  assert.ok(page.indexOf('data-stage="r"') < page.indexOf('class="legacy-session'));
  assert.doesNotMatch(page, /legacy-log-stage|aria-label="LOGと共通SESSION"/);
});

test("mixed old and split SESSION files do not hide or duplicate the legacy article", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session.md": "# Original title\n\nOriginal full article.",
    "content/records/20260828/001/session-f.md": "# New first title\n\nNew first explanation.",
    [`${defaultImagesDir}/20260828-001f-1.webp`]: "first"
  });
  assert.equal(build.run().status, 0);
  const page = build.read("public/records/20260828/001/index.html");
  const body = page.split("<body>")[1];
  assert.match(page, /<h1>Original title<\/h1>/);
  assert.equal((body.match(/Original full article\./g) || []).length, 1);
  assert.match(page, /New first explanation\./);
  assert.match(page, /オリジナル問題のSESSIONはまだありません/);
  assert.doesNotMatch(page, /のLOGはまだありません/);
});

test("original SESSION alone works, while the textbook LOG column stays empty", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session-r.md": "# Retry title\n\nRetry only.",
    [`${defaultImagesDir}/20260828-001r-1.webp`]: "retry"
  });
  assert.equal(build.run().status, 0);
  const page = build.read("public/records/20260828/001/index.html");
  assert.match(page, /<h1>Retry title<\/h1>/);
  assert.match(page, /教材問題のSESSIONはまだありません/);
  const textbook = page.split('data-stage="f"')[1].split('data-stage="r"')[0];
  const left = textbook.match(/data-column="log">([\s\S]*?)<\/div>/)[1];
  assert.equal(left.trim(), '<h3 class="column-heading">LOG</h3>');
  assert.match(page, /Retry only\./);
});

test("meta title still takes precedence with split SESSION files", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/meta.json": JSON.stringify({ studyId: "20260828-001", date: "2026-08-28", sequence: "001", title: "Metadata title" }),
    "content/records/20260828/001/session-f.md": "# Stage title",
    [`${defaultImagesDir}/20260828-001f-1.webp`]: "first"
  });
  assert.equal(build.run().status, 0);
  assert.match(build.read("public/records/20260828/001/index.html"), /<h1>Metadata title<\/h1>/);
});

test("session-r-extra alone remains optional content and can supply a fallback title", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session-r-extra.md": "# Extra fallback title\n\nExtra-only explanation.",
    [`${defaultImagesDir}/20260828-001r-1.webp`]: "retry"
  });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const study = build.read("public/records/20260828/001/index.html");
  assert.match(study, /<h1>Extra fallback title<\/h1>/);
  assert.match(study, /class="retry-extra study-column"/);
  assert.match(study, /Extra-only explanation\./);
  assert.match(build.read("public/session/index.html"), /001\/session\.html/);
});

test("existing migrated articles show textbook and original content in separate right columns", (t) => {
  const records = [
    ["20260825", "今日のつまずき", "今回の修正"],
    ["20260827", "教材問題の振り返り", "この問題でのつまずき"],
    ["20260828", "教材問題での確認", "今日の発見"]
  ];
  const files = {};
  for (const [day] of records) {
    const dir = `content/records/${day}/001`;
    for (const stage of ["f", "r"]) {
      files[`${dir}/session-${stage}.md`] = fs.readFileSync(path.join(projectDir, dir, `session-${stage}.md`), "utf8");
      files[`${dir}/images/${day}-001${stage}-1.webp`] = stage;
    }
  }
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  for (const [day, textbookHeading, originalHeading] of records) {
    const page = build.read(`public/records/${day}/001/index.html`);
    const textbook = page.split('data-stage="f"')[1].split('data-stage="r"')[0];
    const original = page.split('data-stage="r"')[1].split('</main>')[0];
    assert.ok(textbook.includes(textbookHeading));
    assert.ok(original.includes(originalHeading));
    assert.match(original, /<h2>オリジナル問題<\/h2>/);
    assert.match(original, /<details>/);
    assert.doesNotMatch(textbook, /<details>|<h2>オリジナル問題<\/h2>/);
    assert.doesNotMatch(page, /class="legacy-session|FIRST|RETRY/);
    assert.equal((page.match(/class="study-pair"/g) || []).length, 2);
  }
});

test("20260829 shows each summary LOG once before SESSION without Markdown image duplicates", (t) => {
  const day = "20260829";
  const dir = `content/records/${day}/001`;
  const files = {
    [`${dir}/session-f.md`]: fs.readFileSync(path.join(projectDir, dir, "session-f.md"), "utf8"),
    [`${dir}/session-r.md`]: fs.readFileSync(path.join(projectDir, dir, "session-r.md"), "utf8"),
    [`${dir}/session-r-extra.md`]: fs.readFileSync(path.join(projectDir, dir, "session-r-extra.md"), "utf8")
  };
  for (const image of ["20260829-001f-1.webp", "20260829-001f-2.webp", "20260829-001r-1.webp", "20260829-001r-2.webp"]) {
    files[`${dir}/images/${image}`] = image;
  }

  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260829/001/index.html");
  const first = page.split('data-stage="f"')[1].split('data-stage="r"')[0];
  const retry = page.split('data-stage="r"')[1].split('</main>')[0];

  for (const [stageHtml, stage, pages] of [[first, "f", [1, 2]], [retry, "r", [1, 2]]]) {
    assert.match(stageHtml, /class="study-column" data-column="log"/);
    assert.doesNotMatch(stageHtml, /class="study-column mobile-hidden" data-column="log"/);
    assert.ok(stageHtml.indexOf('data-column="log"') < stageHtml.indexOf('data-column="session"'));
    for (const imagePage of pages) {
      const filename = `${day}-001${stage}-${imagePage}.webp`;
      assert.equal((stageHtml.match(new RegExp(`src="\\./images/${filename.replace(".", "\\.")}"`, "g")) || []).length, 1);
    }
    assert.equal((stageHtml.match(/class="study-sheet"/g) || []).length, 2);
    assert.doesNotMatch(stageHtml, /has-inline-session-image|session-log-image/);
  }

  assert.ok(first.indexOf("20260829-001f-1.webp") < first.indexOf("20260829-001f-2.webp"));
  assert.ok(first.indexOf("20260829-001f-2.webp") < first.indexOf("最初は"));
  assert.ok(retry.indexOf("20260829-001r-1.webp") < retry.indexOf("20260829-001r-2.webp"));
  assert.ok(retry.indexOf("20260829-001r-2.webp") < retry.indexOf("今回は"));
  assert.ok(retry.indexOf('class="retry-extra study-column"') > retry.indexOf('data-column="session"'));
  assert.doesNotMatch(page, /class="session-log-image"/);
  assert.match(page, /\.study-pair \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\);/);
  assert.match(page, /@media \(max-width: 900px\)[\s\S]*\.study-pair \{ grid-template-columns: minmax\(0, 1fr\);/);

  const logOnly = build.read("public/records/20260829/001/log.html");
  const logOnlyBody = logOnly.split("<body>")[1];
  assert.doesNotMatch(logOnlyBody, /mobile-hidden|has-inline-session-image/);
  assert.doesNotMatch(logOnlyBody, /class="session-log-image"/);
});

for (const file of invalidNames) {
  test(`build rejects invalid filename: ${file}`, (t) => {
    const build = fixture(t, { [`${defaultImagesDir}/${file}`]: "image" });
    const result = build.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LOG画像の命名形式が不正/);
    assert.ok(result.stderr.includes(path.join(defaultImagesDir, file)));
    assert.match(result.stderr, /YYYYMMDD-NNNf\[-M\]\.webp/);
  });
}

test("a JPEG beside the matching WebP is rejected instead of counted twice", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session.md": "# Session",
    [`${defaultImagesDir}/20260828-001f-1.webp`]: createVp8xWebp(800, 1200),
    [`${defaultImagesDir}/20260828-001f-1.jpg`]: "old JPEG"
  });
  const result = build.run();

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の命名形式が不正/);
  assert.ok(result.stderr.includes(path.join(defaultImagesDir, "20260828-001f-1.jpg")));
  assert.doesNotMatch(result.stdout, /Images\s+:\s+2/);
});

for (const [file, reason] of [
  ["20260827-001f-1.webp", "日付"],
  ["20260828-002r-1.webp", "学習セット番号"]
]) {
  test(`build rejects mismatched ${reason}`, (t) => {
    const build = fixture(t, { [`${defaultImagesDir}/${file}`]: "image" });
    const result = build.run();
    assert.notEqual(result.status, 0);
    assert.ok(result.stderr.includes(`LOG画像の${reason}が保存先と一致しません`));
    assert.ok(result.stderr.includes(path.join(defaultImagesDir, file)));
  });
}

test("each answer requires page 1, including a single selected retry image", (t) => {
  const build = fixture(t, {
    [`${defaultImagesDir}/20260828-001f-1.webp`]: "first",
    [`${defaultImagesDir}/20260828-001r-2.webp`]: "retry"
  });
  const result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の1ページ目がありません/);
  assert.match(result.stderr, /必要な画像名: 20260828-001r-1\.webp/);
});

test("legacy public/images input also rejects old filenames", (t) => {
  const build = fixture(t, { "public/images/20260828-001-r.webp": "old name" });
  const result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の命名形式が不正/);
});

for (const identical of [true, false]) {
  test(`duplicate image sources ${identical ? "are deduplicated" : "reject different contents"}`, (t) => {
    const file = "20260828-001f-1.webp";
    const build = fixture(t, {
      "content/records/20260828/001/session.md": "# Session",
      [`${defaultImagesDir}/${file}`]: "image",
      [`public/images/${file}`]: identical ? "image" : "different image"
    });
    const result = build.run();
    if (identical) {
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Images     : 1/);
    } else {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /同名で内容が異なるLOG画像/);
    }
  });
}
