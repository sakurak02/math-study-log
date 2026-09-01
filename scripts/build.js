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
const siteName = "Math Study Log";
const defaultDescription =
  "64歳から数学を学び直す学習記録。間違い・迷い・修正までそのまま残しています。";
const siteOgImageUrl = `${siteUrl}/og-image.png`;
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
公開LOG画像: YYYYMMDD-NNNf[-M].jpg / YYYYMMDD-NNNr[-M].jpg
f = 最初の答案、r = 公開に採用した1回分の再挑戦答案。
Mはリトライ回数ではなく画像ページ番号。1枚だけなら省略できる。
*/

const imagePattern =
  /^(\d{4})(\d{2})(\d{2})-(\d{3})(f|r)(?:-([1-9]\d*))?\.jpg$/;

function isImageFile(entry) {
  return entry.isFile() && /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?|heic|svg)$/i.test(entry.name);
}

function validateRecordImage(file, sourcePath, expectedDate, expectedSequence) {
  const match = file.match(imagePattern);

  if (!match) {
    throw new Error(
      `LOG画像の命名形式が不正です: ${sourcePath}\n` +
      "形式: YYYYMMDD-NNNf[-M].jpg または YYYYMMDD-NNNr[-M].jpg。" +
      "種別は小文字のf/rのみ、拡張子は.jpg、Mは1以上の整数（先頭の0なし）です。" +
      "複数ページの場合は -1 から始めてください。"
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

// 各答案は「枝番なし1枚」または「-1から始まる複数ページ」のどちらかに統一する。
for (const file of imageFiles) {
  const match = file.match(imagePattern);
  const stem = file.replace(/(?:-\d+)?\.jpg$/, "");
  const unnumbered = `${stem}.jpg`;
  const firstPage = `${stem}-1.jpg`;

  if (match[6] && !imageSources.has(firstPage)) {
    throw new Error(
      `LOG画像の1ページ目がありません: ${imageSources.get(file)}\n` +
      `必要な画像名: ${firstPage}。ページ番号はリトライ回数ではありません。`
    );
  }

  if (match[6] && imageSources.has(unnumbered)) {
    throw new Error(
      `枝番なし画像とページ番号付き画像は併用できません: ${unnumbered} / ${file}`
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
  const imageNumber = match[6] ? BigInt(match[6]) : 1n;

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

function truncateDescription(value, maxLength = 140) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

function descriptionFromMarkdown(source) {
  if (!source?.trim()) return "";

  const tokens = markdown.parse(source, {});

  for (let index = 0; index < tokens.length - 1; index++) {
    if (tokens[index].type !== "paragraph_open") continue;

    const inline = tokens[index + 1];
    if (inline?.type !== "inline") continue;

    const text = (inline.children || [])
      .map((child) => {
        if (["text", "code_inline"].includes(child.type)) return child.content;
        if (["softbreak", "hardbreak"].includes(child.type)) return " ";
        return "";
      })
      .join("");
    const description = truncateDescription(text);

    if (description) return description;
  }

  return "";
}

function descriptionForStudy(study) {
  const sources = [
    study.sessionMarkdown,
    study.stageSessions.f?.markdown,
    study.stageSessions.r?.markdown,
    study.retryExtraSession?.markdown
  ];

  for (const source of sources) {
    const description = descriptionFromMarkdown(source);
    if (description) return description;
  }

  return defaultDescription;
}

function imageMetadata(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;

  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (
    extension === ".png" &&
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      type: "image/png"
    };
  }

  if (
    [".jpg", ".jpeg"].includes(extension) &&
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8
  ) {
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf
    ]);
    let offset = 2;

    while (offset < buffer.length) {
      while (offset < buffer.length && buffer[offset] === 0xff) offset++;
      if (offset >= buffer.length) break;

      const marker = buffer[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;

      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;

      if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
        return {
          width: buffer.readUInt16BE(offset + 5),
          height: buffer.readUInt16BE(offset + 3),
          type: "image/jpeg"
        };
      }

      offset += segmentLength;
    }
  }

  return null;
}

function socialMetaTags({
  title,
  description,
  url,
  image,
  type = "article",
  imageMeta = null
}) {
  const values = { title, description, url, image };

  for (const [name, value] of Object.entries(values)) {
    if (!value) throw new Error(`SNSメタタグの${name}が空です`);
  }

  const imageMetaTags = imageMeta
    ? `
<meta property="og:image:width" content="${escapeHtml(imageMeta.width)}">
<meta property="og:image:height" content="${escapeHtml(imageMeta.height)}">
<meta property="og:image:type" content="${escapeHtml(imageMeta.type)}">`
    : "";

  return `<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta property="og:type" content="${escapeHtml(type)}">
<meta property="og:image" content="${escapeHtml(image)}">${imageMetaTags}
<meta property="og:image:alt" content="${escapeHtml(title)}">
<meta property="og:site_name" content="${siteName}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta name="twitter:image:alt" content="${escapeHtml(title)}">`;
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
  const stageSessions = Object.fromEntries(["f", "r"].map((stage) => {
    const stagePath = path.join(studyContentDir, `session-${stage}.md`);
    return [stage, fs.existsSync(stagePath)
      ? parseSessionFrontMatter(fs.readFileSync(stagePath, "utf8"))
      : null];
  }));
  const retryExtraPath = path.join(studyContentDir, "session-r-extra.md");
  const retryExtraSession = fs.existsSync(retryExtraPath)
    ? parseSessionFrontMatter(fs.readFileSync(retryExtraPath, "utf8"))
    : null;
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
    if (!fs.existsSync(sessionPath) && !stageSessions.f && !stageSessions.r && !retryExtraSession) {
      throw new Error(`SESSIONがありません（session.md / session-f.md / session-r.md / session-r-extra.md）: ${studyContentDir}`);
    }

    title = sessionTitleFromMarkdown(
      fs.existsSync(sessionPath) ? session : stageSessions.f || stageSessions.r || retryExtraSession,
      record,
      study
    );
  }

  return {
    ...study,
    id: expectedStudyId,
    title,
    sessionMarkdown: session.markdown,
    stageSessions,
    retryExtraSession
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
${socialMetaTags({
  title: "数学学習記録 | Math Study Log",
  description: defaultDescription,
  url: `${siteUrl}/`,
  image: siteOgImageUrl,
  imageMeta: imageMetadata(path.join(publicDir, "og-image.png")),
  type: "website"
})}
<link rel="canonical" href="${siteUrl}/">

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

const studyPartLabels = { f: "教材問題", r: "オリジナル問題" };

function renderStageLog(record, study, stage) {
  const label = studyPartLabels[stage];
  // 収集済み画像の順序・命名チェックは変更せず、種別だけで振り分ける。
  const images = study.images.filter((file) => file.match(imagePattern)[5] === stage);
  // 未登録でも左には説明文を置かず、答案画像と操作用ラベルだけを表示する。
  return images.map((file) => {
    const page = file.match(imagePattern)[6] || "1";
    const alt = `${formatDotDate(record.date)} ${study.number} ${label} ページ${page}`;
    return `<figure class="study-sheet">
      <button class="sheet-button" type="button" aria-label="${escapeHtml(alt)}を拡大">
        <img class="sheet" src="./images/${encodeURIComponent(file)}" alt="${escapeHtml(alt)}" loading="lazy">
      </button>
      <figcaption>${label} · ${page}</figcaption>
    </figure>`;
  }).join("\n");
}

function studyPageStyles() {
  return `${sessionPageStyles()}
.header-inner, main { width: min(1440px, calc(100% - 48px)); }
.study-stage + .study-stage { margin-top: 40px; }
.stage-heading {
  margin-bottom: 14px;
  color: var(--accent);
  font: 600 18px/1.5 "Noto Sans JP", sans-serif;
}
/* 固定の2列。高さは長い側に合わせ、次の段をその下へ配置する。 */
.study-pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 24px;
}
.study-column {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}
.column-heading {
  margin-bottom: 18px;
  color: var(--ink-soft);
  font: 600 12px/1.5 "JetBrains Mono", monospace;
  letter-spacing: 0.1em;
}
.study-column .session-content { padding: 0; border: 0; }
.study-column .session-content > :first-child { margin-top: 0; }
.study-sheet + .study-sheet { margin-top: 24px; }
.sheet-button {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: var(--panel);
  cursor: zoom-in;
}
.sheet-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.sheet { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; }
.study-sheet figcaption { margin-top: 6px; color: var(--ink-soft); font: 11px/1.5 "JetBrains Mono", monospace; }
.study-empty, .legacy-note { color: var(--ink-soft); font-size: 13px; }
.legacy-note { margin-bottom: 18px; }
.legacy-session { margin-top: 40px; }
.retry-extra {
  width: min(900px, 100%);
  margin: 28px auto 0;
}
.retry-extra .session-content { padding: 0; border: 0; }
.retry-extra .session-content > :first-child { margin-top: 0; }
.lightbox { margin: auto; max-width: 96vw; max-height: 96vh; padding: 12px; border: 0; border-radius: 8px; background: var(--panel); }
.lightbox::backdrop { background: rgba(12, 20, 15, 0.82); }
.lightbox img { display: block; max-width: calc(100vw - 72px); max-height: 82vh; width: auto; height: auto; }
.lightbox-close { display: block; margin: 0 0 10px auto; cursor: pointer; }
@media (max-width: 900px) {
  .study-pair { grid-template-columns: minmax(0, 1fr); gap: 18px; }
  .study-column { padding: 14px; }
  .header-inner, main { width: calc(100% - 24px); }
}`;
}

function createStudyPage(record, study, view = "study") {
  const showLog = view !== "session";
  const showSession = view !== "log";
  const pageFile = view === "study" ? "index.html" : `${view}.html`;
  const pageUrl = view === "study"
    ? `${siteUrl}/records/${dateKey(record.date)}/${study.number}/`
    : `${siteUrl}/records/${dateKey(record.date)}/${study.number}/${pageFile}`;
  const cardImageFile = study.images[0];
  const cardImageUrl = `${siteUrl}/records/${dateKey(record.date)}/${study.number}/images/${encodeURIComponent(cardImageFile)}`;
  const cardImageMeta = imageMetadata(imageSources.get(cardImageFile));
  const cardTitle = `${study.title} | 数学学習記録`;
  const cardDescription = descriptionForStudy(study);
  const legacySession = showSession && study.sessionMarkdown.trim()
    ? `<p class="legacy-note">未分類の旧SESSIONです。対応表示にはsession-f.md（教材問題）とsession-r.md（オリジナル問題）を使用してください。</p><article class="session-content">${renderSessionMarkdown(study)}</article>`
    : "";

  // 常にパート単位の独立したグリッドを2段作る。左右を別々の縦列にしない。
  let content = ["f", "r"].map((stage) => {
    const label = studyPartLabels[stage];
    const session = study.stageSessions[stage];
    const sessionHtml = session?.markdown.trim()
      ? renderSessionMarkdown({ sessionMarkdown: session.markdown })
      : `<p class="study-empty">${label}のSESSIONはまだありません。</p>`;
    const retryExtra = showSession && stage === "r" && study.retryExtraSession?.markdown.trim()
      ? `<section class="retry-extra study-column" aria-label="オリジナル問題の追加SESSION">
      <h2 class="column-heading">SESSION · EXTRA</h2>
      <article class="session-content">${renderSessionMarkdown({ sessionMarkdown: study.retryExtraSession.markdown })}</article>
    </section>`
      : "";
    return `<section class="study-stage" data-stage="${stage}" aria-labelledby="stage-${stage}">
      <h2 class="stage-heading" id="stage-${stage}">${label}</h2>
      <div class="study-pair">
${showLog ? `        <div class="study-column" data-column="log"><h3 class="column-heading">LOG</h3>${renderStageLog(record, study, stage)}</div>` : ""}
${showSession ? `        <div class="study-column" data-column="session"><h3 class="column-heading">SESSION</h3><article class="session-content">${sessionHtml}</article></div>` : ""}
      </div>
    </section>${retryExtra}`;
  }).join("\n");
  if (legacySession) {
    // 未移行の記事は失わず別枠で保持するが、推測でいずれかのパートに割り当てない。
    content += `<section class="legacy-session study-column" aria-label="未分類の旧SESSION"><h2 class="column-heading">SESSION · 未分類</h2>${legacySession}</section>`;
  }

  return createSimpleRecordPage({
    documentTitle: `${view === "study" ? "" : `${view.toUpperCase()} | `}${study.title} | 学習記録 ${study.number} - ${formatJapaneseDate(record.date)}`,
    kicker: view === "study" ? "STUDY · LOG & SESSION" : view.toUpperCase(),
    title: study.title,
    date: `${formatDotDate(record.date)} / ${study.number}`,
    actions: view === "study"
      ? `<a class="text-link" href="../../../index.html">TOP</a>\n    <a class="text-link" href="../index.html">${formatDotDate(record.date)} の学習セット</a>`
      : `<a class="text-link" href="../../../index.html">TOP</a>\n    <a class="text-link" href="../../../${view}/index.html">${view.toUpperCase()} 一覧</a>\n    <a class="text-link" href="./index.html">学習セット全体</a>`,
    content,
    displayYear: record.date.slice(0, 4),
    headExtra: `${socialMetaTags({
      title: cardTitle,
      description: cardDescription,
      url: pageUrl,
      image: cardImageUrl,
      imageMeta: cardImageMeta
    })}\n${showSession ? mathJaxHead(true) : ""}\n<link rel="canonical" href="${pageUrl}">`,
    extraStyles: studyPageStyles() + (view === "study" ? "" : "\n.study-pair { grid-template-columns: minmax(0, 1fr); }\n.header-inner, main { max-width: 900px; }"),
    bodyScripts: showLog ? `<dialog class="lightbox" aria-label="答案画像の拡大">
  <button class="text-link lightbox-close" type="button">閉じる</button>
  <img alt="">
</dialog>
<script>
const lightbox = document.querySelector(".lightbox");
document.querySelectorAll(".sheet-button").forEach((button) => {
  button.addEventListener("click", () => {
    const source = button.querySelector("img");
    const enlarged = lightbox.querySelector("img");
    enlarged.src = source.src;
    enlarged.alt = source.alt;
    lightbox.showModal();
  });
});
lightbox.querySelector("button").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("keydown", (event) => {
  if (event.key === "Escape") lightbox.close();
});
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});
</script>` : ""
  });
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
        <a class="text-link" href="./${encodeURIComponent(study.number)}/index.html" aria-label="${escapeHtml(study.number)} ${escapeHtml(study.title)}を開く">OPEN</a>
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

function hasCategoryContent(study, kind) {
  return kind === "log"
    ? study.images.length > 0
    : [study.sessionMarkdown, study.stageSessions.f?.markdown, study.stageSessions.r?.markdown, study.retryExtraSession?.markdown]
        .some((source) => Boolean(source?.trim()));
}

function createArchivePage(kind, entries) {
  const pageName = kind.toUpperCase();
  const items = entries
    .filter(({ study }) => hasCategoryContent(study, kind))
    .map(
      ({ record, study }) => `
    <div class="archive-item">
      <div class="archive-date">${formatDotDate(record.date)}</div>
      <a class="archive-title" href="../records/${dateKey(record.date)}/${encodeURIComponent(study.number)}/${kind}.html">${escapeHtml(study.title)}</a>
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
      path.join(studyDir, "index.html"),
      createStudyPage(record, study),
      "utf8"
    );

    for (const kind of ["log", "session"]) {
      fs.writeFileSync(
        path.join(studyDir, `${kind}.html`),
        createStudyPage(record, study, kind),
        "utf8"
      );
    }
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
  ...archiveEntries.map(({ record, study }) =>
    `${siteUrl}/records/${dateKey(record.date)}/${study.number}/index.html`
  ),
  ...archiveEntries.flatMap(({ record, study }) =>
    ["log", "session"].filter((kind) => hasCategoryContent(study, kind)).map((kind) =>
      `${siteUrl}/records/${dateKey(record.date)}/${study.number}/${kind}.html`
    )
  ),
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
