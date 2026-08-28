const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const projectDir = path.resolve(__dirname, "..");
const defaultImagesDir = "content/records/20260828/001/images";

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
    }
  };
}

test("build publishes first/retry pages in numeric order and keeps study sets separate", (t) => {
  const ordered = [
    "20260828-001f-1.jpg",
    "20260828-001f-2.jpg",
    "20260828-001f-10.jpg",
    "20260828-001r-1.jpg",
    "20260828-001r-2.jpg",
    "20260828-001r-10.jpg"
  ];
  const files = {
    "content/records/20260828/001/session.md": "# Sample session\n\nUnchanged content.",
    "content/records/20260828/002/session.md": "# Second set",
    "content/records/20260828/002/images/20260828-002f-1.jpg": "second set",
    "content/records/20260827/001/session.md": "# Previous day",
    "content/records/20260827/001/images/20260827-001r-1.jpg": "selected retry",
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
  assert.match(build.read("public/records/20260828/002/index.html"), /20260828-002f-1\.jpg/);
  assert.match(build.read("public/records/20260827/001/index.html"), /20260827-001r-1\.jpg/);
  assert.match(log, /Unchanged content\./);
  assert.equal(build.read("public/question/example/images/free-name.png"), "question image");
  assert.match(result.stdout, /Study days : 2/);
  assert.match(result.stdout, /Problems   : 3/);
  assert.match(result.stdout, /Images     : 8/);
});

const invalidNames = [
  "20260828-001-f.jpg",
  "20260828-001-r.jpg",
  "20260828-001-1-r.jpg",
  "20260828-001.jpg",
  "20260828-001-1.jpg",
  "20260828-001f.jpg",
  "20260828-001r.jpg",
  "20260828-001x-1.jpg",
  "20260828-001F-1.jpg",
  "20260828-001r-0.jpg",
  "20260828-001r--1.jpg",
  "20260828-001r-1.5.jpg",
  "20260828-001r-01.jpg",
  "20260828-001r-1r.jpg",
  "20260828-001r-1.JPG",
  "20260828-001r-1.png",
  "20260828-001r-1.jpeg"
];

test("split SESSION files pair each stage, preserve math/details, and link independent sets", (t) => {
  const files = {};
  for (const number of ["001", "002", "003"]) {
    const dir = `content/records/20260828/${number}`;
    files[`${dir}/session-f.md`] = `---\ntitle: Set ${number}\n---\n# FIRST ${number}\n\nFirst explanation $a=1$.\n\n<details>\n<summary>Hint</summary>\n\n$$a_n=2^n$$\n\n</details>`;
    files[`${dir}/session-r.md`] = `# RETRY ${number}\n\nRetry explanation.`;
    for (const suffix of ["f-1", "f-2", "r-1", "r-10", "r-3", "r-2"]) {
      files[`${dir}/images/20260828-${number}${suffix}.jpg`] = suffix;
    }
  }
  const build = fixture(t, files);
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  for (const number of ["001", "002", "003"]) {
    const page = build.read(`public/records/20260828/${number}/index.html`);
    const first = page.split('data-stage="f"')[1].split('data-stage="r"')[0];
    const retry = page.split('data-stage="r"')[1].split('</main>')[0];
    assert.match(first, /First explanation/);
    assert.doesNotMatch(first, /Retry explanation/);
    assert.match(retry, /Retry explanation/);
    assert.doesNotMatch(retry, /First explanation/);
    for (const [section, stage, pages] of [[first, "f", [1, 2]], [retry, "r", [1, 2, 3, 10]]]) {
      assert.deepEqual([...section.matchAll(/src="\.\/images\/([^"]+)"/g)].map(m => m[1]),
        pages.map(p => `20260828-${number}${stage}-${p}.jpg`));
      assert.ok(section.indexOf('data-column="log"') < section.indexOf('data-column="session"'));
    }
    assert.match(first, /<details>\s*<summary>Hint<\/summary>/);
    assert.match(first, /\$a=1\$/);
    assert.match(first, /\$\$a_n=2\^n\$\$/);
    assert.match(page, /mathjax@3/);
    assert.doesNotMatch(page, /target="_blank"/);
    assert.doesNotMatch(page, /href="\.\/(?:log|session)\.html"/);
    for (const oldPage of ["log.html", "session.html"]) {
      const redirect = build.read(`public/records/20260828/${number}/${oldPage}`);
      assert.match(redirect, /http-equiv="refresh" content="0; url=\.\/index\.html"/);
      assert.match(redirect, /href="\.\/index\.html"/);
    }
    for (const index of ["records/20260828", "log", "session"]) {
      const listing = build.read(`public/${index}/index.html`);
      assert.ok(listing.includes(`${number}/index.html`));
      assert.doesNotMatch(listing, /\/(?:log|session)\.html/);
    }
  }
  const day = build.read("public/records/20260828/index.html");
  assert.deepEqual([...day.matchAll(/class="record-number">(\d+)</g)].map(m => m[1]), ["001", "002", "003"]);
  assert.equal((day.match(/>OPEN<\/a>/g) || []).length, 3);
  const sitemap = build.read("public/sitemap.xml");
  assert.match(sitemap, /20260828\/001\/index\.html/);
  assert.doesNotMatch(sitemap, /\/(?:log|session)\.html/);
});

test("legacy SESSION remains complete once beside grouped FIRST and RETRY logs", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session.md": "# Existing title\n\nLegacy paragraph.\n\n## FIRST SESSION\n\nDo not split headings.\n\n<details>\n<summary>Answer</summary>\n\nLegacy answer.\n\n</details>",
    [`${defaultImagesDir}/20260828-001f-1.jpg`]: "first",
    [`${defaultImagesDir}/20260828-001r-1.jpg`]: "retry"
  });
  assert.equal(build.run().status, 0);
  const page = build.read("public/records/20260828/001/index.html");
  assert.equal((page.match(/Legacy paragraph\./g) || []).length, 1);
  assert.match(page, /共通SESSION/);
  assert.match(page, /<h2>FIRST SESSION<\/h2>/);
  assert.match(page, /Legacy answer\./);
  assert.ok(page.indexOf('data-stage="r"') < page.indexOf('data-column="session"'));
});

test("mixed old and split SESSION files do not hide or duplicate the legacy article", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session.md": "# Original title\n\nOriginal full article.",
    "content/records/20260828/001/session-f.md": "# New first title\n\nNew first explanation.",
    [`${defaultImagesDir}/20260828-001f-1.jpg`]: "first"
  });
  assert.equal(build.run().status, 0);
  const page = build.read("public/records/20260828/001/index.html");
  assert.match(page, /<h1>Original title<\/h1>/);
  assert.equal((page.match(/Original full article\./g) || []).length, 1);
  assert.match(page, /New first explanation\./);
  assert.match(page, /RETRYのSESSIONはまだありません/);
  assert.match(page, /RETRYのLOGはまだありません/);
});

test("retry SESSION alone works, while missing FIRST stays explicitly empty", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/session-r.md": "# Retry title\n\nRetry only.",
    [`${defaultImagesDir}/20260828-001r-1.jpg`]: "retry"
  });
  assert.equal(build.run().status, 0);
  const page = build.read("public/records/20260828/001/index.html");
  assert.match(page, /<h1>Retry title<\/h1>/);
  assert.match(page, /FIRSTのSESSIONはまだありません/);
  assert.match(page, /FIRSTのLOGはまだありません/);
  assert.match(page, /Retry only\./);
});

test("meta title still takes precedence with split SESSION files", (t) => {
  const build = fixture(t, {
    "content/records/20260828/001/meta.json": JSON.stringify({ studyId: "20260828-001", date: "2026-08-28", sequence: "001", title: "Metadata title" }),
    "content/records/20260828/001/session-f.md": "# Stage title",
    [`${defaultImagesDir}/20260828-001f-1.jpg`]: "first"
  });
  assert.equal(build.run().status, 0);
  assert.match(build.read("public/records/20260828/001/index.html"), /<h1>Metadata title<\/h1>/);
});

for (const file of invalidNames) {
  test(`build rejects invalid filename: ${file}`, (t) => {
    const build = fixture(t, { [`${defaultImagesDir}/${file}`]: "image" });
    const result = build.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LOG画像の命名形式が不正/);
    assert.ok(result.stderr.includes(path.join(defaultImagesDir, file)));
    assert.match(result.stderr, /YYYYMMDD-NNNf-M\.jpg/);
  });
}

for (const [file, reason] of [
  ["20260827-001f-1.jpg", "日付"],
  ["20260828-002r-1.jpg", "学習セット番号"]
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
    [`${defaultImagesDir}/20260828-001f-1.jpg`]: "first",
    [`${defaultImagesDir}/20260828-001r-2.jpg`]: "retry"
  });
  const result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の1ページ目がありません/);
  assert.match(result.stderr, /必要な画像名: 20260828-001r-1\.jpg/);
});

test("legacy public/images input also rejects old filenames", (t) => {
  const build = fixture(t, { "public/images/20260828-001-r.jpg": "old name" });
  const result = build.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOG画像の命名形式が不正/);
});

for (const identical of [true, false]) {
  test(`duplicate image sources ${identical ? "are deduplicated" : "reject different contents"}`, (t) => {
    const file = "20260828-001f-1.jpg";
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
