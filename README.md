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
- `YYYYMMDD.md` はfront matterなしの自由記載です。
- 画像1枚を学習1ページとして数えます。
- 1枚目の画像がトップページの代表画像になります。

更新時にJSON、分類、一覧、HTMLを編集する必要はありません。WebPとMarkdownを追加してcommit・pushすると、GitHub Actionsがトップページ、日別ページ、sitemapを自動生成します。

## ローカル確認

```sh
npm ci
npm test
npm run build
```

生成物は `public/` に出力されます。`logs/` が空でもビルドできます。

## 公開ページ

- `/`：最新の写真グリッドと年月別アーカイブ
- `/daily/YYYYMMDD/`：その日の全画像とMarkdown全文

GitHub Pagesへのデプロイは `.github/workflows/deploy.yml` で行います。
