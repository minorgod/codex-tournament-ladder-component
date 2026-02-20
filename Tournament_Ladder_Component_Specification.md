# Tournament Ladder / Bracket Component
## Production-Grade Engineering Specification (v2 — hardened & implementation-ready)

**Goal:** Build a reusable, extensible tournament UI component (brackets + ladder) with a deterministic engine, rich UX, admin controls, real-time updates, strong typing, and testability.  
**Key principle:** *Tournament logic must be deterministic and framework-agnostic; UI is a pure projection of state + events.*

---

## 0. Scope & Definitions

### 0.1 “Bracket” vs “Ladder”
- **Bracket:** A directed acyclic match graph (DAG) where matches advance winners/losers to subsequent matches.
- **Ladder:** A ranking system where participants challenge others per rules; standings evolve over time; may be seasonal.

### 0.2 Determinism
Given the same **TournamentState** and the same **Command**, the engine must always produce the same next state (no hidden randomness). Any randomness must be injected as an explicit seed value stored in state.

### 0.3 Non-goals
- No backend, auth, payments, or persistence implementation required (but API boundaries must be defined).
- No opinionated styling system required beyond tokens + minimal base styles.

---

## 1. Target Stack / Constraints

- React 18+ (UI layer)
- TypeScript 5+ with **strict** enabled
- Rendering: **SVG** primary; optional **Canvas** renderer for very large graphs
- State: Zustand or equivalent (UI store only; engine state is plain JSON)
- Real-time: WebSocket adapter + event sourcing compatibility
- Accessibility: WCAG-minded keyboard + screen reader support
- Performance target: **1,000+ participants**; bracket view responsive and smooth on mid-range devices

---

## 2. Architecture (Separation of Concerns)

### 2.1 Packages / Modules
```
/engine                 # pure deterministic logic (no React, no DOM)
  index.ts
  Engine.ts
  commands.ts           # command types + reducers
  selectors.ts          # derived read-only queries
  formats/              # built-in format plugins
  rules/                # tiebreakers, seeding, constraints
  validation.ts
  serialization.ts

/models                 # shared types (no runtime code)
  tournament.ts
  match.ts
  participant.ts
  ladder.ts
  events.ts
  theme.ts

/ui                     # React components (pure view + user intent events)
  BracketView.tsx
  LadderView.tsx
  MatchCard.tsx
  BracketCanvas.tsx     # optional
  ZoomPanSurface.tsx
  SidebarPanels.tsx
  ModalMatchDetails.tsx
  ThemeProvider.tsx
  hooks/

/realtime               # adapters (WebSocket + mocking)
  RealtimeAdapter.ts
  WebSocketAdapter.ts
  MockAdapter.ts

/admin                  # UI + helpers for privileged actions
  AdminPanel.tsx
  audit.ts

/demo                   # storybook/demo page + fixtures
/tests                  # engine unit tests + UI tests
```

### 2.2 Engine Model: Command → Reduce → State
- Engine exposes **applyCommand(state, command)** returning new state.
- Engine emits **Events** (append-only) for auditing and real-time broadcasting.
- Selectors compute derived data for UI (rounds, paths, standings, etc.).

---

## 3. Data Model (Strict Types + JSON-Serializable)

### 3.1 IDs and Time
- All IDs: opaque strings (UUID/ULID acceptable).
- All timestamps: **ISO 8601 strings** in state (not Date objects) to keep JSON serializable.

```ts
export type ID = string;
export type ISODateTime = string; // e.g., "2026-02-20T15:04:05Z"
```

### 3.2 Participant
```ts
export type ParticipantType = "player" | "team";

export interface Participant {
  id: ID;
  name: string;
  type: ParticipantType;
  seed?: number;         // 1..N (lower is better)
  rating?: number;       // optional ELO/MMR
  avatarUrl?: string;
  org?: string;
  metadata?: Record<string, unknown>;
}
```

### 3.3 Match & Scoring (sports/esports compatible)
Support multiple scoring paradigms:
- **points**: numeric points per side
- **sets**: list of set/map results
- **aggregate**: home/away aggregate
- **tiebreaker**: explicit outcome if needed

```ts
export type MatchStatus =
  | "scheduled"
  | "pending"
  | "in_progress"
  | "completed"
  | "forfeit"
  | "disqualified"
  | "void"; // canceled/invalidated

export type MatchOutcome =
  | { kind: "winner"; winnerId: ID; loserId: ID }
  | { kind: "draw" }
  | { kind: "no_contest" };

export interface SetScore {
  a: number;
  b: number;
  label?: string; // "Map 1", "Set 2"
}

export interface MatchScore {
  mode: "points" | "sets" | "aggregate";
  a?: number;              // points/aggregate for side A
  b?: number;              // points/aggregate for side B
  sets?: SetScore[];       // per set/map
  notes?: string;
}

export interface Match {
  id: ID;
  format: string;           // plugin name, e.g. "single_elim"
  stageId: ID;              // stage/group/ladder season
  roundId?: ID;             // present for bracketed formats
  bracketSide?: "upper" | "lower" | "grand" | "group" | "ladder";
  orderKey?: number;        // stable ordering within round
  participants: [ID | null, ID | null]; // null = TBD
  score?: MatchScore;
  outcome?: MatchOutcome;
  status: MatchStatus;

  scheduledAt?: ISODateTime;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;

  sources?: {
    vodUrl?: string;
    replayUrl?: string;
    streamUrl?: string;
  };

  officiating?: {
    referee?: string;
    verifiedBy?: string;
    verifiedAt?: ISODateTime;
  };

  metadata?: Record<string, unknown>;
}
```

### 3.4 Bracket Graph Model (explicit edges)
**Requirement:** Store advancement as explicit graph edges so UI and engine can validate and visualize progression.

```ts
export type Slot = "A" | "B";

export interface AdvancementEdge {
  fromMatchId: ID;
  from: { kind: "winner" | "loser"; slot?: Slot }; // slot optional if outcome is known
  toMatchId: ID;
  toSlot: Slot; // where participant lands in next match
}

export interface Round {
  id: ID;
  name: string;
  order: number;        // 0..
  matchIds: ID[];
}

export interface BracketStage {
  id: ID;
  name: string;
  format: "single_elimination" | "double_elimination" | "group_to_playoff" | "custom";
  rounds: Round[];
  matchIds: ID[];
  edges: AdvancementEdge[];
  settings: StageSettings;
}
```

### 3.5 Ladder Model
```ts
export interface LadderRuleSet {
  challengeWindow?: { minRank?: number; maxRank?: number }; // e.g., can challenge within +/- 5 ranks
  cooldownHours?: number;
  decay?: { enabled: boolean; daysInactiveToStart?: number; pointsPerDay?: number };
  swapRule: "swap_on_win" | "points" | "hybrid";
  points?: {
    win: number;
    loss: number;
    draw?: number;
    bonusStreak?: number;
  };
}

export interface LadderStandingEntry {
  participantId: ID;
  rank: number;       // 1..N (if rank-based)
  points?: number;    // if points-based
  streak?: number;
  lastMatchAt?: ISODateTime;
}

export interface LadderStage {
  id: ID;
  name: string;
  format: "ladder";
  rules: LadderRuleSet;
  standings: LadderStandingEntry[];
  matchIds: ID[]; // challenge matches are still Matches
  settings: StageSettings;
}
```

### 3.6 Tournament Root State
Tournament supports multi-stage pipelines (groups → playoffs, ladder season → playoffs).

```ts
export interface StageSettings {
  bestOf?: number;
  allowDraws?: boolean;
  reseedAfterRound?: boolean;
  autoAdvanceByes?: boolean;
  grandFinalReset?: boolean; // double elim
  tiebreakers?: string[];    // e.g. ["head_to_head", "point_diff", "buchholz"]
}

export type TournamentStage = BracketStage | LadderStage;

export interface TournamentState {
  id: ID;
  name: string;
  version: number;          // increments per command for time-travel
  createdAt: ISODateTime;
  updatedAt: ISODateTime;

  participants: Participant[];

  stages: TournamentStage[];
  matches: Match[];

  audit: AuditEntry[];      // append-only entries
  settings?: Record<string, unknown>;

  // deterministic seed for any algorithm needing randomization (e.g., swiss tie breaks)
  rngSeed?: string;
}

export interface AuditEntry {
  id: ID;
  at: ISODateTime;
  actor?: { id?: string; name?: string; role?: string };
  commandType: string;
  summary: string;
  payload?: Record<string, unknown>;
}
```

---

## 4. Engine APIs (Required)

### 4.1 Commands (Write Operations)
All state changes must occur via commands.

```ts
export type Command =
  | { type: "INIT_TOURNAMENT"; payload: InitTournamentPayload }
  | { type: "ADD_PARTICIPANTS"; payload: { participants: Participant[] } }
  | { type: "REMOVE_PARTICIPANT"; payload: { participantId: ID } }
  | { type: "SEED_PARTICIPANTS"; payload: { method: "manual" | "rating" | "shuffle"; seedMap?: Record<ID, number> } }
  | { type: "GENERATE_STAGE"; payload: GenerateStagePayload } // creates matches + edges + rounds
  | { type: "SET_MATCH_STATUS"; payload: { matchId: ID; status: MatchStatus } }
  | { type: "RECORD_MATCH_RESULT"; payload: { matchId: ID; score: MatchScore; outcome: MatchOutcome } }
  | { type: "UNDO_MATCH_RESULT"; payload: { matchId: ID; reason?: string } }
  | { type: "FORCE_ADVANCE"; payload: { fromMatchId: ID; participantId: ID; toMatchId: ID; toSlot: Slot; reason?: string } }
  | { type: "LOCK_TOURNAMENT"; payload: { locked: boolean } }
  | { type: "REGENERATE_STAGE"; payload: { stageId: ID; preserveResults?: boolean } }
  | { type: "LADDER_CHALLENGE"; payload: { challengerId: ID; challengedId: ID; scheduledAt?: ISODateTime } }
  | { type: "APPLY_DECAY"; payload: { stageId: ID; at: ISODateTime } };
```

### 4.2 Engine Surface
```ts
export interface ApplyResult {
  state: TournamentState;
  events: DomainEvent[];         // for realtime/broadcast/audit
  validation: ValidationResult;  // warnings/errors after change
}

export interface TournamentEngine {
  createEmpty(now: ISODateTime, id: ID, name: string): TournamentState;
  applyCommand(state: TournamentState, command: Command, now: ISODateTime, actor?: Actor): ApplyResult;

  // read-only helpers
  selectors: EngineSelectors;
  validate(state: TournamentState): ValidationResult;

  // serialization
  toJSON(state: TournamentState): string;
  fromJSON(json: string): TournamentState;
}

export interface Actor {
  id?: string;
  name?: string;
  role?: "viewer" | "staff" | "admin";
}
```

### 4.3 Domain Events (Real-time, audit, analytics)
```ts
export type DomainEvent =
  | { type: "MATCH_UPDATED"; matchId: ID; at: ISODateTime }
  | { type: "MATCH_COMPLETED"; matchId: ID; at: ISODateTime }
  | { type: "ADVANCEMENT_APPLIED"; fromMatchId: ID; toMatchId: ID; at: ISODateTime }
  | { type: "STANDINGS_UPDATED"; stageId: ID; at: ISODateTime }
  | { type: "TOURNAMENT_LOCKED"; locked: boolean; at: ISODateTime };
```

### 4.4 Validation
```ts
export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;           // e.g. "MATCH_PARTICIPANT_MISSING"
  message: string;
  entity?: { kind: "match" | "stage" | "participant"; id: ID };
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
```

---

## 5. Format Coverage & Rules (Must Support)

### 5.1 Built-in Formats
1. **Single Elimination**
   - Byes (auto-advance if enabled)
   - Optional 3rd-place match
   - Optional reseeding between rounds
2. **Double Elimination**
   - Upper + lower bracket
   - Grand finals
   - Optional grand finals reset
3. **Swiss**
   - Pairing by record
   - No repeat opponents constraint
   - Configurable rounds
   - Deterministic tie-breaking (Buchholz, etc.)
4. **Round Robin**
   - Single or double round robin
   - Tiebreakers
5. **Ladder**
   - Challenge creation, cooldowns, rank swap/points rules
   - Decay + seasonal reset compatible

### 5.2 Common Rule Hooks
- bestOf (series length)
- allowDraws
- forfeit/disqualification paths
- tie-breaker policies
- scheduling constraints (optional)

---

## 6. Plugin System (Extensibility)

### 6.1 Plugin Interface
Plugins generate stage structures and process match results.

```ts
export interface TournamentFormatPlugin {
  name: string; // unique

  generateStage(args: {
    stageId: ID;
    stageName: string;
    participants: Participant[];
    settings: StageSettings;
    rngSeed?: string;
  }): { stage: TournamentStage; matches: Match[] };

  processMatchResult(args: {
    state: TournamentState;
    matchId: ID;
    score: MatchScore;
    outcome: MatchOutcome;
    now: ISODateTime;
  }): { state: TournamentState; events: DomainEvent[] };
}
```

### 6.2 Plugin Registration
- Engine must allow registering plugins at runtime:
  - `engine.registerPlugin(plugin)`
- Unknown format names must be a validation error.

---

## 7. UI Requirements (React)

### 7.1 Required Views
- **BracketView**: renders BracketStage (SVG primary)
- **LadderView**: renders LadderStage (table + charts optional)
- **MatchDetails**: modal/drawer details panel
- **AdminPanel**: privileged controls + audit viewer

### 7.2 Bracket Rendering Requirements
- Support both horizontal and vertical orientation (prop-driven)
- Zoom + pan (mouse, trackpad, touch)
- Collapsible rounds (for deep brackets)
- Highlight:
  - path to finals for participant
  - upset indicators (seed-based)
  - live matches vs completed

### 7.3 Virtualization & Performance
- Must not render all match cards for huge brackets at once.
- Provide an abstraction for view window:
  - render only nodes/edges within viewport bounds (quadtree/interval indexing acceptable)
- Avoid full re-render on single match update:
  - component memoization + selectors
  - stable object identities or normalized store

### 7.4 Interaction Model
- Click match node → open details
- Keyboard navigation:
  - arrow keys move to adjacent nodes
  - Enter opens details
- Search participants (typeahead) + focus path highlight
- Filters:
  - bracket side (upper/lower)
  - status
  - stage

### 7.5 Accessibility
- Every match node has an accessible label:
  - includes participants, status, score/outcome
- Ensure focus ring visibility
- Provide reduced-motion mode

---

## 8. Admin Capabilities (UI + Engine Constraints)

### 8.1 Required Admin Actions
- Record result (with validation)
- Undo result (with cascade rollback when necessary)
- Force advance (with audit reason)
- Edit seeds / reseed / regenerate stage
- Lock tournament (disables mutations except admin override)
- Resolve disputes (notes + verification flags)

### 8.2 Audit Requirements
- Every mutating command writes an AuditEntry including actor + summary.
- Audit entries are immutable and ordered by time.

---

## 9. Real-time Sync

### 9.1 Adapter Interface
```ts
export interface RealtimeAdapter {
  connect(): void;
  disconnect(): void;

  // inbound
  onEvent(cb: (ev: DomainEvent) => void): void;

  // outbound (optional for multi-user)
  broadcast(ev: DomainEvent): void;
}
```

### 9.2 Sync Strategy
- UI listens to events and refetches/patches normalized state.
- For demo, mock adapter replays events locally.
- Must support partial updates (match-level), not “replace entire tournament” only.

---

## 10. Theming & Styling

### 10.1 Design Tokens (CSS variables)
Required minimum:
```css
:root {
  --bracket-bg: ;
  --surface: ;
  --surface-2: ;
  --border: ;
  --text: ;
  --muted: ;
  --winner: ;
  --loser: ;
  --accent: ;
  --focus: ;
}
```

### 10.2 Theme Provider
- Accepts token overrides
- Supports dark/light mode switch
- Ensures contrast minimum for text on surfaces

---

## 11. Serialization / Persistence Contract

### 11.1 JSON Format
- `TournamentState` must be fully JSON serializable.
- Provide stable schema versioning:
  - `stateSchemaVersion: number` at root or embedded in `TournamentState.settings`

### 11.2 Migration
- Provide `migrateState(json, fromVersion, toVersion)` skeleton for future compatibility.

---

## 12. Edge Cases (Must Be Handled)

### Bracket
- Odd participant counts → byes
- Participant removal after bracket generation (validation + possible regeneration)
- Undoing a result that already advanced downstream participants (cascade rollback)
- Double elimination grand finals reset (two-match possibility)
- Forfeit/disqualification outcomes and advancement rules

### Swiss
- Avoid repeat pairings
- Handle odd participant count each round (bye assignment rules must be explicit)
- Deterministic pairing ordering (no hidden randomness)

### Ladder
- Cooldown enforcement
- Challenge window rules
- Decay application idempotency (applying twice at same `at` must not double-decay)

---

## 13. Testing Requirements (Concrete)

### 13.1 Engine Unit Tests
- Determinism: same inputs → same outputs
- Bracket generation snapshots for N=2..64 participants
- Bye assignment correctness
- Double elim: standard 4/8 team flows
- Undo cascade correctness
- Swiss pairing: no repeats + record grouping + deterministic order
- Ladder: swap rules + cooldown + decay idempotency

### 13.2 UI Tests
- Match click opens details
- Zoom/pan controls function
- Keyboard navigation traverses nodes
- Theme toggle changes tokens
- Rendering performance smoke tests (virtualization)

---

## 14. Acceptance Criteria (User-Visible)

A consumer can:
1. Create a tournament state
2. Add participants and seed them
3. Generate a stage (single/double/swiss/round-robin/ladder)
4. Render bracket/ladder
5. Record results and see deterministic progression updates
6. Undo results and see consistent rollback
7. Switch themes
8. Enable live updates (mock or WebSocket)
9. Use keyboard-only navigation for core flows
10. Export/import state JSON and continue tournament

---

## 15. Implementation Deliverables (From the LLM)

1. Fully typed TypeScript models and engine
2. Built-in plugins for formats listed
3. React UI components + minimal styling tokens
4. Demo page with mock tournaments
5. Mock real-time adapter + WebSocket adapter skeleton
6. Engine unit tests + a small UI test suite
7. README documenting:
   - how to create state
   - how to render
   - how to apply commands
   - plugin authoring guide

---

## 16. Security & Safety Notes (Lightweight)
- Treat all inbound real-time events as untrusted; validate before applying
- Avoid XSS by sanitizing any user-provided strings if rendered as HTML (default render as text)
- Do not allow admin commands unless role permits (role passed to engine for validation)

---

# End of Specification (v2)
