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
  const log = build.read("public/records/20260828/001/log.html");
  assert.deepEqual([...log.matchAll(/src="\.\/images\/([^"]+)"/g)].map((match) => match[1]), ordered);
  for (const file of ordered) {
    assert.equal(build.read(`public/records/20260828/001/images/${file}`), file);
  }
  assert.match(build.read("public/records/20260828/002/log.html"), /20260828-002f-1\.jpg/);
  assert.match(build.read("public/records/20260827/001/log.html"), /20260827-001r-1\.jpg/);
  assert.match(build.read("public/records/20260828/001/session.html"), /Unchanged content\./);
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
