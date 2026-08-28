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
npm run dictionary:build -- --jmdict data/raw/JMdict.xml.gz --jmnedict data/raw/JMnedict.xml.gz
```

既定出力は`data/generated/dictionary.json`。原典と本番生成物はGit管理外で、出典・利用条件は`NOTICE.md`を参照する。

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

既に`public/dictionary/manifest.json`とshardが存在すれば、以後は`npm run dev`だけで起動できる。通常起動は本番JMdict shardを利用し、約111MBの単一JSONをJavaScript bundleへ含めず、必要な先頭・末尾文字shardだけを遅延fetchする。fixtureを明示利用する場合はURLへ`?dictionary=fixture`を付け、その場合だけ`DEBUG DICTIONARY`を表示する。

`public/dictionary/`は約222MBの再生成可能な派生物であるためGit管理外とする。生成script、manifestの型、出典情報、再生成手順はGit管理する。JMdict/JMnedictの出典と再配布条件は`NOTICE.md`を参照する。

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
- 公開設定画面へJMdict / EDRDGクレジットを表示

辞書のPOS・固有名詞採用範囲は今回変更していない。実際のRejectReasonと対象語を収集してから調整する。

今後の確認事項：

- 厳密なひらがな入力validationは未実装。現状はカタカナも正規化される
- TWO_CHARACTERで1文字語を受理した場合の次条件仕様は未確定

## Stage 8.2 修正

1文字接続形式では、回答末尾の小書き仮名を次接続に限って通常サイズへ変換する。例えば`かいしゃ → や`となり、`やさい`へ接続できる。Browser SessionもRuleEngineが生成した同じ条件から`by-first/や`を取得する。

TWO_CHARACTERの`かいしゃ → しゃ`、REVERSE、文字数、小書き文字を保持する辞書データは変更していない。Stage 8.1の長音処理も同じhelper内で先に解決する。
