const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const recordsDir = path.join(rootDir, "src", "records");
const publicDir = path.join(rootDir, "public");

// 出力先を作成
fs.mkdirSync(publicDir, { recursive: true });

// 学習記録データを読み込む
const recordFiles = fs.existsSync(recordsDir)
  ? fs.readdirSync(recordsDir).filter((file) => file.endsWith(".json"))
  : [];

const records = recordFiles
  .map((file) => {
    const filePath = path.join(recordsDir, file);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  })
  .sort((a, b) => b.date.localeCompare(a.date));

// 共通HTML
function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
      line-height: 1.7;
      color: #222;
    }

    header {
      margin-bottom: 40px;
    }

    h1, h2 {
      line-height: 1.4;
    }

    a {
      color: inherit;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    .record {
      border-top: 1px solid #ddd;
      padding: 20px 0;
    }

    .date {
      color: #666;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>数学学習記録</h1>
    <p>Math Study Log</p>
  </header>

  ${content}
</body>
</html>`;
}

// トップページ
const recordList =
  records.length === 0
    ? "<p>まだ学習記録はありません。</p>"
    : records
        .map(
          (record) => `
<section class="record">
  <div class="date">${record.date}</div>
  <h2>
    <a href="./records/${record.date}.html">
      ${record.title}
    </a>
  </h2>
</section>`
        )
        .join("");

fs.writeFileSync(
  path.join(publicDir, "index.html"),
  layout("数学学習記録 | Math Study Log", recordList),
  "utf8"
);

// 日別ページ
const recordOutputDir = path.join(publicDir, "records");
fs.mkdirSync(recordOutputDir, { recursive: true });

for (const record of records) {
  const images = (record.images || [])
    .map(
      (image) =>
        `<img src="../images/${image}" alt="${record.title}の学習記録">`
    )
    .join("\n");

  const content = `
<p><a href="../index.html">← トップへ戻る</a></p>

<article>
  <div class="date">${record.date}</div>
  <h2>${record.title}</h2>
  ${record.note ? `<p>${record.note}</p>` : ""}
  ${images}
</article>
`;

  fs.writeFileSync(
    path.join(recordOutputDir, `${record.date}.html`),
    layout(`${record.title} | 数学学習記録`, content),
    "utf8"
  );
}

console.log(`Build complete: ${records.length} record(s) generated.`);