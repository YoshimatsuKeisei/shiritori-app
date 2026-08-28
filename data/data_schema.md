# しりとりアプリ データスキーマ設計書

## 1. 目的

実装で扱う主要データ構造の概念スキーマを定義する。

TypeScript利用を想定した例を示す。

---

## 2. Player

```ts
type PlayerId = string;

interface Player {
  id: PlayerId;
  name: string;
  isAlive: boolean;
  turnOrder: number;

  remainingTimeMs: number;

  skipRemaining: number;

  validAnswerCount: number;
  totalValidAnswerTimeMs: number;
  totalValidCharacterCount: number;

  longestWord?: ResolvedWord;

  eliminatedAt?: number;
  eliminationReason?: EliminationReason;
}
```

---

## 3. WordEntry

辞書DB上のレコード。

```ts
interface WordEntry {
  id: string;

  source: "JMdict" | "JMnedict";

  reading: string;
  normalizedReading: string;

  surface: string;
  normalizedSurface: string;

  partOfSpeech: string[];
  semanticTags: string[];

  properNounType?: ProperNounType;

  scriptType:
    | "kanji"
    | "katakana"
    | "hiragana"
    | "mixed";

  characterCount: number;

  firstChar: string;
  lastChar: string;
  firstTwoChars: string;
  lastTwoChars: string;

  kanjiChars: string[];

  usageKeyNormal: string;
  usageKeyKanji: string;
}
```

```ts
type ProperNounType =
  | "PERSON"
  | "PLACE"
  | "ORGANIZATION"
  | "WORK"
  | "PRODUCT"
  | "OTHER";
```

```ts
interface DictionaryMetadata {
  schemaVersion: number;
  generatedAt: string;
  jmdictSource?: string;
  jmnedictSource?: string;
}

interface GeneratedDictionary {
  metadata: DictionaryMetadata;
  entries: WordEntry[];
}

interface DictionaryQuery {
  reading?: string;
  startsWith?: string;
  endsWith?: string;
  exactLength?: number;
  forbiddenCharacters?: ReadonlySet<string>;
  scriptType?: "kanji" | "katakana";
  scope?: DictionaryScope;
}
```

---

## 4. ResolvedWord

ユーザー入力から最終的に確定候補となった語。

```ts
interface ResolvedWord {
  entryId: string;

  input: string;

  reading: string;
  surface: string;

  normalizedReading: string;

  characterCount: number;

  firstChar: string;
  lastChar: string;
  firstTwoChars: string;
  lastTwoChars: string;

  scriptType: WordEntry["scriptType"];

  kanjiChars: string[];

  source: WordEntry["source"];

  usageKey: string;
}
```

---

## 5. GameSettings

試合形式・制約オプションとは独立したゲーム全体の設定。スキップは制約オプション数に含めない。

```ts
interface GameSettings {
  initialTimeMinutes: number;

  allowSkip: boolean;
  skipCountPerPlayer: number;

  dictionaryScope: DictionaryScope;
}

interface DictionaryScope {
  commonNouns: boolean;
  proverbs: boolean;
  properNouns: boolean;
  people: boolean;
  places: boolean;
  organizations: boolean;
  works: boolean;
  products: boolean;
}
```

---

## 6. MatchFormat

```ts
type MatchFormat =
  | "NORMAL"
  | "TWO_CHARACTER"
  | "GROWING_LENGTH"
  | "CATEGORY_MASTER"
  | "REVERSE"
  | "FORBIDDEN_CHARACTER";

const MAX_CONSTRAINT_OPTIONS: Readonly<Record<MatchFormat, number>> = {
  NORMAL: 3,
  TWO_CHARACTER: 2,
  GROWING_LENGTH: 0,
  CATEGORY_MASTER: 2,
  REVERSE: 2,
  FORBIDDEN_CHARACTER: 2,
};
```

---

## 7. ConstraintOption

```ts
type ConstraintOption =
  | "KANJI_ONLY"
  | "KATAKANA_ONLY"
  | "REQUIRED_LAST_KANJI"
  | "REQUIRED_LAST_KANJI_RADICAL";
```

`KANJI_ONLY` と `KATAKANA_ONLY` は排他。末尾漢字・同部首オプションは `KANJI_ONLY` を必須とし、互いに排他とする。同一オプションの重複指定は禁止する。

---

## 8. ForbiddenSlot

```ts
type ForbiddenSlot =
  | {
      group: "A";
      char: string;
    }
  | {
      group: "B";
    }
  | {
      group: "C";
    }
  | {
      group: "D";
    };
```

禁止文字しりとり内部の指定として最大3要素。試合形式へ追加する制約オプション数とは別に数える。複数枠ではGroup Aを最低1つ必要とし、B/C/Dだけの複数指定は不可とする。

---

## 9. TurnCondition

```ts
interface TurnCondition {
  startChar?: string;
  startTwoChars?: string;

  requiredEndChar?: string;

  exactLength?: number;
  minLength?: number;

  forbiddenChars: Set<string>;

  requiredKanji?: string;
  requiredRadicalId?: string;
}
```

---

## 10. TurnRecord

```ts
interface TurnRecord {
  turnNumber: number;
  playerId: PlayerId;

  startedAt: number;
  endedAt: number;

  elapsedMs: number;

  inputAttempts: InputAttempt[];

  result:
    | "ACCEPTED"
    | "SKIPPED"
    | "ELIMINATED";

  acceptedWord?: ResolvedWord;

  eliminationReason?: EliminationReason;
}
```

---

## 11. InputAttempt

```ts
interface InputAttempt {
  input: string;
  submittedAt: number;

  status:
    | "REJECTED"
    | "KANJI_SELECTION"
    | "ACCEPTED";

  rejectReason?: RejectReason;

  selectedEntryId?: string;
}
```

---

## 12. GameState

第4段階で実装するUI非依存の1人用状態は次のとおり。下記の多人数`GameState`は将来拡張モデルとして残す。

```ts
interface DebugGameState {
  status: "READY" | "WAITING_FOR_INPUT" | "WAITING_FOR_KANJI_SELECTION" | "GAME_OVER";
  matchFormat: MatchFormat;
  constraintOptions: readonly ConstraintOption[];
  dictionaryScope: DictionaryScope;
  startChar: string;
  currentConnection: ConnectionCondition;
  previousWord?: ResolvedWord;
  answerHistory: readonly AnswerRecord[];
  usedNormalKeys: ReadonlySet<string>;
  usedKanjiKeys: ReadonlySet<string>;
  requiredLength?: number;
  forbiddenCharacters?: ReadonlySet<string>;
  pendingKanjiSelection?: PendingKanjiSelection;
  gameOverReason?: EliminationReason;
  turnNumber: number;
  turnStartedAt: number;
}

interface AnswerRecord {
  turnNumber: number;
  word: ResolvedWord;
  displayText: string;
  submittedReading: string;
  startedAt: number;
  acceptedAt: number;
  elapsedMs: number;
}

interface PendingKanjiSelection {
  input: string;
  normalizedInput: string;
  candidates: readonly WordEntry[];
}

type ConnectionCondition =
  | { type: "STARTS_WITH"; value: string }
  | { type: "STARTS_WITH_TWO"; value: string }
  | { type: "ENDS_WITH"; value: string };
```

```ts
interface GameState {
  gameId: string;

  status:
    | "SETUP"
    | "READY"
    | "TURN_START"
    | "INPUTTING"
    | "SELECTING_KANJI"
    | "VALIDATING"
    | "REJECTED"
    | "ACCEPTED"
    | "SKIPPED"
    | "ELIMINATED"
    | "NEXT_TURN"
    | "GAME_FINISHED";

  settings: GameSettings;

  matchFormat: MatchFormat;
  constraintOptions: ConstraintOption[];

  players: Player[];

  currentPlayerId?: PlayerId;

  turnNumber: number;

  randomStartChar: string;

  currentWord?: ResolvedWord;

  usedNormalKeys: Set<string>;
  usedKanjiKeys: Set<string>;

  turnCondition: TurnCondition;

  requiredLength?: number;

  turnHistory: TurnRecord[];

  eliminationOrder: PlayerId[];
}
```

---

## 13. RejectReason

```ts
type RejectReason =
  | "WORD_NOT_FOUND"
  | "NOT_ALLOWED_POS"
  | "ALREADY_USED"
  | "CONNECTION_MISMATCH"
  | "LENGTH_MISMATCH"
  | "BELOW_MIN_LENGTH"
  | "FORBIDDEN_CHARACTER"
  | "KANJI_REQUIRED"
  | "KATAKANA_REQUIRED"
  | "REQUIRED_KANJI_MISSING"
  | "RADICAL_MISMATCH"
  | "INVALID_INITIAL_CONDITION";
```

---

## 14. EliminationReason

```ts
type EliminationReason =
  | "END_WITH_N"
  | "TIMEOUT"
  | "NO_VALID_WORD";
```

---

## 15. ResultSummary

```ts
interface ResultSummary {
  gameId: string;

  ranking: {
    playerId: PlayerId;
    rank: number;

    validAnswerCount: number;

    averageAnswerTimeMs: number | null;
    averageCharacterCount: number | null;

    longestWord?: ResolvedWord;

    usedSkip: boolean;

    eliminationReason?: EliminationReason;
  }[];
}
```

---

## 16. BrowserDictionaryManifest

```ts
interface BrowserDictionaryShardInfo {
  path: string;
  entries: number;
  bytes: number;
}

interface BrowserDictionaryManifest {
  schemaVersion: number;
  generatedAt: string;
  sourceDictionary: string;
  sourceMetadata: DictionaryMetadata;
  totalEntries: number;
  firstCharShards: Record<string, BrowserDictionaryShardInfo>;
  lastCharShards: Record<string, BrowserDictionaryShardInfo>;
}
```

各shardの実体は`WordEntry[]`。manifestに存在しない文字は、manifest取得後に限りロード済み0件と確定できる。manifestまたは対象shardの取得前は0件として扱わない。

---

## 17. VersusGameState

```ts
interface VersusPlayer {
  id: string;
  name: string;
  remainingTimeMs: number;
  isActive: boolean;
  skipRemaining: number;
  validAnswerCount: number;
  totalAnswerTimeMs: number;
  totalCharacterCount: number;
  longestWord?: ResolvedWord;
  eliminationReason?: EliminationReason;
}

interface VersusAnswerRecord extends AnswerRecord {
  playerId: string;
}

type VersusGameStatus =
  | "READY"
  | "WAITING_FOR_DICTIONARY"
  | "WAITING_FOR_INPUT"
  | "WAITING_FOR_KANJI_SELECTION"
  | "GAME_OVER";
```

`VersusGameState`は2人のplayer、`currentPlayerId`、既存ルール状態、共有使用済みキー、`winnerPlayerId`、`currentTurnElapsedMs`を保持する。平均回答時間・平均文字数は累計値と有効回答数からselectorで算出し、0回答では`null`とする。
