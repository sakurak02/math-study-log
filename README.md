# Math Study Log

数学学習記録の静的サイトです。`content/records/` に記事を置き、GitHub Actions のビルドで目次・カレンダー・公開HTMLを自動生成します。

## 記事の追加

1つのフォルダーに、1つのChatGPTオリジナル問題を置きます。同日に複数問ある場合は `001`、`002`、`003` と分けます。

```text
content/records/YYYYMMDD/NNN/
  images/
    YYYYMMDD-NNN-1.webp
    YYYYMMDD-NNN-2.webp  # 2枚目がある場合
  session.md
  question.md
  answer.md
  meta.json
```

- `session.md`: 教材でのつまずき、修正、気づき、ポイントのみ。教材の問題文や模範解答は載せません。
- `question.md`: ChatGPTオリジナル問題。ヒントは `<details>` / `<summary>` で折りたたみます。
- `answer.md`: 解説と模範解答。模範解答は `<details>` / `<summary>` で折りたたみます。
- `meta.json`: 日付、番号、タイトル、分類。

LOG画像は `.webp` のみで、枝番は枚数にかかわらず必ず `-1` から始めます。`f`、`r`、`extra` は使いません。

## 分類

`session.md`、`question.md`、`answer.md` の先頭に同じ分類コメントを置きます。

```md
<!--
subject: 数学III
category: 極限
subcategory: 数列の極限
-->
```

科目・中分類の名称と順番は `content/classification-master.json` で管理します。カレンダーと目次はビルド時に自動更新されます。

## 公開ページ

記事は次の順に縦表示します。

```text
SESSION
ORIGINAL QUESTION
LOG
EXPLANATION
MODEL ANSWER（折りたたみ）
```

LOGが1枚ならそのまま表示し、2枚以上なら1枚目の後の `more` に残りを収めます。PCとスマートフォンは同じ表示順です。

## 確認

```sh
npm ci
npm test
npm run build
```

日常の更新は、所定のフォルダーにファイルを置いて Commit & Push するだけで完了します。
