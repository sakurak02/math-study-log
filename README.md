# Math Study Log

毎日の数学学習を、紙の写真と自由記載のMarkdownで残す静的サイトです。

## 学習記録の追加

1日につき1フォルダーを `logs/` に追加します。

```text
logs/
└─ YYYY/
   └─ YYYYMMDD/
      ├─ YYYYMMDD-1.webp
      ├─ YYYYMMDD-2.webp
      └─ YYYYMMDD.md
```

- フォルダー名は `YYYYMMDD` です。
- 画像は `YYYYMMDD-1.webp` から始め、ページ順に番号を付けます。
- `YYYYMMDD.md` は先頭のfront matterにカテゴリを書き、その後は自由記載です。日付見出しは不要で、日付はフォルダー名から取得します。
- 画像1枚を学習1ページとして数えます。
- 1枚目の画像がトップページの代表画像になります。

```markdown
---
category: 数学III｜極限
---

今日は47番と48番。
48番は係数決定の考え方をもう一度見直したい。
```

`category` がない場合や空欄の場合は「未分類」として扱います。`category: 未分類` も正式なカテゴリです。front matterは本文や抜粋に表示されません。categoryは1行の文字列で指定します（引用符も使用できます）。

更新時にJSON、一覧、HTMLを編集する必要はありません。WebPとMarkdownを追加してcommit・pushすると、GitHub Actionsがトップページ、日別ページ、sitemapを自動生成します。categoryを書き換えると、次のビルドで分類先も変わります。

## ローカル確認

```sh
npm ci
npm test
npm run build
```

生成物は `public/` に出力されます。`logs/` が空でもビルドできます。

## 公開ページ

- `/`：最新の写真グリッド、年月別アーカイブ、教科→章を開くカテゴリ別テキスト一覧
- `/daily/YYYYMMDD/`：その日の全画像とMarkdown全文

GitHub Pagesへのデプロイは `.github/workflows/deploy.yml` で行います。
