const fs = require("node:fs");
const path = require("node:path");

// The template uses single-line scalars, not arbitrary YAML objects or arrays.
function readScalar(frontMatter, key) {
  const line = frontMatter.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"));
  if (!line) return undefined;
  let value = line[1].trim();
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

      logs.push({
        date: isoDateFromKey(dateKey),
        dateKey,
        ...record,
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
