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
  properNounTypes?: ProperNounType[]
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
- 既知カテゴリが1つもないentry → `OTHER`

`mapJmnedictNameTypes`は全tagを評価し、重複のないカテゴリ集合をPERSON → PLACE → ORGANIZATION → WORK → PRODUCT → OTHERの固定順で返す。例えば`place + surname`は`["PERSON", "PLACE"]`。既知＋未知tagの場合はOTHERを追加しない。`properNounTypes`に全分類を、legacy `properNounType`に配列先頭を保存し、元tagは`semanticTags`へ保持する。

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

JMnedictの1entryは複数カテゴリに属する。`properNounTypes`のいずれか1つが有効なら採用（ANY enabled category matches）する。`properNouns=false`なら常に除外。配列がない旧JSONまたは空配列は`properNounType`の1要素配列へfallbackし、両方なければOTHERとする。このfallbackは`getProperNounTypes`で共通化する。

## 20. 重複除去

完全重複キーは、source、normalizedReading、normalizedSurface、properNounType、重複排除・ソート済みproperNounTypes、ソート済みpartOfSpeech、ソート済みsemanticTagsの組とする。同じ読みでも表記が異なる「橋・箸・端」は削除しない。JMdict/JMnedict間も出典・分類が異なるため自動統合しない。

## 21. 出典とライセンス

原典および派生データはEDRDGの利用条件に従う。配布時の謝辞・条件はルートの`NOTICE.md`に記録し、最新の公式ライセンス文書を確認する。本リポジトリには本番原典を同梱しない。

## 22. ブラウザ向け辞書

ブラウザでは巨大な`data/generated/dictionary.json`を直接importまたは全件fetchしない。`npm run dictionary:browser`で次の再生成可能な静的アセットへ分割する。

- `manifest.json`: schema、生成日時、原典ファイル名、原典metadata、総entry数、各shardのpath・件数・`compression: "gzip"`・`compressedBytes`・`uncompressedBytes`
- `by-first/`: `normalizedReading.firstChar`別。通常、2文字、文字数増加、禁止文字、入力読み検索に使用
- `by-last/`: `normalizedReading.lastChar`別。リバースの候補検索に使用

Stage 8.4.2のbrowser manifestはschemaVersion=2。各shardは`.json.gz`のみ保存し、manifestは非圧縮とする。Node専用`nodeBuildBrowserDictionary.ts`がgzip level 6でshardごとにserialize → gzip → writeを逐次実行する。Nodeのzlibをbrowser barrelへexportしない。生成前は既知の生成物のみを削除し、追跡ファイル・未知ファイル・symlinkを検出した場合は削除前に停止する。旧`.json`と古い`.gz`の残留を防ぎ、manifestは全shard成功後に書き込む。

Loaderは`compression === "gzip"`ならraw bytesを`arrayBuffer()`で取得し、Web標準`DecompressionStream("gzip")`で明示的に展開後、UTF-8テキストをJSON.parseする。HTTP Content-Encodingによる自動展開には依存しない。compressionがないschemaVersion=1のmanifestは従来どおり`response.json()`で読む。未対応browserは明確なエラーとし、追加の圧縮ライブラリは導入しない。

`compressedBytes`はgzip実ファイルサイズ、`uncompressedBytes`は展開後UTF-8 JSONサイズ。CLI統計は方向別合計・平均・両サイズでの最大shard（4種類）を出力する。`totalCompressedBytes`と`totalUncompressedBytes`は両方に非圧縮manifestのbytesを含み、平均・方向別合計はshardのみ。`compressionRatio`は圧縮後合計/展開後合計、`spaceSavedPercentage`は削減率%。0除算を防止し、空の最大shardはnullとする。

gzipは保存・通信量を削減するが、展開後JSONサイズやparse後のobject数を減らさない。約49MBの最大展開サイズへの対処が十分かどうかは、圧縮後の実測と実機のロード時間・メモリ負荷を確認してから判断する。今回shardキー再設計やDB化は行わない。

ファイル名はUnicodeコードポイントによる決定的なASCII名とする。`BrowserDictionaryLoader`はmanifestと必要shardだけをfetchし、同一セッションではPromise cacheにより重複取得しない。状態は`UNLOADED`、`LOADING`、`LOADED`を区別し、未ロード範囲を候補0件と解釈してはならない。

React側の`BrowserDictionarySession`が必要範囲を非同期に保証した後、ロード済みentryを保持する同一`InMemoryDictionaryRepository`を同期GameStateへ渡す。出典情報は原典metadataをmanifestへ保持し、`NOTICE.md`の条件を引き継ぐ。

Stage 8.4.3ではLoader生成時に空のRepositoryを一度だけ生成し、shard fetch → body read → gzip decode/JSON parse → `addEntries(entries)`の順で追加する。Repository object identityを維持し、全ロード済みentry/indexの再構築とLoader側の全entry Mapを廃止する。RepositoryはIDのSetで既存登録とbatch内の重複を除き、新規entryだけを読み・先頭1文字・先頭2文字・末尾1文字・文字数・文字種indexへ追加する。配列はloopでpushし、entry objectをcloneしない。

`addEntries`は`{ added, skippedDuplicates }`、readonly getterの`size`は登録件数を返す。既存constructorも同じ追加処理を利用する。同一IDの初出entryを保持し、後続の重複で内容を上書きしない。候補順は初出ロード順・shard内順で、追加sortingなし。異なるsourceの異なるIDは従来どおり残し、全query・DictionaryScope・properNounTypesのANY判定を維持する。登録済みentryは呼び出し側で変更しない。

新規batchの全entryをindex更新前に検証し、不正データ時は追加を開始しない。commit部分ではawait・validation・外部callbackを行わない。HTTP・body read・gzip・JSON parse・index検証の失敗はshardの失敗Promiseをcacheから除き、後からretryできる。同時shard要求はfetchからindex追加まで1つのPromiseを共有する。既存GameStateの辞書load中pause/resumeとSessionの次接続候補確認用先読みは変更しない。

optional runtime APIの`DictionaryTimingOptions`（Loader constructor第4引数）は`onTiming`と`now`を受け取る。`DictionaryTimingEvent`のphaseはmanifest、shard-fetch、shard-body-read、gzip-decode-and-parse、repository-index、shard-total。完了順にdurationMs・success/error・方向/文字・件数・manifestのbytesを通知し、index/total成功時は追加/重複件数も通知する。totalはmanifest待ちを除く。旧JSONではbody-readにJSON parseを含める。cache hitは計測せず、callback未指定なら時計を呼ばない。時計はperformance.now（fallback Date.now）、testではfake clockを注入する。callback例外でloadを失敗させない。

`?dictionaryMetrics=1`を明示した場合だけReactの本番辞書LoaderがConsoleへ計測を出し、通常画面には表示しない。timingはruntime情報のみでmanifest/辞書schemaは変更しない。既存gzip full-v1の再生成・再uploadとVercel環境変数の変更は不要。shard分割・永続cache・先読み戦略の変更や実辞書の耐久試験はこのStageに含めない。

Stage 8.1以降、Sessionは回答読みの先頭shardを取得後、実際の候補を`ResolvedWord`化し、ルールエンジンの`deriveNextConnection`から次shardを決定する。TWO_CHARACTERでは次条件2文字の先頭、通常系の長音終端では直前かな、REVERSEでは先頭文字に対応する末尾shardを取得する。

manifest取得Promiseはfetch・parse・validation失敗時に解除し、次回操作で再試行可能とする。shard取得失敗時のcache削除と同じ方針である。

Stage 8.2では`deriveNextConnection`が返す正規サイズの接続かなをそのままshard選択へ利用する。例えば`かいしゃ`のNORMAL回答後は`by-first/や`を取得し、`by-first/ゃ`を候補0件として誤判定しない。

## 23. Stage 8.3 外部静的辞書配信

ブラウザ辞書のBase URLは公開環境変数`VITE_DICTIONARY_BASE_URL`から取得し、空または未設定なら`/dictionary`へfallbackする。末尾slashは除去し、LoaderはVercel Blobを認識せず通常のHTTP Base URLとして扱う。`?dictionary=fixture`では従来どおり外部辞書を使用しない。

再生成可能な`public/dictionary/`はGit管理外を維持する。`dictionary:blob:upload -- --prefix <version>`は配下だけを再帰列挙し、Windows pathをBlob用`/`へ変換する。最大4並列でshardを先にuploadし、全成功後にmanifestを最後に公開する。pathnameはversion prefixと相対pathの決定的な組で、random suffix・overwriteを許可しない。

Stage 8.4.2ではmanifestは`application/json`、gzip shardは`application/gzip`。HTTP Content-Encodingは設定しない。upload前に全参照ファイルと圧縮bytesを確認し、参照外ファイル・拡張子取り違えがあれば停止する。multipartはgzip実ファイルサイズが4,000,000 bytes以上なら有効。完了時のuploaded bytesはmanifestを含む実際の保存ファイル合計。

upload用`BLOB_READ_WRITE_TOKEN`はNode CLIだけが`process.env`から読み、ブラウザコードや`VITE_`変数へ渡さない。upload後はmanifestのSDK返却URLからBase URLを導出するため、Blob hostをコードへ固定しない。

## 24. Stage 8.4 JMnedict本番統合とcoverage監査

本番生成はJMdictとJMnedictの両パスを`dictionary:build`へ渡す。JMdictの採用範囲は`n`, `n-adv`, `n-pr`, `n-pref`, `n-suf`, `n-t`, `num`, `pn`と`proverb`のまま維持する。JMnedictはPERSON、PLACE、ORGANIZATION、WORK、PRODUCT、OTHERへ分類し、未知の`name_type`でもbuildを停止しない。Stage 8.4.1以降は既知カテゴリがないentryだけOTHERとする。日本語として正規化できない読み・表記は`createWordEntry`前に除外するが、日本語を含む混在表記は保持する。

`DictionaryMetadata.statistics`は後方互換のためoptionalとし、総数、source別、JMdictの一般名詞/ことわざ、JMnedictの分類別件数を保持する。ブラウザmanifestはmetadataをそのまま保持し、shard内の`source`と`properNounType`も削除しない。

`dictionary:audit`は生成JSON全体をscopeで絞らず監査し、正規化読みごとにsource、reading、surface、properNounType、partOfSpeech、semanticTagsを表示する。通常プレイのscopeは全項目有効とし、JMdict/JMnedictを同じRepositoryで検索する。有名度、姓・名の形式、地名規模による追加フィルタは行わない。重複キーはsourceを含む従来仕様を維持し、通常モードの使用済みキーは読み、漢字モードは表記とする。

辞書更新は既存Blob版を上書きせず`dictionaries/full-v1`のような新規prefixへ公開し、Vercel環境変数を切り替える。旧版は実機確認が終わるまでrollback用に保持する。

Stage 8.4.1ではoptionalの`properNounTypes`追加によりschemaVersion=1を維持する。shard JSONにも配列をそのまま保持し、ロード後のRepositoryで同じscope判定を使用する。auditはlegacy分類と配列の両方を表示する。配列がない旧JSONでは`properNounTypes: -`を表示し、再生成が必要なことを判別できる。

新規生成の`statistics.jmnedict`はCategory memberships（カテゴリ所属件数）。1entryが複数分類に属する場合、それぞれへ1件ずつ加算するため、分類件数合計は`bySource.JMnedict`を超え得る。総entry数は従来どおり重複排除後のレコード数とする。旧metadataのprimary分類件数は読み込み時に変更せず、再生成後に所属件数へ更新する。
