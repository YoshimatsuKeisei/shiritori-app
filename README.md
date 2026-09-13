# しりとりアプリ 設計書セット

このフォルダには、Codex実装用の設計書をまとめています。

## Core Specs

- `game_spec.md` — ゲーム全体仕様
- `rule_engine_spec.md` — ルール判定・競合・制約
- `dictionary_spec.md` — JMdict / JMnedict / 文字正規化
- `game_state_spec.md` — 状態遷移・タイマー・脱落・順位
- `data/data_schema.md` — TypeScript想定データ構造
- `ui/play_screen_spec.md` — プレイ画面UI仕様

## 実装推奨順

1. 辞書生成・正規化
2. ルールエンジン
3. GameState / TurnState
4. 1 vs 1 ロジック
5. プレイ画面
6. 漢字候補UI
7. 3人以上の脱落戦
8. リザルト集計

## ローカル辞書生成

EDRDGから適切に取得したJMdict/JMnedictのXMLまたはXML.GZをローカル入力として指定する。

```bash
npm.cmd run dictionary:build -- --jmdict data/raw/JMdict_e.gz --jmnedict data/raw/JMnedict.xml.gz
```

既定出力は`data/generated/dictionary.json`。`--jmdict`だけの生成も可能だが、本番ではJMdict＋JMnedictを指定する。ファイル名は固定せず、実際に取得したXML/XML.GZのパスを渡す。原典と本番生成物はGit管理外で、出典・利用条件は`NOTICE.md`を参照する。

生成後、読みのcoverageと採用されたsource・表記・分類・POSを監査できる。複数の`--reading`を指定しても辞書JSONは1回だけロードする。1語でも見つからない場合は全件表示後に終了コード1となる。

```powershell
npm.cmd run dictionary:audit -- --reading とうきょう --reading おおさか --reading やまだ
npm.cmd run dictionary:audit -- --dictionary data/generated/dictionary.json --reading かいしゃ
```

`NOT FOUND`はPOSを即座に拡張する根拠ではない。原典収録状況、POS、表記・読みvalidationを切り分けてから採用基準を見直す。

### Stage 8.4.1 複数の固有名詞カテゴリ

JMnedictの1entryは複数の論理カテゴリに属することができる。例えば`place, surname`は`properNounTypes: ["PERSON", "PLACE"]`となる。配列は重複を除き、PERSON → PLACE → ORGANIZATION → WORK → PRODUCT → OTHERの固定順で生成する。既知カテゴリがない場合だけOTHERとし、既知＋未知tagでは既知カテゴリのみ保持する。元tagは`semanticTags`に残る。

scope判定は「有効なカテゴリが1つでも一致すれば採用（ANY enabled category matches）」。人名OFF・地名ONでもPERSON＋PLACEの語を利用できる。ただし`properNouns=false`は全固有名詞を除外する。legacyの`properNounType`は固定順の先頭として残し、新配列がない旧JSON（または空配列）はlegacy分類、両方なければOTHERへfallbackする。旧JSONから失われた複数分類を復元するには原典から再生成が必要。

`dictionary:audit`は`properNounType`と`properNounTypes`を両方表示する。旧JSONで配列がない場合は`properNounTypes: -`と表示する。`dictionary:build`の`Category memberships`およびmetadataの`statistics.jmnedict`は所属件数であり、PERSON＋PLACEの1entryを両方へ1件ずつ数える。分類件数の合計はJMnedict総entry数を超え得る。Stage 8.4の旧metadataの分類統計はprimary件数のままで、再build後に所属件数へ更新される。

## 1人デバッグGameState

`createDebugGame`、`submitAnswer`、`selectKanjiCandidate`、`cancelKanjiSelection`で、UIなしの1人しりとり状態遷移を実行できる。辞書fixtureを使った連続回答、漢字・カタカナ確定、候補0件、時間記録の実行例は`src/game/debugGame.test.ts`を参照する。

```bash
npm test
```

第4段階ではタイマーのカウントダウン、プレイヤー交代、対人戦を未実装とし、第5段階でReact製の1人デバッグUIを追加した。

## ブラウザ版1人デバッグUI

Vite + React + TypeScriptで、既存の`DebugGameState`と辞書Repositoryへ接続するプレイ画面MVPを実装している。

初回または原典辞書更新後に、ブラウザ用shardを明示的に生成してから起動する。

```bash
npm install
npm run dictionary:browser
npm run dev
```

既に`public/dictionary/manifest.json`とshardが存在すれば、以後は`npm run dev`だけで起動できる。通常起動は本番JMdict/JMnedict shardを利用し、生成元の巨大JSONをJavaScript bundleへ含めず、必要な先頭・末尾文字shardだけを遅延fetchする。fixtureを明示利用する場合はURLへ`?dictionary=fixture`を付け、その場合だけ`DEBUG DICTIONARY`を表示する。

`public/dictionary/`は再生成可能な派生物であるためGit管理外とする。JMdict/JMnedict統合後の非圧縮shardは実測約946MB（2方向合計）。Stage 8.4.2ではgzip配信へ変更し、圧縮後容量を生成時に計測する。生成script、manifestの型、出典情報、再生成手順はGit管理する。出典と再配布条件は`NOTICE.md`を参照する。

主な確認コマンド：

```bash
npm test
npm run typecheck
npm run build
```

Node向けライブラリ成果物は`dist/`、Viteのブラウザ成果物は`web-dist/`へ出力する。lintスクリプトは現時点では未設定。

## UI非依存1vs1 GameState

第7段階では既存の1人用UIを変更せず、`src/game/versusGame.ts`へ2人対戦状態を追加した。`createVersusGame`、`submitVersusAnswer`、`selectVersusKanjiCandidate`、`skipVersusTurn`、`checkVersusTimeout`で対戦を進行できる。

個別時計は`Clock.now()`との差分で計算する。辞書shard取得前に`pauseForDictionaryLoad`、成功後に`resumeAfterDictionaryLoad`を呼ぶことでロード時間を除外する。ロード失敗時はpause状態を維持し、プレイヤー敗北にはしない。使用済み語は試合全体で共有し、`END_WITH_N`、`TIMEOUT`、`NO_VALID_WORD`で相手の勝利を確定する。

`selectVersusGameView`から現在・待機プレイヤー、0未満にならない有効残り時間、勝者、平均回答時間、平均文字数、最長語を取得できる。Reactの1vs1画面への接続は次段階の対象とする。

## 1vs1 React MVP

第8段階では通常の`npm run dev`で1vs1設定画面を開く。試合形式、制約、1〜10分または最大60分のカスタム持ち時間、スキップ有無を設定して、同じ端末を2人で交互に操作できる。

UIの200ms tickerは表示更新とTIMEOUT確認専用で、時間は`VersusGameState + Clock`から取得する。回答に必要な辞書shard取得中はGameStateを正式にpauseし、成功後にresumeする。失敗時は停止状態のまま再試行でき、fixtureへ自動フォールバックしない。

- 従来の1人画面: `?mode=debug`
- 明示的fixture辞書: `?dictionary=fixture`
- 1人画面＋fixture: `?mode=debug&dictionary=fixture`

GAME OVER後は簡易リザルト、同設定での再戦、設定へ戻る操作を利用できる。多人数・オンライン・CPUは未実装。

## 重要な確定仕様

- 入力はひらがな
- 名詞中心、ことわざ可
- JMdict / JMnedict を使用
- 漢字限定時のみ候補選択
- カタカナ限定もひらがな入力で判定
- 小文字・「ー」も1文字
- 「ん」終了は即敗北
- 不正解は再入力可、タイマー継続
- 試合形式を1つ選択し、形式ごとの上限内で制約オプションを追加
- ゲーム設定は3枠に含めない
- 3人以上は脱落戦

## Stage 8.1 修正

- 初戦開始直後から1vs1表示tickerを起動
- NORMAL・GROWING_LENGTH・FORBIDDEN_CHARACTERでは長音終端の直前かなを次接続に使用
- TWO_CHARACTERの先読みshardを末尾2文字条件の先頭文字へ修正
- 漢字・部首継承制約を2語目以降だけ適用
- manifest取得失敗後の再試行を可能化
- 公開設定画面へJMdict / JMnedict / EDRDGクレジットを表示

辞書のPOS・固有名詞採用範囲は今回変更していない。実際のRejectReasonと対象語を収集してから調整する。

今後の確認事項：

- 厳密なひらがな入力validationは未実装。現状はカタカナも正規化される
- TWO_CHARACTERで1文字語を受理した場合の次条件仕様は未確定

## Stage 8.2 修正

1文字接続形式では、回答末尾の小書き仮名を次接続に限って通常サイズへ変換する。例えば`かいしゃ → や`となり、`やさい`へ接続できる。Browser SessionもRuleEngineが生成した同じ条件から`by-first/や`を取得する。

TWO_CHARACTERの`かいしゃ → しゃ`、REVERSE、文字数、小書き文字を保持する辞書データは変更していない。Stage 8.1の長音処理も同じhelper内で先に解決する。

## GitHub → Vercel + Vercel Blob deployment

アプリ本体はGitHubからVercelへbuildし、ブラウザ辞書の`manifest.json`と`*.json.gz`はPublic Vercel Blob Storeへversion別に配置する。`public/dictionary/`、`web-dist/`、`dist/`はGit管理しない。

### Stage 8.4.2 gzip生成と容量確認

`dictionary:browser`はNode標準`node:zlib`のgzip level 6で1 shardずつ圧縮し、`manifest.json`（非圧縮）と`by-first/*.json.gz`・`by-last/*.json.gz`のみを生成する。生成開始時、出力ディレクトリ内の既知の生成物を事前検査して除去する。Git追跡ファイル、生成物以外のファイル、symlinkを含む出力先は拒否する。既定出力は`public/dictionary`で、`--out`も専用の生成物ディレクトリを指定する。削除した生成物は生成元JSONから再生成できる。原典と`data/generated/dictionary.json`には触れない。

新しいbrowser manifestはschemaVersion=2。各shardに`compression: "gzip"`、`compressedBytes`（ファイル/転送bytes）、`uncompressedBytes`（展開後UTF-8 JSON bytes）を保持する。WordEntry側のschemaVersionは1のまま。Loaderはcompressionなしの旧manifestを従来のJSONとして読み込むため、既存Blob辞書も利用できる。

gzip shard is stored as an explicit compressed artifact. BrowserDictionaryLoader explicitly decompresses it. It does not depend on HTTP Content-Encoding. `.gz`は`application/gzip`、manifestは`application/json`で保存し、HTTPの`Content-Encoding: gzip`には依存しない。ブラウザでは`arrayBuffer()` → `DecompressionStream("gzip")` → UTF-8テキスト → `JSON.parse()`の順に読む。Web標準APIを利用し、Nodeのzlibや追加の圧縮ライブラリはブラウザへ組み込まない。

対象はCompression Streams API対応ブラウザ。[MDNの互換性情報](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream)で対応を確認できる。未対応なら`This browser does not support gzip dictionary decompression.`をthrowする。HTTP取得、gzip展開、JSON parseの失敗はそれぞれ区別し、失敗したshardは次回再試行可能。展開中も同じPromiseを共有する。

生成完了時の主な統計：

- `totalEntries`, `totalFiles`, `manifestBytes`
- `totalCompressedBytes`, `totalUncompressedBytes`：両方に非圧縮manifestを含む。旧`totalBytes`は廃止
- `compressionRatio`：`totalCompressedBytes / totalUncompressedBytes`（0〜1付近の比率。0.184なら18.4%）
- `spaceSavedPercentage`：`(1 - compressionRatio) * 100`。空入力の0除算を防止
- `firstCompressedBytes`, `firstUncompressedBytes`, `lastCompressedBytes`, `lastUncompressedBytes`：方向別shard合計、manifestを除く
- `averageCompressedShardBytes`, `averageUncompressedShardBytes`：shardのみの平均
- `largestCompressedFirstShard`, `largestCompressedLastShard`：転送bytes最大
- `largestUncompressedFirstShard`, `largestUncompressedLastShard`：展開後JSON bytes最大

最大shardの各項目はpath、文字、件数と両方のbytesを含む。gzipで保存容量・転送量は減るが、約49MB級の展開後JSONや`JSON.parse`後のobjectメモリは減らない。今回shard方式は変更せず、圧縮後実測とスマホの操作・ロード時間を見て、次段階で細分化が必要か判断する。

Stage 8.4.1後の生成元JSONが最新なら`dictionary:build`の再実行は不要。まず`npm.cmd run dictionary:browser`だけを実行し、上記の容量・4種類の最大shard統計を共有して判断してからuploadする。圧縮後の実測を確認するまで本番Blobへ投入しない。

### 1. Public Blob Storeを準備

Vercel側でPublic Blob Storeを作成または利用可能にし、read/write tokenを取得する。Dashboardの画面名称は変更されることがあるため、現在のVercel Blob案内に従う。

### 2. tokenをローカルPowerShellへ設定

```powershell
$env:BLOB_READ_WRITE_TOKEN="<token>"
```

### 3. 辞書をversion prefixへupload

ブラウザ辞書が未生成なら、先に`npm.cmd run dictionary:browser`を実行する。Stage 8.4.2では圧縮統計を確認し、容量・最大転送shardが妥当と判断できた後だけ次へ進む。

```powershell
npm.cmd run dictionary:blob:upload -- --prefix dictionaries/full-v1
```

CLIは`public/dictionary/`内のshardを最大4並列でuploadし、manifestを最後にuploadする。同一pathnameのoverwriteとrandom suffixは無効。途中失敗したprefixは再利用せず、別のversion prefixを使用する。

upload前にmanifest参照先の存在、圧縮形式と拡張子、圧縮bytesを検査する。参照されない旧`.json`等が混在していればupload前に停止する。multipartの閾値4,000,000 bytesは実際にuploadするファイルサイズで判定する。

完了時に表示される`Dictionary base URL`をコピーする。

### 4. Vercel Projectの公開環境変数

Vercel Projectへ次を設定する。

```text
VITE_DICTIONARY_BASE_URL=https://<upload結果のpublic-host>/dictionaries/full-v1
```

host名を例から推測せず、CLIが返したURLを使用する。末尾slashの有無はどちらでもよい。未設定のローカル開発では従来どおり`/dictionary`を使用する。

### 5. GitHub repositoryをImport

Vercelで`YoshimatsuKeisei/shiritori-app`をImportし、現在のプロジェクト設定に合わせて次を使用する。

```text
Build Command: npm run build
Output Directory: web-dist
```

GitHubには辞書生成物がなくてもbuildできる。実行時に`VITE_DICTIONARY_BASE_URL`からmanifestと必要shardだけを取得する。

### 6. 以後のアプリ更新

コードだけの変更では通常どおりcommit・pushし、VercelのGit連携でbuildする。辞書の再uploadは不要。

```powershell
git add .
git commit -m "..."
git push
```

### 辞書更新時

原典または辞書生成ロジックを更新した場合に、辞書生成、browser shard生成、新しいversion prefixへのuploadを行う。Stage 8.4.1では以下の順に実行し、auditで東京・大阪などの`properNounTypes: PERSON, PLACE`を確認してからbrowser生成とuploadへ進む。

```powershell
npm.cmd run dictionary:build -- --jmdict data/raw/JMdict_e.gz --jmnedict data/raw/JMnedict.xml.gz
npm.cmd run dictionary:audit -- --reading とうきょう --reading おおさか --reading やまだ --reading たなか
npm.cmd run dictionary:browser
# 圧縮統計を共有・確認してから次を実行
npm.cmd run dictionary:blob:upload -- --prefix dictionaries/full-v1
```

CLIが出力した`dictionaries/full-v1`のBase URLへVercelの`VITE_DICTIONARY_BASE_URL`を変更して再deployする。既存`dictionaries/jmdict-v1`へ上書きせず、正常動作を確認するまで旧版を削除せずrollback可能な状態を維持する。Redeploy後は通常回答、固有名詞、タイマー、shardロード時間、スマホ操作を実機確認する。

`dictionaries/full-v1`を既に使用済みの場合は、上書きせず未使用のversion prefixを指定する。Redeploy後は実機で通常回答と漢字候補選択を確認する。

### Security

- `BLOB_READ_WRITE_TOKEN`: secret。Git commit禁止、ブラウザ利用禁止、`VITE_` prefix禁止
- `VITE_DICTIONARY_BASE_URL`: 公開読み取りURL。ブラウザbundleへ公開されてよい
- `.env.local`と`.env.*.local`はGit管理外
- 辞書本体を`git add -f`、Git LFS、Release添付、base64埋込でRepositoryへ追加しない
