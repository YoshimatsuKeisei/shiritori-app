# しりとりアプリ 辞書・文字処理仕様書

## 1. 目的

JMdict / JMnedict を中心に、しりとり判定用のローカル辞書DBを生成・利用するための仕様を定義する。

---

## 2. 情報源

### 2.1 JMdict

主用途：

- 一般名詞
- ことわざ
- 慣用表現のうち採用対象とするもの
- カタカナ語
- 読み
- 表記
- 品詞
- 各種タグ

### 2.2 JMnedict

主用途：

- 人名
- 地名
- 組織名
- 会社名
- 作品名
- 商品名
- その他固有名詞

「有名かどうか」は判定しない。

辞書に収録され、かつアプリ設定で許可された分類であることを正解基準とする。

### 2.3 部首データ

JMdict / JMnedict とは分離する。

必要項目：

- 漢字
- 部首ID
- 部首名
- 必要なら康熙部首番号等

---

## 3. 基本辞書レコード

推奨概念モデル：

```ts
WordEntry {
  id: string
  source: "JMdict" | "JMnedict"
  reading: string
  normalizedReading: string
  surface: string
  normalizedSurface: string
  partOfSpeech: string[]
  semanticTags: string[]
  properNounType?: ProperNounType
  scriptType: "kanji" | "katakana" | "hiragana" | "mixed"
  characterCount: number
  firstChar: string
  lastChar: string
  firstTwoChars: string
  lastTwoChars: string
  kanjiChars: string[]
  usageKeyNormal: string
  usageKeyKanji: string
}
```

---

## 4. 語彙採用条件

### 4.1 原則

名詞のみ。

### 4.2 例外

ことわざは使用可能。

### 4.3 固有名詞

ゲーム設定で有効化されたJMnedict分類のみ採用。

---

## 5. 入力正規化

ユーザー入力は原則ひらがな。

### 5.1 カタカナ→ひらがな

辞書側の読み比較用にカタカナをひらがなへ正規化する。

ただし長音「ー」は保持する。

例：

- スーパー → すーぱー
- コンピューター → こんぴゅーたー

### 5.2 小文字

小書き文字は保持する。

- きゃ → きゃ
- しょ → しょ
- っ → っ

大文字化しない。

### 5.3 長音

「ー」を「う」「あ」等へ変換しない。

例：

スーパー

正規化読み：

すーぱー

これにより：

- 文字数 = 4
- 末尾2文字 = ぱー
- 「ー」禁止判定が可能

---

## 6. 文字数

Unicodeコードポイント単位を基本としつつ、アプリが許可する日本語文字セットに正規化後、1表示仮名=1文字として数える。

例：

- きゃく = 3
- きゃ = 2
- がっこう = 4
- すーぱー = 4

除外：

- 空白
- 句読点
- 中黒
- 装飾記号

保持：

- ー
- 小書き文字

---

## 7. 先頭・末尾

正規化読みから取得する。

```ts
firstChar
lastChar
firstTwoChars
lastTwoChars
```

二文字ルールでは「文字」単位。

例：

すーぱー

- firstTwoChars = すー
- lastTwoChars = ぱー

---

## 8. 使用済みキー

### 8.1 通常モード

`usageKeyNormal = normalizedReading`

例：

橋 / 箸 / 端

すべて読み「はし」なら、通常モードでは同一使用済みキー。

### 8.2 漢字限定

現段階では `usageKeyKanji = normalizedSurface` とする。将来は `canonicalSurfaceId` へ置き換え可能な構造を維持する。

異なる漢字表記を別語として扱う。

ただし明らかな単なる表記揺れは、辞書生成段階で同一canonical IDへ束ねる余地を持つ。

---

## 9. 漢字候補検索

### 9.1 入力

ひらがな。

例：

こうしょう

### 9.2 候補

同じ正規化読みを持ち、漢字表記を持つ候補。

例：

- 交渉
- 校章
- 鉱床
- 口承

### 9.3 UI

- 検索フィールド
- スクロール一覧
- 候補タップで確定
- 候補選択中もタイマー継続

### 9.4 検索

候補数が多い場合は、表記部分一致で絞り込み可能。

---

## 10. カタカナ限定判定

入力例：

すーぱー

辞書内候補：

スーパー

条件：

- normalizedReading が一致
- surface がカタカナ表記として判定される

ユーザーにカタカナ入力を要求しない。

---

## 11. 禁止文字グループ

### A: 通常かな

1文字単位で指定。

### B: 濁音・撥音

グループ全体を一括禁止する。

対象：

- がぎぐげご
- ざじずぜぞ
- だぢづでど
- ばびぶべぼ
- ゔ
- ん

半濁音（ぱぴぷぺぽ）はBへ含めない。

### C: 小文字

例：

- ぁ
- ぃ
- ぅ
- ぇ
- ぉ
- ゃ
- ゅ
- ょ
- っ
- ゎ

必要に応じて小書きカナを追加。

### D: 長音

- ー

---

## 12. ことわざ

ことわざは通常の名詞とは別タグで許可する。

文字数計算は仮名列のみ。

例：

いしのうえにもさんねん

空白・句読点が原データに含まれていても除去して扱う。

---

## 13. 事前生成インデックス

高速判定のため以下のインデックスを推奨。

- normalizedReading
- firstChar
- lastChar
- firstTwoChars
- lastTwoChars
- characterCount
- scriptType
- partOfSpeech
- properNounType
- semanticTags
- kanjiChars
- usageKeyNormal
- usageKeyKanji

候補0件判定にも利用する。

---

## 14. ローカル辞書化

毎回外部APIへ問い合わせるのではなく、配布時またはビルド時にJMdict/JMnedictからアプリ用DBを生成する方式を推奨。

利点：

- オフライン動作
- 高速判定
- 外部API障害の影響を受けない
- 正解基準をバージョン固定できる
- 対戦中のレスポンスが安定する

---

## 15. 辞書バージョン

ゲーム結果の再現性のため、辞書ビルドごとにバージョンを持つ。

例：

```ts
DictionaryVersion {
  id: string
  jmdictDate: string
  jmnedictDate: string
  generatedAt: string
  schemaVersion: number
}
```

将来的に戦績へ辞書バージョンを記録可能にする。

---

## 16. 原典入力と生成方式

- JMdict/JMnedictのUTF-8 XMLまたはXML.GZをローカルファイルとして受け取る。
- XML全体をDOM化せず、`entry`単位でストリーム処理する。
- JMdictは明示的な名詞POSコード（`n`, `n-adv`, `n-pr`, `n-pref`, `n-suf`, `n-t`, `num`, `pn`）または`proverb`タグを持つエントリだけを採用する。
- 曖昧な品詞や動詞・形容詞を推測で名詞に含めない。
- `re_restr`がある場合は、読みと許可された表記の組だけを生成する。
- 生成には既存の`createWordEntry`を使う。

CLI例：

```bash
npm run dictionary:build -- --jmdict data/raw/JMdict.xml.gz --jmnedict data/raw/JMnedict.xml.gz
```

生成形式は`DictionaryMetadata`と`WordEntry[]`を持つJSONとする。raw原典および本番生成JSONはサイズが大きくなり得るためGit管理外とする。

## 17. JMnedict分類

原典の`name_type`を次へ写像する。

- surname/given/fem/masc/person/unclass → `PERSON`
- place/station → `PLACE`
- organization/company → `ORGANIZATION`
- work → `WORK`
- product → `PRODUCT`
- 未対応・不明 → `OTHER`

## 18. 検索Repository

永続形式から独立した`DictionaryRepository`を境界とし、読み、先頭1・2文字、末尾1文字、文字数、文字種をインデックス化する。禁止文字と辞書範囲は絞り込んだ候補へ適用する。

主なAPI：

- `findByReading`
- `findKanjiCandidatesByReading`
- `findKatakanaCandidatesByReading`
- `searchWords`
- `countWords`

## 19. 辞書範囲

JMdictの通常採用語は`commonNouns`、ことわざタグ付き語は`proverbs`で制御する。JMnedictは`properNouns`をマスター設定とし、PERSON/PLACE/ORGANIZATION/WORK/PRODUCTを個別設定で制御する。`OTHER`は`properNouns`有効時に許可する。

## 20. 重複除去

完全重複キーは、source、normalizedReading、normalizedSurface、properNounType、ソート済みpartOfSpeech、ソート済みsemanticTagsの組とする。同じ読みでも表記が異なる「橋・箸・端」は削除しない。JMdict/JMnedict間も出典・分類が異なるため自動統合しない。

## 21. 出典とライセンス

原典および派生データはEDRDGの利用条件に従う。配布時の謝辞・条件はルートの`NOTICE.md`に記録し、最新の公式ライセンス文書を確認する。本リポジトリには本番原典を同梱しない。

## 22. ブラウザ向け辞書

ブラウザでは約111MBの`data/generated/dictionary.json`を直接importまたは全件fetchしない。`npm run dictionary:browser`で次の再生成可能な静的アセットへ分割する。

- `manifest.json`: schema、生成日時、原典ファイル名、原典metadata、総entry数、各shardのpath・件数・bytes
- `by-first/`: `normalizedReading.firstChar`別。通常、2文字、文字数増加、禁止文字、入力読み検索に使用
- `by-last/`: `normalizedReading.lastChar`別。リバースの候補検索に使用

ファイル名はUnicodeコードポイントによる決定的なASCII名とする。`BrowserDictionaryLoader`はmanifestと必要shardだけをfetchし、同一セッションではPromise cacheにより重複取得しない。状態は`UNLOADED`、`LOADING`、`LOADED`を区別し、未ロード範囲を候補0件と解釈してはならない。

React側の`BrowserDictionarySession`が必要範囲を非同期に保証した後、ロード済みentryで構築した既存`InMemoryDictionaryRepository`を同期GameStateへ渡す。出典情報は原典metadataをmanifestへ保持し、`NOTICE.md`の条件を引き継ぐ。
