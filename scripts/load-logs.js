const fs = require("node:fs");
const path = require("node:path");

function readField(frontMatter, key) {
  const line = frontMatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  return line?.[1].trim();
}

function readScalar(frontMatter, key) {
  let value = readField(frontMatter, key);
  if (value === undefined) return undefined;
  if (value.startsWith('"')) {
    try {
      const quoted = value.match(/^("(?:[^"\\]|\\.)*")(?:[ \t]+#.*)?$/);
      value = quoted ? JSON.parse(quoted[1]) : "";
    } catch {
      value = "";
    }
  } else if (value.startsWith("'")) {
    const quoted = value.match(/^'((?:[^']|'')*)'(?:[ \t]+#.*)?$/);
    value = quoted ? quoted[1].replace(/''/g, "'") : "";
  } else {
    value = value.replace(/[ \t]+#.*$/, "");
    if (/^(?:[>|[\]{}&*!#]|null$|~$)/i.test(value)) value = "";
  }

  return value.trim();
}

// Only the categories list uses nested fields. Each images value is an inline array.
function readCategoryAssignments(frontMatter) {
  const header = frontMatter.match(/^categories:.*(?:\r?\n|$)/m);
  if (!header) return undefined;

  const block = frontMatter.slice(header.index + header[0].length).split(/^[^\s#]/m, 1)[0];
  return block.split(/^[ \t]+-[ \t]+/m).slice(1).map((item) => {
    const fields = item.replace(/^[ \t]+/gm, "");
    return {
      category: readScalar(fields, "category") || "未分類",
      imageList: readField(fields, "images")
    };
  });
}

function resolveCategories(record, images, dateKey, markdownPath) {
  if (!record.categoryAssignments) return [{ category: record.category, images }];

  const grouped = new Map();
  const available = new Set(images);
  const assigned = new Map();
  const warn = (category, message) => console.warn(`${markdownPath}（${category}）: ${message}`);

  for (const { category, imageList } of record.categoryAssignments) {
    if (!grouped.has(category)) grouped.set(category, []);

    const list = imageList?.match(/^\[([^\]]*)\][ \t]*(?:#.*)?$/);
    if (!list) {
      warn(category, "images は [1, 2] の形式で入力してください。");
      continue;
    }
    const numbers = list[1].trim().replace(/,$/, "");
    if (!numbers) continue;

    for (const token of numbers.split(",")) {
      const number = token.trim();
      if (!/^[1-9]\d*$/.test(number)) {
        warn(category, `不正な画像番号「${number}」をスキップしました。`);
        continue;
      }
      const filename = `${dateKey}-${number}.webp`;
      if (!available.has(filename)) {
        warn(category, `画像番号 ${number} の ${filename} が見つかりません。`);
      }
      const firstCategory = assigned.get(filename);
      if (firstCategory && firstCategory !== category) {
        warn(category, `画像番号 ${number} が「${firstCategory}」と重複しています。最初の指定を使います。`);
        continue;
      }
      assigned.set(filename, category);
    }
  }

  for (const image of images) {
    const category = assigned.get(image);
    if (category) grouped.get(category).push(image);
  }
  if (!grouped.size) grouped.set("未分類", []);
  return [...grouped].map(([category, images]) => ({ category, images }));
}

function readCount(frontMatter, key) {
  const value = readScalar(frontMatter, key);
  if (value === undefined) return undefined; // Not specified (legacy records).
  if (value === "") return null; // Explicitly blank; different from zero.
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${key}には0以上の整数を入力してください。`);
  }
  return Number(value);
}

function readRating(frontMatter, key, mark) {
  const value = readScalar(frontMatter, key);
  if (!value) return value;
  const marks = Array.from(value.replace(/\uFE0F/g, ""));
  if (marks.length < 1 || marks.length > 5 || marks.some((item) => item !== mark)) {
    throw new Error(`${key}には${mark}\uFE0Fを1〜5個入力してください。`);
  }
  return value;
}

function parseLogMarkdown(source) {
  const frontMatter = source.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m);
  if (!frontMatter || frontMatter.index !== 0) {
    return { category: "未分類", markdown: source };
  }
  const fields = frontMatter[1];
  return {
    category: readScalar(fields, "category") || "未分類",
    categoryAssignments: readCategoryAssignments(fields),
    material: readScalar(fields, "教材"),
    scope: readScalar(fields, "範囲"),
    problemCount: readCount(fields, "問題数"),
    paperCount: readCount(fields, "用紙"),
    difficulty: readRating(fields, "苦戦度", "🌧"),
    joy: readRating(fields, "喜び度", "☀"),
    markdown: source.slice(frontMatter[0].length)
  };
}

function isValidDateKey(dateKey) {
  if (!/^\d{8}$/.test(dateKey)) return false;

  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isoDateFromKey(dateKey) {
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

function loadLogs(logsDir) {
  if (!fs.existsSync(logsDir)) return [];

  const logs = [];
  const yearDirectories = fs
    .readdirSync(logsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name));

  for (const yearEntry of yearDirectories) {
    const yearDir = path.join(logsDir, yearEntry.name);
    const dateDirectories = fs
      .readdirSync(yearDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          isValidDateKey(entry.name) &&
          entry.name.startsWith(yearEntry.name)
      );

    for (const dateEntry of dateDirectories) {
      const dateKey = dateEntry.name;
      const dateDir = path.join(yearDir, dateKey);
      const markdownPath = path.join(dateDir, `${dateKey}.md`);
      const markdownSource = fs.existsSync(markdownPath)
        ? fs.readFileSync(markdownPath, "utf8")
        : "";
      const imagePattern = new RegExp(`^${dateKey}-([1-9]\\d*)\\.webp$`);
      const images = fs
        .readdirSync(dateDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && imagePattern.test(entry.name))
        .map((entry) => ({
          filename: entry.name,
          number: BigInt(entry.name.match(imagePattern)[1])
        }))
        .sort((a, b) =>
          a.number < b.number
            ? -1
            : a.number > b.number
              ? 1
              : a.filename.localeCompare(b.filename)
        )
        .map((image) => image.filename);
      const expectedCoverImage = `${dateKey}-1.webp`;
      let record;
      try {
        record = parseLogMarkdown(markdownSource);
      } catch (error) {
        throw new Error(`${markdownPath}: ${error.message}`, { cause: error });
      }
      const categories = resolveCategories(record, images, dateKey, markdownPath);
      const { categoryAssignments, ...details } = record;

      logs.push({
        date: isoDateFromKey(dateKey),
        dateKey,
        ...details,
        category: categories.map(({ category }) => category).join(" / "),
        categories,
        images,
        coverImage: images.includes(expectedCoverImage)
          ? expectedCoverImage
          : null,
        pageCount: images.length
      });
    }
  }

  return logs.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

module.exports = { loadLogs };
