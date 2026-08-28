const fs = require("fs");
const path = require("path");
const MarkdownIt = require("markdown-it");

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const imagesDir = path.join(publicDir, "images");
const recordsDir = path.join(publicDir, "records");
const contentRecordsDir = path.join(rootDir, "content", "records");
const contentQuestionDir = path.join(rootDir, "content", "question");
const publicQuestionDir = path.join(publicDir, "question");
const siteUrl = "https://sakurak02.github.io/math-study-log";
const gaMeasurementId = "G-LTZZZFVRKP";
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false
});

function gaTag() {
  return `
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${gaMeasurementId}');
</script>`;
}

fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(recordsDir, { recursive: true });
fs.mkdirSync(publicQuestionDir, { recursive: true });

/*
公開LOG画像: YYYYMMDD-NNNf-M.jpg / YYYYMMDD-NNNr-M.jpg
f = 最初の答案、r = 公開に採用した1回分の再挑戦答案。
Mはリトライ回数ではなく画像ページ番号。1枚でも必ず -1 を付ける。
*/

const imagePattern =
  /^(\d{4})(\d{2})(\d{2})-(\d{3})(f|r)-([1-9]\d*)\.jpg$/;

function isImageFile(entry) {
  return entry.isFile() && /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?|heic|svg)$/i.test(entry.name);
}

function validateRecordImage(file, sourcePath, expectedDate, expectedSequence) {
  const match = file.match(imagePattern);

  if (!match) {
    throw new Error(
      `LOG画像の命名形式が不正です: ${sourcePath}\n` +
      "新形式: YYYYMMDD-NNNf-M.jpg または YYYYMMDD-NNNr-M.jpg。" +
      "種別は小文字のf/rのみ、拡張子は.jpg、Mは1以上の整数（先頭の0なし）です。" +
      "1枚でもページ番号 -1 が必須です。旧命名形式は使用できません。"
    );
  }

  const imageDate = `${match[1]}${match[2]}${match[3]}`;
  if (expectedDate && imageDate !== expectedDate) {
    throw new Error(
      `LOG画像の日付が保存先と一致しません: ${sourcePath}\n` +
      `保存先の日付: ${expectedDate} / 画像名の日付: ${imageDate}`
    );
  }

  if (expectedSequence && match[4] !== expectedSequence) {
    throw new Error(
      `LOG画像の学習セット番号が保存先と一致しません: ${sourcePath}\n` +
      `保存先の学習セット番号: ${expectedSequence} / 画像名の学習セット番号: ${match[4]}`
    );
  }
}

function collectRecordImageSources() {
  const sources = new Map();

  // 従来の入力場所でも、旧形式や不正な画像名を黙って無視しない。
  for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true }).filter(isImageFile)) {
    const sourcePath = path.join(imagesDir, entry.name);
    validateRecordImage(entry.name, sourcePath);
    sources.set(entry.name, sourcePath);
  }

  if (!fs.existsSync(contentRecordsDir)) {
    return sources;
  }

  const dateDirectories = fs
    .readdirSync(contentRecordsDir, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name)
    );

  for (const dateEntry of dateDirectories) {
    const dateContentDir = path.join(contentRecordsDir, dateEntry.name);
    const studyDirectories = fs
      .readdirSync(dateContentDir, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name)
      );

    for (const studyEntry of studyDirectories) {
      const inputImagesDir = path.join(
        dateContentDir,
        studyEntry.name,
        "images"
      );

      if (!fs.existsSync(inputImagesDir)) {
        continue;
      }

      const inputImages = fs
        .readdirSync(inputImagesDir, { withFileTypes: true })
        .filter(isImageFile);

      for (const imageEntry of inputImages) {
        const sourcePath = path.join(inputImagesDir, imageEntry.name);
        validateRecordImage(
          imageEntry.name,
          sourcePath,
          dateEntry.name,
          studyEntry.name
        );
        const existingSourcePath = sources.get(imageEntry.name);

        if (existingSourcePath) {
          const source = fs.readFileSync(sourcePath);
          const existingSource = fs.readFileSync(existingSourcePath);

          if (!source.equals(existingSource)) {
            throw new Error(
              `同名で内容が異なるLOG画像があります: ${imageEntry.name}`
            );
          }

          continue;
        }

        sources.set(imageEntry.name, sourcePath);
      }
    }
  }

  return sources;
}

const imageSources = collectRecordImageSources();
const imageFiles = [...imageSources.keys()];

// 各答案は1ページ目から公開する。単独の -2 なども受け付けない。
for (const file of imageFiles) {
  const firstPage = file.replace(/-\d+\.jpg$/, "-1.jpg");
  if (!imageSources.has(firstPage)) {
    throw new Error(
      `LOG画像の1ページ目がありません: ${imageSources.get(file)}\n` +
      `必要な画像名: ${firstPage}。ページ番号はリトライ回数ではありません。`
    );
  }
}

/*
日付ごとに画像をまとめる
*/

const grouped = new Map();

for (const file of imageFiles) {
  const match = file.match(imagePattern);

  if (!match) continue;

  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const problemNumber = Number(match[4]);
  const imageStage = match[5];
  const imageNumber = BigInt(match[6]);

  if (!grouped.has(date)) {
    grouped.set(date, []);
  }

  grouped.get(date).push({
    file,
    problemNumber,
    imageNumber,
    imageStage
  });
}

/*
日付順・学習セット番号順・first→retry・画像ページ番号の数値順に整理
*/

const records = [...grouped.entries()]
  .map(([date, images]) => ({
    date,
    problemCount: new Set(
      images.map((item) => item.problemNumber)
    ).size,
    images: images
      .sort(
        (a, b) =>
          a.problemNumber - b.problemNumber ||
          ({ f: 0, r: 1 }[a.imageStage] -
            { f: 0, r: 1 }[b.imageStage]) ||
          (a.imageNumber < b.imageNumber ? -1 : a.imageNumber > b.imageNumber ? 1 : 0) ||
          a.file.localeCompare(b.file)
      )
      .map((item) => item.file)
  }))
  .sort((a, b) => a.date.localeCompare(b.date));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function problemCount(record) {
  return record.problemCount;
}

function levelClass(count) {
  if (count >= 6) return "level-4";
  if (count >= 4) return "level-3";
  if (count >= 2) return "level-2";
  if (count >= 1) return "level-1";
  return "";
}

function formatJapaneseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatDotDate(dateString) {
  return dateString.replace(/-/g, ".");
}

function dateKey(dateString) {
  return dateString.replace(/-/g, "");
}

function parseSessionFrontMatter(source) {
  const frontMatter = source.match(
    /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
  );

  if (!frontMatter) {
    return { title: null, markdown: source };
  }

  const titleLine = frontMatter[1]
    .split(/\r?\n/)
    .find((line) => /^title[ \t]*:/.test(line));
  let title = titleLine
    ? titleLine.replace(/^title[ \t]*:/, "").trim()
    : "";

  if (
    title.length >= 2 &&
    ((title.startsWith('"') && title.endsWith('"')) ||
      (title.startsWith("'") && title.endsWith("'")))
  ) {
    title = title.slice(1, -1).trim();
  }

  return {
    title,
    markdown: source.slice(frontMatter[0].length)
  };
}

function isValidPublicTitle(title) {
  return (
    typeof title === "string" &&
    title.trim() &&
    title.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(title)
  );
}

function sessionTitleFromMarkdown(session, record, study) {
  if (isValidPublicTitle(session.title)) {
    return session.title.trim();
  }

  const tokens = markdown.parse(session.markdown, {});
  const headingIndex = tokens.findIndex(
    (token) => token.type === "heading_open" && token.tag === "h1"
  );
  const heading = headingIndex >= 0
    ? tokens[headingIndex + 1]?.content
    : null;

  if (isValidPublicTitle(heading)) {
    return heading.trim();
  }

  return `${formatDotDate(record.date)} 学習記録 ${study.number}`;
}

function loadStudyContent(record, study) {
  const studyContentDir = path.join(
    contentRecordsDir,
    dateKey(record.date),
    study.number
  );
  const metaPath = path.join(studyContentDir, "meta.json");
  const sessionPath = path.join(studyContentDir, "session.md");
  const sessionSource = fs.existsSync(sessionPath)
    ? fs.readFileSync(sessionPath, "utf8")
    : "";
  const session = parseSessionFrontMatter(sessionSource);
  const allowedKeys = new Set([
    "studyId",
    "date",
    "sequence",
    "title"
  ]);

  const expectedStudyId = `${dateKey(record.date)}-${study.number}`;
  let title;

  if (fs.existsSync(metaPath)) {
    let meta;

    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (error) {
      throw new Error(`meta.jsonを読み込めません: ${metaPath}\n${error.message}`);
    }

    if (!meta || Array.isArray(meta) || typeof meta !== "object") {
      throw new Error(`meta.jsonはオブジェクトで指定してください: ${metaPath}`);
    }

    const unexpectedKeys = Object.keys(meta).filter(
      (key) => !allowedKeys.has(key)
    );

    if (unexpectedKeys.length > 0) {
      throw new Error(
        `meta.jsonに公開対象外の項目があります: ${unexpectedKeys.join(", ")}`
      );
    }

    if (meta.studyId !== expectedStudyId) {
      throw new Error(`studyIdが一致しません: ${metaPath}`);
    }

    if (meta.date !== record.date) {
      throw new Error(`dateが一致しません: ${metaPath}`);
    }

    if (meta.sequence !== study.number || !/^\d{3}$/.test(meta.sequence)) {
      throw new Error(`sequenceが一致しません: ${metaPath}`);
    }

    if (!isValidPublicTitle(meta.title)) {
      throw new Error(`公開タイトルが不正です: ${metaPath}`);
    }

    title = meta.title.trim();
  } else {
    if (!fs.existsSync(sessionPath)) {
      throw new Error(`session.mdがありません: ${sessionPath}`);
    }

    title = sessionTitleFromMarkdown(session, record, study);
  }

  return {
    ...study,
    id: expectedStudyId,
    title,
    sessionMarkdown: session.markdown
  };
}

function studiesForRecord(record) {
  const studies = new Map();

  for (const image of record.images) {
    const match = image.match(imagePattern);

    if (!match) continue;

    const number = match[4];

    if (!studies.has(number)) {
      studies.set(number, {
        id: `${dateKey(record.date)}-${number}`,
        number,
        title: "学習記録",
        images: []
      });
    }

    studies.get(number).images.push(image);
  }

  return [...studies.values()].map((study) =>
    loadStudyContent(record, study)
  );
}

function renderMarkdown(source, inlineDollarMath = false) {
  const mathBlocks = [];
  const mathPattern = inlineDollarMath
    ? /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)[^\r\n$]+?(?<!\\)\$/g
    : /\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$/g;
  const protectedSource = source.replace(
    mathPattern,
    (mathSource) => {
      const token = `MATHJAXTOKEN${mathBlocks.length}END`;
      mathBlocks.push({ token, source: mathSource });
      return token;
    }
  );

  let html = markdown.render(protectedSource);

  for (const mathBlock of mathBlocks) {
    html = html.replace(
      mathBlock.token,
      () => escapeHtml(mathBlock.source)
    );
  }

  return html;
}

function renderSessionMarkdown(study) {
  const allowedHtml = [];
  const protectHtml = (html) => {
    const token = `SESSIONHTMLTOKEN${allowedHtml.length}END`;
    allowedHtml.push({ token, html });
    return `\n\n${token}\n\n`;
  };
  const source = study.sessionMarkdown
    .trim()
    .replace(
      /^[ \t]*<summary>([^\r\n]*)<\/summary>[ \t]*$/gm,
      (_, label) => protectHtml(`<summary>${escapeHtml(label.trim())}</summary>`)
    )
    .replace(
      /^[ \t]*<details>[ \t]*$/gm,
      () => protectHtml("<details>")
    )
    .replace(
      /^[ \t]*<\/details>[ \t]*$/gm,
      () => protectHtml("</details>")
    );
  let html = renderMarkdown(source, true);

  for (const allowed of allowedHtml) {
    html = html.replace(
      new RegExp(`<p>${allowed.token}<\\/p>\\s*`, "g"),
      `${allowed.html}\n`
    );
  }

  return html;
}

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function loadQuestions() {
  if (!fs.existsSync(contentQuestionDir)) {
    return [];
  }

  return fs
    .readdirSync(contentQuestionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const slug = entry.name;
      const questionDir = path.join(contentQuestionDir, slug);
      const metaPath = path.join(questionDir, "meta.json");
      const articlePath = path.join(questionDir, "article.md");
      const questionImagesDir = path.join(questionDir, "images");
      const allowedKeys = new Set(["title", "date"]);

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(`QUESTIONのslugが不正です: ${slug}`);
      }

      if (!fs.existsSync(metaPath)) {
        throw new Error(`QUESTIONのmeta.jsonがありません: ${metaPath}`);
      }

      if (!fs.existsSync(articlePath)) {
        throw new Error(`QUESTIONのarticle.mdがありません: ${articlePath}`);
      }

      let meta;

      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      } catch (error) {
        throw new Error(`QUESTIONのmeta.jsonを読み込めません: ${metaPath}\n${error.message}`);
      }

      if (!meta || Array.isArray(meta) || typeof meta !== "object") {
        throw new Error(`QUESTIONのmeta.jsonはオブジェクトで指定してください: ${metaPath}`);
      }

      const unexpectedKeys = Object.keys(meta).filter(
        (key) => !allowedKeys.has(key)
      );

      if (unexpectedKeys.length > 0) {
        throw new Error(
          `QUESTIONのmeta.jsonに公開対象外の項目があります: ${unexpectedKeys.join(", ")}`
        );
      }

      if (
        typeof meta.title !== "string" ||
        !meta.title.trim() ||
        meta.title.length > 120 ||
        /[\u0000-\u001f\u007f]/.test(meta.title)
      ) {
        throw new Error(`QUESTIONの公開タイトルが不正です: ${metaPath}`);
      }

      if (!isValidDateString(meta.date)) {
        throw new Error(`QUESTIONの日付が不正です: ${metaPath}`);
      }

      const questionImages = fs.existsSync(questionImagesDir)
        ? fs
            .readdirSync(questionImagesDir, { withFileTypes: true })
            .filter(
              (imageEntry) =>
                imageEntry.isFile() &&
                /\.(?:jpe?g|png|gif|webp)$/i.test(imageEntry.name)
            )
            .map((imageEntry) => imageEntry.name)
            .sort((a, b) =>
              a.localeCompare(b, "ja", { numeric: true })
            )
        : [];

      return {
        slug,
        title: meta.title.trim(),
        date: meta.date,
        articleMarkdown: fs.readFileSync(articlePath, "utf8"),
        images: questionImages,
        sourceImagesDir: questionImagesDir
      };
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.slug.localeCompare(b.slug)
    );
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

/*
最新日から何日連続で記録しているか
*/

function currentStreak(sortedRecords) {
  if (!sortedRecords.length) return 0;

  const dates = sortedRecords
    .map((record) => record.date)
    .sort()
    .reverse();

  let streak = 1;

  for (let i = 0; i < dates.length - 1; i++) {
    const current = new Date(`${dates[i]}T00:00:00`);
    const previous = new Date(`${dates[i + 1]}T00:00:00`);

    const difference = Math.round(
      (current - previous) / (1000 * 60 * 60 * 24)
    );

    if (difference === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/*
月間カレンダー
*/

function createMonthCalendar(year, month, monthRecords) {
  const recordMap = new Map(
    monthRecords.map((record) => [
      Number(record.date.slice(8, 10)),
      record
    ])
  );

  const totalDays = daysInMonth(year, month);
  const start = firstWeekday(year, month);

  let cells = `
      <div class="day-header">日</div>
      <div class="day-header">月</div>
      <div class="day-header">火</div>
      <div class="day-header">水</div>
      <div class="day-header">木</div>
      <div class="day-header">金</div>
      <div class="day-header">土</div>
`;

  for (let i = 0; i < start; i++) {
    cells += `      <div class="day-cell empty"></div>\n`;
  }

  for (let day = 1; day <= totalDays; day++) {
    const record = recordMap.get(day);

    if (record) {
      const count = problemCount(record);

      cells += `      <a href="./records/${dateKey(record.date)}/index.html" class="day-cell ${levelClass(
        count
      )}"><span class="day-number">${day}</span><span class="day-count">${count}問</span></a>\n`;
    } else {
      cells += `      <div class="day-cell empty"><span class="day-number">${day}</span></div>\n`;
    }
  }

  return cells;
}

/*
トップページ
*/

function createIndexPage() {
  const latest =
    records.length > 0 ? records[records.length - 1] : null;

  const months = new Map();

  for (const record of records) {
    const key = record.date.slice(0, 7);

    if (!months.has(key)) {
      months.set(key, []);
    }

    months.get(key).push(record);
  }

  const monthSections = [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, monthRecords]) => {
      const [year, month] = key.split("-").map(Number);

      return `
  <section class="month-section">
    <div class="month-head">
      <div class="month-title">${year}年${month}月</div>
    </div>

    <div class="calendar-grid">
${createMonthCalendar(year, month, monthRecords)}
    </div>

    <div class="legend">
      <span>少</span>
      <span class="legend-box" style="background:var(--level-1)"></span>
      <span class="legend-box" style="background:var(--level-2)"></span>
      <span class="legend-box" style="background:var(--level-3)"></span>
      <span class="legend-box" style="background:var(--level-4);border-color:var(--level-4)"></span>
      <span>多</span>
    </div>
  </section>`;
    })
    .join("\n");

  const displayYear = latest
    ? latest.date.slice(0, 4)
    : new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>数学学習記録 | Math Study Log</title>

${gaTag()}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<style>
:root {
  --bg: #fbfcfc;
  --panel: #ffffff;
  --line: #dfe7e7;
  --ink: #192323;
  --ink-soft: #6b7777;
  --accent: #315f63;
  --level-1: #e8f0f0;
  --level-2: #c9dddd;
  --level-3: #8fb4b5;
  --level-4: #315f63;
  --empty: #f5f7f7;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  background: var(--bg);
  color: var(--ink);
  font-family: "Noto Sans JP", sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

header {
  border-bottom: 1px solid var(--line);
  padding: 20px 24px 18px;
  background: rgba(255, 255, 255, 0.88);
}

.header-inner {
  max-width: 940px;
  margin: 0 auto;
}

.header-title {
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
  margin-bottom: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.header-date {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

main {
  max-width: 940px;
  margin: 0 auto;
  padding: 24px 24px 42px;
}

.month-section {
  margin-bottom: 26px;
}

.month-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.month-title {
  font-size: 17px;
  font-weight: 700;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 5px;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  font-size: 10px;
  font-weight: 600;
  color: var(--ink-soft);
}

.day-cell {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
  color: var(--ink);
  text-decoration: none;
  transition: 0.18s ease;
  overflow: hidden;
}

.day-cell:not(.empty):hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.day-cell.empty {
  background: var(--empty);
  color: #a5adad;
}

.day-number {
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  font-weight: 600;
}

.day-count {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  opacity: 0.78;
  white-space: nowrap;
}

.level-1 {
  background: var(--level-1);
}

.level-2 {
  background: var(--level-2);
}

.level-3 {
  background: var(--level-3);
  color: #102425;
  border-color: #82aaaa;
}

.level-4 {
  background: var(--level-4);
  color: #fff;
  border-color: var(--level-4);
}

.level-4 .day-count {
  opacity: 0.86;
}

.legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 9px;
  color: var(--ink-soft);
  font-size: 10px;
}

.legend-box {
  width: 18px;
  height: 10px;
  border-radius: 3px;
  border: 1px solid var(--line);
}

.section-divider {
  border-top: 1px solid var(--line);
  margin: 28px 0;
}

.entry-nav {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.entry-card {
  display: block;
  padding: 15px 16px 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel);
  color: var(--ink);
  text-decoration: none;
  transition: 0.18s ease;
}

.entry-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}

.entry-kicker,
.about-kicker,
.about-start,
.total-label,
.total-value {
  font-family: "JetBrains Mono", monospace;
}

.entry-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--accent);
  text-align: center;
}

.about-section {
  max-width: 720px;
}

.about-kicker {
  font-size: 11px;
  letter-spacing: 0.1em;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 7px;
}

.about-title {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
  margin-bottom: 5px;
}

.about-start {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
  margin-bottom: 14px;
}

.about-text {
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-soft);
}

.total-section {
  border-top: 1px solid var(--line);
  padding-top: 18px;
  margin-top: 28px;
}

.total-label {
  font-size: 11px;
  color: var(--ink-soft);
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}

.total-value {
  font-size: 16px;
  font-weight: 600;
}

footer {
  border-top: 1px solid var(--line);
  padding: 18px 24px;
  text-align: center;
  font-size: 11px;
  color: var(--ink-soft);
}

@media (max-width: 600px) {
  header {
    padding: 16px;
  }

  main {
    padding: 18px 12px 32px;
  }

  .header-date {
    font-size: 23px;
  }

  .calendar-grid {
    gap: 4px;
  }

  .day-cell {
    height: 42px;
    padding: 0 6px;
    border-radius: 6px;
    flex-direction: column;
    justify-content: center;
    gap: 0;
  }

  .day-number {
    font-size: 12px;
    line-height: 1.2;
  }

  .day-count {
    font-size: 8px;
    line-height: 1.15;
  }

  .entry-nav {
    grid-template-columns: 1fr;
  }

  .entry-card {
    padding: 12px 13px;
  }

  .about-title {
    font-size: 18px;
  }
}
</style>
</head>

<body>

<header>
  <div class="header-inner">
    <div class="header-title">MATH STUDY LOG</div>
    <div class="header-date">数学学習記録</div>
  </div>
</header>

<main>

${monthSections}

  <div class="section-divider"></div>

  <nav class="entry-nav" aria-label="学習記録メニュー">
    <a class="entry-card" href="./log/index.html">
      <div class="entry-kicker">LOG</div>
    </a>
    <a class="entry-card" href="./session/index.html">
      <div class="entry-kicker">SESSION</div>
    </a>
    <a class="entry-card" href="./question/index.html">
      <div class="entry-kicker">QUESTION</div>
    </a>
  </nav>

  <div class="section-divider"></div>

  <section class="about-section">
    <div class="about-kicker">ABOUT THIS STUDY</div>
    <div class="about-title">64歳から、5年後の難関大受験数学へ。</div>
    <div class="about-start">STARTED AUGUST 2026</div>
    <p class="about-text">
      数学IIIはほぼ未修。数学II・Bも久しぶりの学習です。<br>
      ここから、初見問題に対して仮説を立て、試し、間違いを修正し、別の見方へ切り替えられる力を育てていきます。<br><br>
      LOGは学習の跡、SESSIONは一つの学習テーマの振り返り、QUESTIONは自由な数学の疑問。
    </p>
  </section>

  <section class="total-section">
    <div class="total-label">TOTAL STUDY DAYS</div>
    <div class="total-value">${records.length} days</div>
  </section>

</main>

<footer>
  Math Study Log © ${displayYear}
</footer>

</body>
</html>`;
}

/*
日別ページ
*/

function createLogPage(record, study) {
  const imageItems = study.images
    .map(
      (image, imageIndex) => `
    <div class="study-item">
      <img
        class="sheet"
        src="./images/${encodeURIComponent(image)}"
        alt="${escapeHtml(formatDotDate(record.date))} 学習記録 画像${imageIndex + 1}"
        onclick="openLightbox(this)"
      >
    </div>`
    )
    .join("\n");

  const displayYear = record.date.slice(0, 4);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<title>LOG | ${escapeHtml(study.title)} - ${formatJapaneseDate(record.date)}</title>

${gaTag()}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<style>
:root {
  --bg: #fbfcfc;
  --paper: #ffffff;
  --ink: #192323;
  --ink-soft: #6b7777;
  --line: #dfe7e7;
  --green-1: #e8f0f0;
  --green-2: #c9dddd;
  --green-3: #8fb4b5;
  --green-4: #315f63;
  --green-dark: #315f63;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  background: var(--bg);
  color: var(--ink);
  font-family: "Noto Sans JP", sans-serif;
  line-height: 1.65;
}

body {
  min-height: 100vh;
}

header {
  border-bottom: 1px solid var(--line);
  padding: 22px 24px 14px;
  background: rgba(255, 255, 255, 0.9);
}

.header-inner,
main,
footer {
  width: min(900px, calc(100% - 32px));
  margin: 0 auto;
}

.eyebrow {
  font-family: "JetBrains Mono", monospace;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 11px;
  color: var(--ink-soft);
  margin-bottom: 4px;
}

.date {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.meta {
  display: inline-flex;
  align-items: center;
  margin-top: 7px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--green-1);
  color: var(--green-dark);
  font-size: 11px;
  font-family: "JetBrains Mono", monospace;
}

main {
  padding: 24px 0 34px;
}

.page-links {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 18px;
}

.back-link {
  display: inline-block;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  color: var(--green-dark);
  text-decoration: none;
  font-size: 12px;
}

.back-link:hover {
  border-color: var(--green-dark);
}

.study-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.study-item {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}

.sheet {
  width: 100%;
  height: auto;
  display: block;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(27, 49, 35, 0.035);
  cursor: zoom-in;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.sheet:hover {
  transform: translateY(-1px);
  border-color: #b8cdbf;
  box-shadow: 0 5px 15px rgba(27, 49, 35, 0.07);
}

.sheet-label {
  font-family: "JetBrains Mono", monospace;
  font-size: 10px;
  color: var(--ink-soft);
  padding-left: 2px;
}

.nav-section {
  margin-top: 28px;
  padding: 14px 14px 0;
  border-top: 1px solid var(--line);
  border-radius: 8px 8px 0 0;
  background: linear-gradient(
    180deg,
    rgba(228, 239, 232, 0.62),
    rgba(228, 239, 232, 0)
  );
}

.nav-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 14px;
}

.nav-link {
  color: var(--green-dark);
  text-decoration: none;
  font-size: 12px;
}

.nav-link:hover {
  text-decoration: underline;
}

.nav-link.next {
  text-align: right;
}

.nav-center {
  color: var(--ink-soft);
  text-decoration: none;
  font-size: 11px;
}

.nav-center:hover {
  color: var(--green-dark);
}

footer {
  margin-top: 6px;
  padding: 15px 0 20px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-soft);
  background: var(--paper);
}

/* 画像拡大 */

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(12, 20, 15, 0.82);
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 20;
}

.lightbox.open {
  display: flex;
}

.lightbox img {
  max-width: 94vw;
  max-height: 92vh;
  width: auto;
  height: auto;
  border-radius: 8px;
  background: #fff;
  cursor: zoom-out;
}

@media (max-width: 650px) {
  header {
    padding: 16px 12px 11px;
  }

  .header-inner,
  main,
  footer {
    width: calc(100% - 20px);
  }

  .date {
    font-size: 22px;
  }

  main {
    padding-top: 16px;
  }

  .study-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .sheet {
    border-radius: 5px;
  }

  .nav-row {
    grid-template-columns: 1fr 1fr;
  }

  .nav-center {
    grid-column: 1 / -1;
    grid-row: 2;
    text-align: center;
    margin-top: 4px;
  }
}
</style>
</head>

<body>

<header>
  <div class="header-inner">
    <div class="eyebrow">LOG</div>
    <div class="date">${escapeHtml(study.title)}</div>
    <div class="meta">${formatDotDate(record.date)}</div>
  </div>
</header>

<main>

  <nav class="page-links" aria-label="ページメニュー">
    <a class="back-link" href="../../../index.html">TOP</a>
    <a class="back-link" href="./session.html" target="_blank" rel="noopener noreferrer">SESSION ↗</a>
  </nav>

  <section class="study-grid">
${imageItems}
  </section>

</main>

<footer>
  Math Study Log © ${displayYear}
</footer>

<div
  class="lightbox"
  id="lightbox"
  onclick="closeLightbox()"
>
  <img
    id="lightboxImage"
    src=""
    alt=""
  >
</div>

<script>
function openLightbox(element) {
  const image =
    document.getElementById("lightboxImage");

  image.src = element.src;
  image.alt = element.alt;

  document
    .getElementById("lightbox")
    .classList
    .add("open");
}

function closeLightbox() {
  document
    .getElementById("lightbox")
    .classList
    .remove("open");
}

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeLightbox();
    }
  }
);
</script>

</body>
</html>`;
}

function createSimpleRecordPage({
  documentTitle,
  kicker,
  title,
  date = "",
  actions,
  content,
  displayYear,
  headExtra = "",
  bodyScripts = "",
  extraStyles = ""
}) {
  const dateHtml = date
    ? `<div class="page-date">${escapeHtml(date)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(documentTitle)}</title>

${gaTag()}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">${headExtra ? `\n${headExtra}` : ""}

<style>
:root {
  --bg: #fbfcfc;
  --panel: #ffffff;
  --line: #dfe7e7;
  --ink: #192323;
  --ink-soft: #6b7777;
  --accent: #315f63;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  background: var(--bg);
  color: var(--ink);
  font-family: "Noto Sans JP", sans-serif;
  line-height: 1.7;
}

header {
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
}

.header-inner,
main {
  width: min(900px, calc(100% - 32px));
  margin: 0 auto;
}

.header-inner {
  padding: 22px 0 16px;
}

.page-kicker,
.page-date,
.record-number {
  font-family: "JetBrains Mono", monospace;
}

.page-kicker {
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

h1 {
  margin-top: 3px;
  font-size: 24px;
  line-height: 1.45;
}

.page-date {
  margin-top: 4px;
  color: var(--ink-soft);
  font-size: 11px;
  letter-spacing: 0.06em;
}

main {
  min-height: calc(100vh - 164px);
  padding: 24px 0 42px;
}

.page-actions,
.record-links,
.day-navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
}

.page-actions {
  margin-bottom: 24px;
}

.text-link {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
  color: var(--accent);
  text-decoration: none;
  font: 600 11px/1.3 "JetBrains Mono", monospace;
}

.text-link:hover {
  border-color: var(--accent);
}

.record-list {
  border-top: 1px solid var(--line);
}

.record-item {
  display: grid;
  grid-template-columns: 72px 1fr auto;
  align-items: center;
  gap: 18px;
  padding: 18px 2px;
  border-bottom: 1px solid var(--line);
}

.record-number {
  color: var(--ink-soft);
  font-size: 12px;
}

.record-title {
  font-size: 15px;
  font-weight: 600;
}

.record-links .text-link {
  min-height: 32px;
}

.day-navigation {
  justify-content: space-between;
  margin-top: 24px;
}

.session-shell {
  min-height: 160px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.move-notice {
  padding: 28px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 14px;
}

.move-notice .text-link {
  margin-top: 16px;
}

footer {
  border-top: 1px solid var(--line);
  padding: 18px 24px;
  background: var(--panel);
  color: var(--ink-soft);
  text-align: center;
  font-size: 11px;
}${extraStyles ? `\n${extraStyles}` : ""}

@media (max-width: 600px) {
  .header-inner,
  main {
    width: calc(100% - 24px);
  }

  .header-inner {
    padding: 17px 0 13px;
  }

  h1 {
    font-size: 21px;
  }

  main {
    padding-top: 19px;
  }

  .record-item {
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 16px 1px;
  }
}
</style>
</head>

<body>

<header>
  <div class="header-inner">
    <div class="page-kicker">${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(title)}</h1>
${dateHtml}
  </div>
</header>

<main>
  <nav class="page-actions" aria-label="ページメニュー">
    ${actions}
  </nav>

  ${content}
</main>

<footer>Math Study Log © ${escapeHtml(displayYear)}</footer>${bodyScripts ? `\n${bodyScripts}` : ""}

</body>
</html>`;
}

function createRecordIndexPage(record, index) {
  const studies = studiesForRecord(record);
  const previous = index > 0 ? records[index - 1] : null;
  const next = index < records.length - 1 ? records[index + 1] : null;

  const studyItems = studies
    .map(
      (study) => `
    <article class="record-item">
      <div class="record-number">${escapeHtml(study.number)}</div>
      <div class="record-title">${escapeHtml(study.title)}</div>
      <nav class="record-links" aria-label="${escapeHtml(study.number)} 学習記録">
        <a class="text-link" href="./${encodeURIComponent(study.number)}/log.html">LOG</a>
        <a class="text-link" href="./${encodeURIComponent(study.number)}/session.html">SESSION</a>
      </nav>
    </article>`
    )
    .join("\n");

  const previousLink = previous
    ? `<a class="text-link" href="../${dateKey(previous.date)}/index.html">← ${formatDotDate(previous.date)}</a>`
    : `<span></span>`;

  const nextLink = next
    ? `<a class="text-link" href="../${dateKey(next.date)}/index.html">${formatDotDate(next.date)} →</a>`
    : `<span></span>`;

  return createSimpleRecordPage({
    documentTitle: `${formatJapaneseDate(record.date)} | 数学学習記録`,
    kicker: "MATH STUDY LOG",
    title: formatDotDate(record.date),
    actions: `<a class="text-link" href="../../index.html">TOP</a>`,
    content: `<section class="record-list">${studyItems}\n  </section>\n  <nav class="day-navigation" aria-label="学習日の移動">${previousLink}${nextLink}</nav>`,
    displayYear: record.date.slice(0, 4)
  });
}

function sessionPageStyles() {
  return `.session-content {
  padding: 4px 0 24px;
  border-top: 1px solid var(--line);
  overflow-wrap: anywhere;
}

.session-content > *:first-child {
  margin-top: 22px;
}

.session-content h2 {
  margin: 34px 0 14px;
  color: var(--accent);
  font-size: 17px;
  line-height: 1.55;
}

.session-content h3 {
  margin: 26px 0 10px;
  font-size: 15px;
}

.session-content p,
.session-content ul,
.session-content ol,
.session-content blockquote,
.session-content pre,
.session-content table {
  margin: 0 0 18px;
}

.session-content ul,
.session-content ol {
  padding-left: 1.5em;
}

.session-content blockquote {
  padding: 10px 14px;
  border-left: 3px solid var(--accent);
  background: var(--panel);
  color: var(--ink-soft);
}

.session-content pre {
  max-width: 100%;
  padding: 13px 14px;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
  font: 12px/1.7 "JetBrains Mono", monospace;
}

.session-content code {
  font-family: "JetBrains Mono", monospace;
}

.session-content table {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  border-collapse: collapse;
}

.session-content th,
.session-content td {
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  text-align: left;
}

.session-content th {
  background: #e8f0f0;
}

.session-content img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 20px auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.session-content a {
  color: var(--accent);
}

mjx-container[display="true"] {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0;
}`;
}

function mathJaxHead(inlineDollarMath = false) {
  const inlineMath = inlineDollarMath
    ? `[["\\\\(", "\\\\)"], ["$", "$"]]`
    : `[["\\\\(", "\\\\)"]]`;

  return `<script>
window.MathJax = {
  tex: {
    inlineMath: ${inlineMath},
    displayMath: [["\\\\[", "\\\\]"], ["$$", "$$"]]
  },
  options: {
    skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
  }
};
</script>
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>`;
}

function createSessionPage(record, study) {
  return createSimpleRecordPage({
    documentTitle: `SESSION | ${study.title} - ${formatJapaneseDate(record.date)}`,
    kicker: "SESSION",
    title: study.title,
    date: formatDotDate(record.date),
    actions: `<a class="text-link" href="../../../index.html">TOP</a>\n    <a class="text-link" href="./log.html" target="_blank" rel="noopener noreferrer">LOG ↗</a>`,
    content: `<article class="session-content">${renderSessionMarkdown(study)}</article>`,
    displayYear: record.date.slice(0, 4),
    headExtra: mathJaxHead(true),
    extraStyles: sessionPageStyles()
  });
}

function createLegacyRecordPage(record) {
  const newUrl = `./${dateKey(record.date)}/index.html`;

  return createSimpleRecordPage({
    documentTitle: `${formatJapaneseDate(record.date)} | 数学学習記録`,
    kicker: "MATH STUDY LOG",
    title: formatDotDate(record.date),
    actions: `<a class="text-link" href="../index.html">TOP</a>`,
    content: `<section class="move-notice">\n    <p>この記録は新しいページへ移動しました。</p>\n    <a class="text-link" href="${newUrl}">新しいページへ</a>\n  </section>`,
    displayYear: record.date.slice(0, 4)
  });
}

function archivePageStyles() {
  return `.archive-list {
  border-top: 1px solid var(--line);
}

.archive-item {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 18px;
  padding: 16px 2px;
  border-bottom: 1px solid var(--line);
}

.archive-date {
  color: var(--ink-soft);
  font: 500 12px/1.5 "JetBrains Mono", monospace;
}

.archive-title {
  color: var(--ink);
  text-decoration: none;
  font-size: 15px;
  font-weight: 600;
}

.archive-title:hover {
  color: var(--accent);
}

@media (max-width: 600px) {
  .archive-item {
    grid-template-columns: 1fr;
    gap: 3px;
    padding: 14px 1px;
  }
}`;
}

function questionPageStyles() {
  return `${sessionPageStyles().replaceAll(
    ".session-content",
    ".question-content"
  )}

.question-log-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin: 4px 0 28px;
}

.question-log-item {
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.question-log-item img {
  width: 100%;
  margin: 0;
}

@media (max-width: 650px) {
  .question-log-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}`;
}

function renderQuestionMarkdown(question) {
  const source = question.articleMarkdown.trim();
  const imageGrid = question.images.length > 0
    ? `
  <div class="question-log-grid" aria-label="QUESTION LOG画像">
${question.images
  .map(
    (image, index) => `    <figure class="question-log-item">
      <img src="./${encodeURIComponent(question.slug)}/images/${encodeURIComponent(image)}" alt="${escapeHtml(question.title)} LOG画像${index + 1}">
    </figure>`
  )
  .join("\n")}
  </div>`
    : "";

  let html;

  if (!imageGrid) {
    html = renderMarkdown(source);
  } else {
    const logHeading = source.match(/^##[ \t]+LOG.*$/im);

    if (logHeading) {
      const lineEnd = source.indexOf("\n", logHeading.index);
      const splitIndex = lineEnd === -1 ? source.length : lineEnd + 1;
      html = `${renderMarkdown(source.slice(0, splitIndex))}${imageGrid}${renderMarkdown(source.slice(splitIndex))}`;
    } else {
      html = `${imageGrid}${renderMarkdown(source)}`;
    }
  }

  return html.replace(
    /(<img\b[^>]*\bsrc=")\.\/images\//g,
    `$1./${encodeURIComponent(question.slug)}/images/`
  );
}

function createQuestionPage(question) {
  return createSimpleRecordPage({
    documentTitle: `QUESTION | ${question.title}`,
    kicker: "QUESTION",
    title: question.title,
    date: formatDotDate(question.date),
    actions: `<a class="text-link" href="../index.html">TOP</a>`,
    content: `<article class="question-content">${renderQuestionMarkdown(question)}</article>`,
    displayYear: question.date.slice(0, 4),
    headExtra: mathJaxHead(),
    extraStyles: questionPageStyles()
  });
}

function createQuestionIndexPage(questions) {
  const items = questions
    .map(
      (question) => `
    <article class="archive-item">
      <div class="archive-date">${formatDotDate(question.date)}</div>
      <a class="archive-title" href="./${encodeURIComponent(question.slug)}.html">${escapeHtml(question.title)}</a>
    </article>`
    )
    .join("\n");

  return createSimpleRecordPage({
    documentTitle: "QUESTION | 数学学習記録",
    kicker: "MATH STUDY LOG",
    title: "QUESTION",
    actions: `<a class="text-link" href="../index.html">TOP</a>`,
    content: `<section class="archive-list">${items}\n  </section>`,
    displayYear: questions.length > 0
      ? questions[0].date.slice(0, 4)
      : new Date().getFullYear(),
    extraStyles: archivePageStyles()
  });
}

function createArchivePage(kind, entries) {
  const pageName = kind.toUpperCase();
  const fileName = kind.toLowerCase();
  const items = entries
    .map(
      ({ record, study }) => `
    <div class="archive-item">
      <div class="archive-date">${formatDotDate(record.date)}</div>
      <a class="archive-title" href="../records/${dateKey(record.date)}/${encodeURIComponent(study.number)}/${fileName}.html">${escapeHtml(study.title)}</a>
    </div>`
    )
    .join("\n");

  return createSimpleRecordPage({
    documentTitle: `${pageName} | 数学学習記録`,
    kicker: "MATH STUDY LOG",
    title: pageName,
    actions: `<a class="text-link" href="../index.html">TOP</a>`,
    content: `<section class="archive-list">${items}\n  </section>`,
    displayYear: records.length > 0
      ? records[records.length - 1].date.slice(0, 4)
      : new Date().getFullYear(),
    extraStyles: archivePageStyles()
  });
}

const questions = loadQuestions();

/*
トップページ生成
*/

fs.writeFileSync(
  path.join(publicDir, "index.html"),
  createIndexPage(),
  "utf8"
);

/*
recordsページ生成
*/

const archiveEntries = records
  .flatMap((record) =>
    studiesForRecord(record).map((study) => ({ record, study }))
  )
  .sort(
    (a, b) =>
      b.record.date.localeCompare(a.record.date) ||
      b.study.number.localeCompare(a.study.number)
  );

records.forEach((record, index) => {
  const recordDir = path.join(recordsDir, dateKey(record.date));
  const studies = studiesForRecord(record);

  fs.mkdirSync(recordDir, { recursive: true });

  fs.writeFileSync(
    path.join(recordDir, "index.html"),
    createRecordIndexPage(record, index),
    "utf8"
  );

  for (const study of studies) {
    const studyDir = path.join(recordDir, study.number);
    const studyImagesDir = path.join(studyDir, "images");

    fs.mkdirSync(studyImagesDir, { recursive: true });

    for (const image of study.images) {
      fs.copyFileSync(
        imageSources.get(image),
        path.join(studyImagesDir, image)
      );
    }

    fs.writeFileSync(
      path.join(studyDir, "log.html"),
      createLogPage(record, study),
      "utf8"
    );

    fs.writeFileSync(
      path.join(studyDir, "session.html"),
      createSessionPage(record, study),
      "utf8"
    );
  }

  fs.writeFileSync(
    path.join(recordsDir, `${record.date}.html`),
    createLegacyRecordPage(record),
    "utf8"
  );
});

fs.writeFileSync(
  path.join(publicDir, "log", "index.html"),
  createArchivePage("log", archiveEntries),
  "utf8"
);

fs.writeFileSync(
  path.join(publicDir, "session", "index.html"),
  createArchivePage("session", archiveEntries),
  "utf8"
);

/*
QUESTIONページ生成
*/

for (const question of questions) {
  const questionAssetsDir = path.join(
    publicQuestionDir,
    question.slug,
    "images"
  );

  if (question.images.length > 0) {
    fs.mkdirSync(questionAssetsDir, { recursive: true });

    for (const image of question.images) {
      fs.copyFileSync(
        path.join(question.sourceImagesDir, image),
        path.join(questionAssetsDir, image)
      );
    }
  }

  fs.writeFileSync(
    path.join(publicQuestionDir, `${question.slug}.html`),
    createQuestionPage(question),
    "utf8"
  );
}

fs.writeFileSync(
  path.join(publicQuestionDir, "index.html"),
  createQuestionIndexPage(questions),
  "utf8"
);

/*
sitemap.xml を自動生成
*/

const sitemapUrls = [
  `${siteUrl}/`,
  `${siteUrl}/log/`,
  `${siteUrl}/session/`,
  `${siteUrl}/question/`,
  ...records.map(
    (record) => `${siteUrl}/records/${dateKey(record.date)}/`
  ),
  ...archiveEntries.flatMap(({ record, study }) => [
    `${siteUrl}/records/${dateKey(record.date)}/${study.number}/log.html`,
    `${siteUrl}/records/${dateKey(record.date)}/${study.number}/session.html`
  ]),
  ...questions.map(
    (question) => `${siteUrl}/question/${question.slug}.html`
  )
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map(
    (url) => `  <url>
    <loc>${url}</loc>
  </url>`
  )
  .join("\n")}
</urlset>
`;

fs.writeFileSync(
  path.join(publicDir, "sitemap.xml"),
  sitemap,
  "utf8"
);

/*
robots.txt を自動生成
*/

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

fs.writeFileSync(
  path.join(publicDir, "robots.txt"),
  robots,
  "utf8"
);

console.log("");
console.log("Math Study Log build complete.");
console.log(`Study days : ${records.length}`);
console.log(
  `Problems   : ${records.reduce(
    (total, record) => total + problemCount(record),
    0
  )}`
);
console.log(`Images     : ${imageFiles.length}`);
console.log(`Questions  : ${questions.length}`);
console.log("");
