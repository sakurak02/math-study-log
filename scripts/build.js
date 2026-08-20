const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const recordsDir = path.join(rootDir, "src", "records");
const publicDir = path.join(rootDir, "public");
const recordOutputDir = path.join(publicDir, "records");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(recordOutputDir, { recursive: true });

const recordFiles = fs.existsSync(recordsDir)
  ? fs.readdirSync(recordsDir).filter(file => file.endsWith(".json"))
  : [];

const records = recordFiles
  .map(file => {
    const filePath = path.join(recordsDir, file);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  })
  .sort((a, b) => a.date.localeCompare(b.date));

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function problemCount(record) {
  return Array.isArray(record.images) ? record.images.length : 0;
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

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function firstWeekday(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function currentStreak(sortedRecords) {
  if (!sortedRecords.length) return 0;

  const dates = [...sortedRecords]
    .map(r => r.date)
    .sort()
    .reverse();

  let streak = 1;

  for (let i = 0; i < dates.length - 1; i++) {
    const current = new Date(`${dates[i]}T00:00:00`);
    const next = new Date(`${dates[i + 1]}T00:00:00`);

    const diff =
      Math.round((current - next) / (1000 * 60 * 60 * 24));

    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function createMonthCalendar(year, month, monthRecords) {
  const recordMap = new Map(
    monthRecords.map(record => [
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

      cells += `      <a href="./records/${record.date}.html" class="day-cell ${levelClass(count)}"><span class="day-number">${day}</span><span class="day-count">${count}問</span></a>\n`;
    } else {
      cells += `      <div class="day-cell empty"><span class="day-number">${day}</span></div>\n`;
    }
  }

  return cells;
}

function createIndexPage() {
  const latest = records.length ? records[records.length - 1] : null;

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
      <div class="month-note">1問でも、ちゃんと1マス。</div>
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

  const latestHtml = latest
    ? `
  <a href="./records/${latest.date}.html" class="latest-link">
    <div>
      <div class="latest-kicker">LATEST</div>
      <div class="latest-main">最新更新はこちら → ${formatJapaneseDate(latest.date)}</div>
    </div>
    <div class="latest-meta">${problemCount(latest)} problems</div>
  </a>`
    : `<p>まだ学習記録はありません。</p>`;

  const latestMonthKey = latest ? latest.date.slice(0, 7) : "";
  const latestMonthCount = latestMonthKey
    ? records.filter(r => r.date.startsWith(latestMonthKey)).length
    : 0;

  const monthEnglish = latest
    ? new Intl.DateTimeFormat("en", { month: "long" }).format(
        new Date(`${latest.date}T00:00:00`)
      )
    : "Month";

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Math Study Log - All Days</title>
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

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    background: var(--bg);
    color: var(--ink);
    font-family: "Noto Sans JP", sans-serif;
    font-size: 16px;
    line-height: 1.6;
  }

  header {
    border-bottom: 1px solid var(--line);
    padding: 20px 24px 18px;
    background: rgba(255,255,255,0.88);
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

  .latest-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 13px 16px;
    color: var(--ink);
    text-decoration: none;
    margin-bottom: 24px;
    transition: 0.18s ease;
  }

  .latest-link:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .latest-kicker {
    font-size: 11px;
    letter-spacing: .1em;
    color: var(--accent);
    font-weight: 700;
    margin-bottom: 2px;
  }

  .latest-main {
    font-size: 15px;
    font-weight: 600;
  }

  .latest-meta {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .month-section { margin-bottom: 28px; }

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

  .month-note {
    font-size: 11px;
    color: var(--ink-soft);
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
    opacity: .78;
    white-space: nowrap;
  }

  .level-1 { background: var(--level-1); }
  .level-2 { background: var(--level-2); }
  .level-3 { background: var(--level-3); color: #102425; border-color: #82aaaa; }
  .level-4 { background: var(--level-4); color: #fff; border-color: var(--level-4); }
  .level-4 .day-count { opacity: .86; }

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

  .stats-section {
    border-top: 1px solid var(--line);
    padding-top: 18px;
    margin-top: 22px;
  }

  .stats-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    color: var(--ink-soft);
    font-size: 12px;
  }

  .stat-item strong {
    color: var(--ink);
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    margin-left: 5px;
  }

  footer {
    border-top: 1px solid var(--line);
    padding: 18px 24px;
    text-align: center;
    font-size: 11px;
    color: var(--ink-soft);
  }

  @media (max-width: 600px) {
    header { padding: 16px; }
    main { padding: 18px 12px 32px; }
    .header-date { font-size: 23px; }
    .latest-link { padding: 12px 13px; }
    .latest-meta { display: none; }
    .calendar-grid { gap: 4px; }
    .day-cell {
      height: 42px;
      padding: 0 6px;
      border-radius: 6px;
      flex-direction: column;
      justify-content: center;
      gap: 0;
    }
    .day-number { font-size: 12px; line-height: 1.2; }
    .day-count { font-size: 8px; line-height: 1.15; }
    .month-note { display: none; }
  }
</style>
</head>
<body>
<header>
  <div class="header-inner">
    <div class="header-title">Math Study Log</div>
    <div class="header-date">学習記録</div>
  </div>
</header>

<main>
${latestHtml}

${monthSections}

  <section class="stats-section">
    <div class="stats-row">
      <div class="stat-item">Total <strong>${records.length} days</strong></div>
      <div class="stat-item">${monthEnglish} <strong>${latestMonthCount} days</strong></div>
      <div class="stat-item">Streak <strong>${currentStreak(records)} days</strong></div>
    </div>
  </section>
</main>

<footer>Math Study Log © 2026 | 毎日の学習記録</footer>
</body>
</html>`;
}

function createDayPage(record, index) {
  const prev = index > 0 ? records[index - 1] : null;
  const next = index < records.length - 1 ? records[index + 1] : null;

  const images = Array.isArray(record.images) ? record.images : [];

  const imageItems = images.map((image, imageIndex) => `
    <div class="study-item">
      <img
        class="sheet"
        src="../images/${encodeURIComponent(image)}"
        alt="${escapeHtml(record.date)} 学習記録 ${imageIndex + 1}"
        onclick="openLightbox(this)"
      >
      <div class="sheet-label">${escapeHtml(image)}</div>
    </div>`).join("\n");

  const prevLink = prev
    ? `<a class="nav-link prev" href="./${prev.date}.html">← 前日</a>`
    : `<span></span>`;

  const nextLink = next
    ? `<a class="nav-link next" href="./${next.date}.html">次日 →</a>`
    : `<span></span>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Math Study Log - ${formatJapaneseDate(record.date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">

<style>
:root{
  --bg:#f3f7f4;
  --paper:#ffffff;
  --ink:#172019;
  --ink-soft:#708077;
  --line:#cfded4;
  --green-1:#e4efe8;
  --green-2:#c5dbcb;
  --green-3:#86a98f;
  --green-4:#4f765d;
  --green-dark:#2f5d43;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{
  background:var(--bg);
  color:var(--ink);
  font-family:"Noto Sans JP",sans-serif;
  line-height:1.65;
}
body{min-height:100vh}
header{
  border-bottom:1px solid var(--line);
  padding:22px 24px 14px;
  background:linear-gradient(180deg,#edf5ef 0%,#f7faf8 100%);
}
.header-inner, main, footer{
  width:min(900px,calc(100% - 32px));
  margin:0 auto;
}
.eyebrow{
  font-family:"JetBrains Mono",monospace;
  text-transform:uppercase;
  letter-spacing:.16em;
  font-size:11px;
  color:var(--ink-soft);
  margin-bottom:4px;
}
.date{
  font-size:28px;
  font-weight:700;
  letter-spacing:-.025em;
}
.meta{
  display:inline-flex;
  align-items:center;
  margin-top:7px;
  padding:3px 8px;
  border-radius:999px;
  background:var(--green-1);
  color:var(--green-dark);
  font-size:11px;
  font-family:"JetBrains Mono",monospace;
}
main{padding:24px 0 34px}

.back-link{
  display:inline-block;
  margin-bottom:18px;
  color:var(--green-dark);
  text-decoration:none;
  border-bottom:1px solid #b8ccbf;
  font-size:12px;
}
.back-link:hover{border-bottom-color:var(--green-dark)}

.study-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:18px;
}
.study-item{
  display:flex;
  flex-direction:column;
  gap:7px;
  padding:8px;
  border-radius:8px;
  background:rgba(228,239,232,.45);
}
.sheet{
  width:100%;
  height:auto;
  display:block;
  background:#fff;
  border:1px solid var(--line);
  border-radius:6px;
  box-shadow:0 1px 3px rgba(27,49,35,.035);
  cursor:zoom-in;
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;
}
.sheet:hover{
  transform:translateY(-1px);
  border-color:#b8cdbf;
  box-shadow:0 5px 15px rgba(27,49,35,.07);
}
.sheet-label{
  font-family:"JetBrains Mono",monospace;
  font-size:10px;
  color:var(--ink-soft);
  padding-left:2px;
}
.nav-section{
  margin-top:28px;
  padding:14px 14px 0;
  border-top:1px solid var(--line);
  border-radius:8px 8px 0 0;
  background:linear-gradient(180deg,rgba(228,239,232,.62),rgba(228,239,232,0));
}
.nav-row{
  display:grid;
  grid-template-columns:1fr auto 1fr;
  align-items:center;
  gap:14px;
}
.nav-link{
  color:var(--green-dark);
  text-decoration:none;
  font-size:12px;
}
.nav-link:hover{text-decoration:underline}
.nav-link.next{text-align:right}
.nav-center{
  color:var(--ink-soft);
  text-decoration:none;
  font-size:11px;
}
.nav-center:hover{color:var(--green-dark)}
footer{
  margin-top:6px;
  padding:15px 0 20px;
  border-top:1px solid var(--line);
  font-size:10px;
  color:var(--ink-soft);
  background:linear-gradient(180deg,rgba(228,239,232,0),rgba(228,239,232,.38));
}

.lightbox{
  position:fixed;
  inset:0;
  background:rgba(12,20,15,.82);
  display:none;
  align-items:center;
  justify-content:center;
  padding:24px;
  z-index:20;
}
.lightbox.open{display:flex}
.lightbox img{
  max-width:94vw;
  max-height:92vh;
  width:auto;
  height:auto;
  border-radius:8px;
  background:#fff;
  cursor:zoom-out;
}

@media (max-width:650px){
  header{padding:16px 12px 11px}
  .header-inner,main,footer{width:calc(100% - 20px)}
  .date{font-size:22px}
  main{padding-top:16px}
  .study-grid{
    grid-template-columns:1fr;
    gap:20px;
  }
  .sheet{border-radius:5px}
  .nav-row{
    grid-template-columns:1fr 1fr;
  }
  .nav-center{
    grid-column:1 / -1;
    grid-row:2;
    text-align:center;
    margin-top:4px;
  }
}
</style>
</head>

<body>
<header>
  <div class="header-inner">
    <div class="eyebrow">Math Study Log</div>
    <div class="date">${formatJapaneseDate(record.date)}</div>
    <div class="meta">${problemCount(record)} problems</div>
  </div>
</header>

<main>
  <a class="back-link" href="../index.html">← 学習記録へ戻る</a>

  <section class="study-grid">
${imageItems}
  </section>

  <nav class="nav-section">
    <div class="nav-row">
      ${prevLink}
      <a class="nav-center" href="../index.html">全日付を見る</a>
      ${nextLink}
    </div>
  </nav>
</main>

<footer>Math Study Log © 2026</footer>

<div class="lightbox" id="lightbox" onclick="closeLightbox()">
  <img id="lightboxImage" src="" alt="">
</div>

<script>
function openLightbox(el){
  const img = document.getElementById("lightboxImage");
  img.src = el.src;
  img.alt = el.alt;
  document.getElementById("lightbox").classList.add("open");
}

function closeLightbox(){
  document.getElementById("lightbox").classList.remove("open");
}

document.addEventListener("keydown", event => {
  if(event.key === "Escape") closeLightbox();
});
</script>
</body>
</html>`;
}

fs.writeFileSync(
  path.join(publicDir, "index.html"),
  createIndexPage(),
  "utf8"
);

records.forEach((record, index) => {
  fs.writeFileSync(
    path.join(recordOutputDir, `${record.date}.html`),
    createDayPage(record, index),
    "utf8"
  );
});

console.log(`Build complete: ${records.length} record(s) generated.`);