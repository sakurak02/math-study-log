const fs = require("node:fs");
const path = require("node:path");

// Only a single-line category scalar is supported; this is not a general YAML parser.
function parseLogMarkdown(source) {
  const frontMatter = source.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m);
  if (!frontMatter || frontMatter.index !== 0) {
    return { category: "未分類", markdown: source };
  }

  const categoryLine = frontMatter[1].match(/^category:[ \t]*(.*)$/m);
  let category = categoryLine?.[1].trim() || "";
  if (category.startsWith('"')) {
    try {
      const quoted = category.match(/^("(?:[^"\\]|\\.)*")(?:[ \t]+#.*)?$/);
      category = quoted ? JSON.parse(quoted[1]) : "";
    } catch {
      category = "";
    }
  } else if (category.startsWith("'")) {
    const quoted = category.match(/^'((?:[^']|'')*)'(?:[ \t]+#.*)?$/);
    category = quoted ? quoted[1].replace(/''/g, "'") : "";
  } else {
    category = category.replace(/[ \t]+#.*$/, "");
    if (/^(?:[>|[\]{}&*!#]|null$|~$)/i.test(category)) category = "";
  }

  return {
    category: typeof category === "string" && category.trim() ? category.trim() : "未分類",
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
      const { category, markdown } = parseLogMarkdown(markdownSource);

      logs.push({
        date: isoDateFromKey(dateKey),
        dateKey,
        markdown,
        category,
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
