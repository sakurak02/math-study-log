const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: false
});

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

      logs.push({
        date: isoDateFromKey(dateKey),
        dateKey,
        markdown: markdownSource,
        markdownHtml: markdown.render(markdownSource),
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
