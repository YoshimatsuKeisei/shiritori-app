# しりとりアプリ ゲーム状態・状態遷移仕様書

## 1. 目的

ターン、入力、判定、脱落、タイマー、順位決定の状態遷移を定義する。

第4段階のUI非依存な1人用`DebugGameState`を維持し、第7段階では別構造の`VersusGameState`として2人対戦、個別時計、スキップ、勝敗、統計を実装する。3人以上の脱落戦・順位処理は引き続き将来実装とする。

## 第7段階の1vs1実装

`VersusGameState`は既存`DebugGameState`相当のルール状態へ、2人の`VersusPlayer`、現在プレイヤー、勝者、累積ターン時間を追加する。回答判定・漢字候補・接続更新・候補0件判定は既存1人用コアを合成利用し、1vs1側へ複製しない。

- 先攻と開始文字は注入可能な`RandomSource`で決定する
- 正解時だけ相手へ交代し、不正解と漢字候補キャンセルでは交代しない
- 使用済みキーは試合全体で共有する
- `END_WITH_N`、`TIMEOUT`、`NO_VALID_WORD`で現プレイヤーが敗北し、相手を勝者とする
- 回答送信時は回答判定より先にTIMEOUTを確認する
- 有効回答のみ履歴・使用済み・統計へ加える

時計は`Clock.now()`との差分方式とし、実行中プレイヤーだけを減算する。不正解中と漢字候補選択中は継続する。辞書ロード開始時に`pauseForDictionaryLoad`で経過時間を確定し、`WAITING_FOR_DICTIONARY`中は停止する。`resumeAfterDictionaryLoad`時の現在時刻から再開し、ロード失敗時は停止状態を維持して敗北にはしない。

スキップはプレイヤーごとに最大1回。押下までの時間を消費して、語・接続条件・必要文字数・使用済み集合を変更せず相手へ交代する。`GROWING_LENGTH`では設定が有効でもスキップ残数を0とする。

## 第8段階のReact接続

Reactは描画、ユーザー操作、ブラウザ辞書の非同期取得、200ms間隔の表示更新を担当する。残り時間の唯一の情報源は`VersusGameState + Clock`であり、UI側で独自に減算しない。tickerは`selectVersusGameView`の再評価と`checkVersusTimeout`だけを行い、unmountまたはGAME OVER時に停止する。

回答送信時は`pauseForDictionaryLoad`、`BrowserDictionarySession.ensureAnswerAndNextTurn`、`resumeAfterDictionaryLoad`、`submitVersusAnswer`の順に実行する。取得失敗では`WAITING_FOR_DICTIONARY`を維持し、同じ回答を再試行できる。正解後に必要な次条件shardも回答判定前に取得するため、次プレイヤーの時計へロード時間を課さず、未ロード領域を`NO_VALID_WORD`として扱わない。

不正解では入力と現在プレイヤーを維持し、時計も継続する。漢字候補表示・キャンセル中もpauseしない。GAME OVER後は回答、スキップ、候補選択を無効化する。

### 第4段階の状態

```ts
type GameStatus =
  | "READY"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_KANJI_SELECTION"
  | "GAME_OVER";
```

`DebugGameState`は試合形式、制約オプション、辞書範囲、開始文字、構造化された接続条件、前語、時系列順の`answerHistory`、通常・漢字用使用済みキー、必要文字数、禁止文字、漢字候補待ち、ターン番号・開始時刻、ゲーム終了理由を保持する。

### 1人デバッグ遷移

```text
createDebugGame
  → WAITING_FOR_INPUT
  → submitAnswer
      ├─ 辞書外・ルール違反 → WAITING_FOR_INPUT（状態を進めない）
      ├─ 漢字候補あり → WAITING_FOR_KANJI_SELECTION
      │    ├─ selectKanjiCandidate → ルール評価
      │    └─ cancelKanjiSelection → WAITING_FOR_INPUT
      ├─ 正解 → 履歴・使用済み・接続条件を更新 → WAITING_FOR_INPUT
      └─ END_WITH_N / NO_VALID_WORD → GAME_OVER
```

漢字候補選択後も必ず`resolveWordEntry(..., "kanji")`と既存ルールエンジンを通す。

### 回答履歴

`AnswerRecord`は`word`、`displayText`、送信した正規化読み、`startedAt`、`acceptedAt`、`elapsedMs`を保持する。通常の`displayText`は`normalizedReading`、漢字・カタカナオンリーは確定`surface`とする。誤答や漢字候補閲覧ではターン開始時刻をリセットしない。

### 試合形式固有状態

- `TWO_CHARACTER`: 初手は`STARTS_WITH`、正解後は`STARTS_WITH_TWO`。
- `GROWING_LENGTH`: 2から開始し、正解後だけ1増やす。不正解では変更しない。
- `REVERSE`: `ENDS_WITH`接続を保持する。
- `FORBIDDEN_CHARACTER`: 展開済み禁止文字Setを保持する。
- `CATEGORY_MASTER`: 通常へ代替せず開始を拒否する。
- 部首オプション: `RadicalResolver`未注入なら開始を拒否する。

### 候補0件

Repository検索条件と全候補への既存ルール評価によって有効候補がないと証明できた場合だけ`NO_VALID_WORD`とする。使用済み語も評価で除外する。語尾「ん」の語は回答可能だが回答時に敗北する語として、候補の存在には数える。カテゴリ未実装や部首resolver不足など完全判定できない場合は0件と断定しない。

---

## 2. ゲーム状態

推奨状態：

- `SETUP`
- `READY`
- `TURN_START`
- `INPUTTING`
- `SELECTING_KANJI`
- `VALIDATING`
- `REJECTED`
- `ACCEPTED`
- `SKIPPED`
- `ELIMINATED`
- `NEXT_TURN`
- `GAME_FINISHED`

ゲーム状態は、ゲーム全体の `settings` に加えて、必ず1つの `matchFormat` と、形式別上限内の `constraintOptions` を保持する。設定確定時に純粋関数 `validateRuleConfiguration` で検証し、不正な組み合わせではゲームを開始しない。スキップはゲーム設定であり、制約オプション数に含めない。

---

## 3. 標準遷移

```text
SETUP
  ↓
READY
  ↓
TURN_START
  ↓
INPUTTING
  ↓
VALIDATING
  ├─ 不正解 → REJECTED → INPUTTING
  ├─ 正解   → ACCEPTED → NEXT_TURN
  ├─ 「ん」 → ELIMINATED → NEXT_TURN / GAME_FINISHED
  └─ 時間切れ → ELIMINATED → NEXT_TURN / GAME_FINISHED
```

漢字限定：

```text
INPUTTING
  ↓
SELECTING_KANJI
  ↓
VALIDATING
```

漢字候補選択中もタイマー継続。

---

## 4. ターン開始

`TURN_START` で以下を行う。

1. 生存プレイヤー確認
2. 現在プレイヤー決定
3. 現在条件生成
4. 候補0件事前判定
5. 候補0件なら即脱落
6. それ以外なら `INPUTTING`
7. 現在プレイヤーの持ち時間減算開始

`GROWING_LENGTH` の `requiredLength` はゲーム状態側で保持し、初期値2、正解確定ごとに1増加させる。ルールエンジンは渡された値との一致だけを判定する。

---

## 5. タイマー

各プレイヤーが個別の `remainingTimeMs` を持つ。

減算対象：

- INPUTTING
- SELECTING_KANJI
- REJECTED後の再入力待ち

減算停止：

- 他プレイヤーのターン
- GAME_FINISHED
- システム内部の極短時間VALIDATING処理

`remainingTimeMs <= 0` で `TIMEOUT` 脱落。

---

## 6. 不正解

不正解時：

1. rejectReasonを保存
2. NG理由表示
3. 入力欄を再利用可能にする
4. `INPUTTING` へ戻る
5. タイマーは継続

不正解入力そのものは使用済みに登録しない。

---

## 7. 正解

正解時：

1. 回答時間を計算
2. 有効回答として履歴追加
3. 使用済みキー登録
4. 文字数統計更新
5. 現在語更新
6. 次条件生成
7. 現在プレイヤーのタイマー停止
8. `NEXT_TURN`

---

## 8. 「ん」終了

辞書上有効な語で、その他ルールも満たした後に語尾「ん」を判定する。

`lastChar == "ん"`

なら：

- その回答は盤面の有効語として採用しない
- 使用済みに登録しない
- プレイヤーを `END_WITH_N` で脱落
- 直前の有効語を維持
- 次の生存者が同じ接続元から続行

---

## 9. 候補0件

ターン開始時に現在条件で有効候補が0件なら：

- 現在プレイヤーを `NO_VALID_WORD` で即脱落
- 救済なし
- 再抽選なし
- 時間消費なし、または判定に要した実時間のみ内部処理としユーザー持ち時間には加算しない

---

## 10. スキップ

スキップ可能か確認。

可能なら：

1. skipRemaining -= 1
2. 現条件維持
3. 現在語維持
4. 現プレイヤーは生存
5. 次プレイヤーへ移動

スキップ前に経過した持ち時間は消費済みとして残る。

---

## 11. 脱落戦

生存人数が2以上なら続行。

脱落後：

- turnOrderから脱落者を実質スキップ
- 次の生存者へ

生存人数が1になったら：

`GAME_FINISHED`

---

## 12. 順位

脱落順を記録。

最後の生存者が1位。

同着時：

1. 平均回答時間 ASC
2. 平均文字数 DESC
3. 有効回答数 DESC

---

## 13. 平均値

### 平均回答時間

```text
totalValidAnswerTime / validAnswerCount
```

### 平均文字数

```text
totalValidCharacterCount / validAnswerCount
```

有効回答0件の場合は `null` とする。

表示時は `--` 等で表現。

---

## 14. 初期化

ゲーム開始時：

- プレイヤー順ランダムシャッフル
- 開始文字ランダム抽選
- usedWords初期化
- 各プレイヤー持ち時間初期化
- skipRemaining初期化
- requiredLength初期化
- 試合形式と制約オプションの構成検証
- turnNumber = 1

---

## 15. 再戦

将来実装時：

- 同じ試合形式・制約オプション・ゲーム設定を再利用可能
- 先攻・手番順は再ランダム
- 開始文字も再ランダム
- 使用済み語はゲームごとにリセット

## 16. Stage 8.1 ticker条件

React tickerの開始条件は「gameが存在し、GAME_OVERではない」とする。初戦の`undefined → WAITING_FOR_INPUT`でもintervalを生成し、依存変更・unmount時はcleanupして多重生成を防ぐ。`WAITING_FOR_DICTIONARY`中も表示ticker自体は動作可能だが、GameStateの有効残り時間は停止する。
