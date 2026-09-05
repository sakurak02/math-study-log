const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

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
    [`${dir}/answer.md`]: `${classification}# 解説\n\nExplanation text.\n\n<details>\n<summary>模範解答</summary>\n\nAnswer text.\n\n</details>`,
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

test("new-format article renders the required vertical section order", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const page = build.read("public/records/20260828/001/index.html");
  const headings = ["session-heading", "question-heading", "log-heading", "explanation-heading"]
    .map((id) => page.indexOf(`id="${id}"`));
  assert.ok(headings.every((index) => index >= 0));
  assert.deepEqual(headings, [...headings].sort((a, b) => a - b));
  assert.match(page, /<summary>ヒント<\/summary>/);
  assert.match(page, /<summary>MODEL ANSWER<\/summary>/);
  assert.doesNotMatch(page, /<h1>オリジナル問題<\/h1>|<h1>解説<\/h1>/);
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

test("same-day 001 and 002 are independent articles and one calendar classification", (t) => {
  const build = fixture(t, { ...recordFiles("20260829", "001"), ...recordFiles("20260829", "002") });
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(build.exists("public/records/20260829/001/index.html"), true);
  assert.equal(build.exists("public/records/20260829/002/index.html"), true);
  const index = build.read("public/index.html");
  assert.match(index, /href="\.\/records\/20260829\/001\/"/);
  assert.match(index, /href="\.\/records\/20260829\/002\/"/);
  const dayLink = index.match(/<a href="\.\/records\/20260829\/index\.html" class="day-link"[\s\S]*?<\/a>/)?.[0] || "";
  assert.equal((dayLink.match(/class="day-topic"/g) || []).length, 1);
  assert.match(dayLink, /数学III・極限/);
});

test("LOG and SESSION archive pages retain their focused views", (t) => {
  const build = fixture(t, recordFiles());
  const result = build.run();
  assert.equal(result.status, 0, result.stderr);
  const log = build.read("public/records/20260828/001/log.html");
  const session = build.read("public/records/20260828/001/session.html");
  assert.match(log, /id="log-heading"/);
  assert.doesNotMatch(log, /id="session-heading"|id="question-heading"|id="explanation-heading"/);
  assert.match(session, /id="session-heading"/);
  assert.doesNotMatch(session, /id="log-heading"|id="question-heading"|id="explanation-heading"/);
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

test("session, question, and answer are all required", (t) => {
  for (const name of ["session.md", "question.md", "answer.md"]) {
    const files = recordFiles();
    delete files[`content/records/20260828/001/${name}`];
    const build = fixture(t, files);
    const result = build.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`新形式の必須ファイルがありません: ${name.replace(".", "\\.")}`));
  }
});

test("conflicting classifications across the three documents fail the build", (t) => {
  const files = recordFiles();
  files["content/records/20260828/001/question.md"] = "<!--\nsubject: 数学B\ncategory: 数列\nsubcategory: 漸化式\n-->\n\n# Question";
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
