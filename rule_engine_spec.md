# しりとりアプリ ルールエンジン仕様書

## 1. 目的

UIやゲーム状態に依存せず、辞書照合・表記確定後の `ResolvedWord` を評価する純粋なルールエンジンを定義する。

## 2. ルールの3階層

### A. ゲーム設定

持ち時間、プレイヤー人数、辞書範囲、固有名詞・ことわざの許可、1ゲーム1回スキップ等。スキップは補助的なゲーム設定であり、制約オプション数には含めない。

### B. 試合形式

1ゲームにつき必ず1つ選択する。

```ts
type MatchFormat =
  | "NORMAL"
  | "TWO_CHARACTER"
  | "GROWING_LENGTH"
  | "CATEGORY_MASTER"
  | "REVERSE"
  | "FORBIDDEN_CHARACTER";
```

| 試合形式 | 制約オプション上限 |
| --- | ---: |
| `NORMAL` | 3 |
| `TWO_CHARACTER` | 2 |
| `GROWING_LENGTH` | 0 |
| `CATEGORY_MASTER` | 2 |
| `REVERSE` | 2 |
| `FORBIDDEN_CHARACTER` | 2 |

### C. 制約オプション

```ts
type ConstraintOption =
  | "KANJI_ONLY"
  | "KATAKANA_ONLY"
  | "REQUIRED_LAST_KANJI"
  | "REQUIRED_LAST_KANJI_RADICAL";
```

## 3. 構成バリデーション

`validateRuleConfiguration(matchFormat, constraintOptions)` は形式ごとの上限、重複、漢字・カタカナの排他、末尾漢字系オプションの漢字オンリー依存、末尾漢字と同部首の排他を検証する。ゲーム開始前とUIで同じ純粋関数を利用する。

## 4. 共通回答判定

ゲーム状態全体ではなく、現在語、前語、初期文字、使用済みキー、必要文字数、禁止文字、選択ルール等の最小限のコンテキストだけを渡す。結果は有効回答、再入力可能な不正解、即敗北を区別する。

判定順は、構成検証、表記制約、使用済み、接続、文字数、禁止文字、漢字継承・部首、語尾「ん」とする。辞書検索と品詞判定は `ResolvedWord` 生成前に行う。

## 5. 各試合形式

### 通常しりとり

- 初手: `current.firstChar === initialChar`
- 2手目以降: `previous.lastChar === current.firstChar`

### 2文字しりとり

- 初手だけ開始1文字で判定する。
- 2手目以降: `previous.lastTwoChars === current.firstTwoChars`
- 小書き文字と長音も独立した1文字として比較する。

### 1文字ずつ必要文字数が増えるしりとり

通常の1文字接続に加え、`current.characterCount === requiredLength` を要求する。初期値は2。正解後の加算はゲーム状態側が担当し、ルールエンジンは値を更新しない。この形式では制約オプションを選択できない。

### カテゴリマスター

形式定義と構成バリデーションのみ提供する。カテゴリ基盤が未実装のため回答判定は行わず、`CATEGORY_NOT_IMPLEMENTED` を返す。カテゴリ一覧やWordNet処理は定義しない。

### リバースしりとり

- 初手: `current.lastChar === initialChar`
- 2手目以降: `previous.firstChar === current.lastChar`

### 禁止文字しりとり

通常の1文字接続に加え、`normalizedReading` に禁止対象が含まれないことを要求する。禁止文字指定は最大3枠で、制約オプション数とは別に扱う。

- Group A: 通常かな1文字
- Group B/C/D: 辞書基盤の共通定数を利用

複数枠ではGroup Aを最低1つ必要とし、Aの文字およびB/C/Dは重複不可。B/C/Dだけの複数組み合わせは採用しない。「ん」が禁止対象なら語中・語尾とも `FORBIDDEN_CHARACTER` とする。

## 6. 制約オプション判定

### 漢字オンリー

確定した辞書表記に漢字が1文字以上含まれることを `kanjiChars` で判定する。送り仮名等を含む表記も漢字語として扱い、入力文字列は判定に使わない。

### カタカナオンリー

辞書表記の `scriptType === "katakana"` を要求する。ひらがなの入力ではなく、辞書の `surface` 由来の分類を使う。

### 最後の漢字を使用

前語の `kanjiChars` の末尾要素が現在語の `kanjiChars` に含まれることを要求する。漢字がなければ安全に不正解とする。`音楽 → 楽園` は漢字継承条件単体を満たす。ただし全体評価では接続等の選択中ルールも別途すべて満たす必要がある。

### 最後の漢字の部首を使用

部首DBをハードコードせず、次を注入する。

```ts
interface RadicalResolver {
  getRadicalId(kanji: string): string | undefined;
}
```

前語末尾漢字と現在語内のいずれかの漢字の部首IDが一致すれば条件を満たす。resolver、漢字、部首IDが得られなければ `RADICAL_MISMATCH` とする。

## 7. 使用済み判定

- 通常・カタカナオンリー: 読み単位のキーを `usedNormalKeys` と比較する。
- 漢字オンリー: 表記単位のキーを `usedKanjiKeys` と比較する。

選択モードに対応する `usageKey` を持つ `ResolvedWord` を辞書基盤で生成する。同音異義語は通常では再使用不可、異なる漢字表記は漢字オンリーでは使用可能。

## 8. 語尾「ん」と不正解・敗北

使用済み、接続、文字数、禁止文字、表記、漢字継承、部首の違反は再入力可能な不正解とする。それらを通過して `lastChar === "ん"` なら `END_WITH_N` により即敗北とする。禁止文字しりとりで「ん」が禁止されていれば、先に `FORBIDDEN_CHARACTER` とする。

`TIMEOUT` と `NO_VALID_WORD` は型を維持するが、処理はゲーム状態実装時に行う。

## 9. 次ターン接続条件

`deriveNextConnection(matchFormat, acceptedWord)` は副作用なく次を返す。

- 通常・必要文字数増加・禁止文字: 末尾1文字から始める
- 2文字: 末尾2文字から始める
- リバース: 先頭1文字で終える
- カテゴリマスター: カテゴリ基盤未実装を示す接続種別

必要文字数の加算は行わない。

## 10. ゲーム状態側の責務

候補0件の事前判定、スキップ、タイマー、必要文字数の更新、使用済みキーの登録、プレイヤー脱落はゲーム状態側が担当する。ルールエンジンは状態を変更しない。

## 11. Stage 8.1 長音接続と初手継承

NORMAL、GROWING_LENGTH、FORBIDDEN_CHARACTERでは、読みの末尾が`ー`なら直前の読み文字を接続文字とする。`ResolvedWord.lastChar`と文字数は変更せず、長音も1文字として数える。読みが`ー`だけの場合はfallbackとして`ー`を返す。

- `スーパー` → NORMAL系は`ぱ`
- `コンピューター` → NORMAL系は`た`
- TWO_CHARACTERは末尾2文字`ぱー`を維持
- REVERSEは先頭文字`す`を維持

`REQUIRED_LAST_KANJI`と`REQUIRED_LAST_KANJI_RADICAL`は`previousWord`が存在する2語目以降だけ適用する。初手は独立した`KANJI_ONLY`条件だけを判定する。部首resolver必須の設定validationは維持する。
