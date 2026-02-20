# Tournament Ladder Component

Deterministic, production-grade tournament engine + React UI for bracket and ladder formats.

## What You Get

- Deterministic command-driven engine (`Command -> applyCommand -> state/events`)
- Strict TypeScript models (JSON serializable)
- Built-in formats:
  - `single_elimination`
  - `double_elimination`
  - `swiss`
  - `round_robin`
  - `ladder`
- React views:
  - `BracketView` (SVG, zoom/pan, keyboard navigation, round collapse, path highlight, virtualization windowing)
  - `LadderView`
  - `ModalMatchDetails`
  - `AdminPanel`
  - `ThemeProvider`
- Realtime adapters:
  - `MockAdapter`
  - `WebSocketAdapter` (skeleton)
- Tests:
  - Engine determinism + format behaviors
  - UI interaction coverage

## Project Layout

```text
src/
  engine/
    Engine.ts
    commands.ts
    selectors.ts
    validation.ts
    serialization.ts
    formats/
    rules/
  models/
  ui/
    BracketView.tsx
    LadderView.tsx
    MatchCard.tsx
    BracketCanvas.tsx
    ZoomPanSurface.tsx
    SidebarPanels.tsx
    ModalMatchDetails.tsx
    ThemeProvider.tsx
    hooks/
  realtime/
  admin/
  demo/
  tests/
```

## Install / Run

```bash
npm install
npm run lint
npm test
npm run build
npm run dev
```

## Engine Usage

```ts
import { createTournamentEngine, type Command } from "@/engine";

const engine = createTournamentEngine();
let state = engine.createEmpty(new Date().toISOString(), "tour_1", "Winter Cup");

state = engine.applyCommand(
  state,
  {
    type: "ADD_PARTICIPANTS",
    payload: {
      participants: [
        { id: "p1", name: "Alpha", type: "player", seed: 1 },
        { id: "p2", name: "Bravo", type: "player", seed: 2 },
      ],
    },
  },
  new Date().toISOString(),
).state;

state = engine.applyCommand(
  state,
  {
    type: "GENERATE_STAGE",
    payload: {
      stageId: "main",
      stageName: "Main Bracket",
      format: "single_elimination",
      settings: { autoAdvanceByes: true },
    },
  },
  new Date().toISOString(),
).state;
```

## Applying Results

```ts
const result = engine.applyCommand(
  state,
  {
    type: "RECORD_MATCH_RESULT",
    payload: {
      matchId: "main_r1_m1",
      score: { mode: "points", a: 2, b: 0 },
      outcome: { kind: "winner", winnerId: "p1", loserId: "p2" },
    },
  },
  new Date().toISOString(),
  { id: "admin_1", role: "admin" },
);

state = result.state;
console.log(result.events); // MATCH_UPDATED, MATCH_COMPLETED, ADVANCEMENT_APPLIED...
```

## Rendering in React

```tsx
import { ThemeProvider, BracketView, LadderView } from "@/ui";

<ThemeProvider>
  <BracketView
    state={state}
    stageId="main"
    orientation="horizontal"
    onOpenMatch={(matchId) => console.log(matchId)}
  />
</ThemeProvider>
```

For ladder stages:

```tsx
<LadderView state={state} stageId="ladder_stage" onOpenMatch={(matchId) => {}} />
```

## Realtime Adapter Usage

```ts
import { MockAdapter } from "@/realtime";

const adapter = new MockAdapter();
adapter.onEvent((event) => {
  console.log("incoming event", event);
});
adapter.connect();

result.events.forEach((event) => adapter.broadcast(event));
```

## Serialization / Migration

```ts
const json = engine.toJSON(state);
const restored = engine.fromJSON(json);
```

`stateSchemaVersion` is embedded in state and `migrateState` is included as an extension point for schema evolution.

## Plugin Authoring Guide

Implement and register `TournamentFormatPlugin`:

```ts
import type { TournamentFormatPlugin } from "@/engine";

const myFormatPlugin: TournamentFormatPlugin = {
  name: "my_format",
  generateStage({ stageId, stageName, participants, settings }) {
    return {
      stage: {
        id: stageId,
        name: stageName,
        format: "custom",
        rounds: [],
        matchIds: [],
        edges: [],
        settings,
      },
      matches: [],
    };
  },
  processMatchResult({ state }) {
    return { state, events: [] };
  },
};

const engine = createTournamentEngine();
engine.registerPlugin(myFormatPlugin);
```

## Demo

`src/demo/DemoApp.tsx` includes:

- Multi-stage sample tournament (double elimination + ladder)
- Sidebar filters/search
- Admin actions (lock, undo, force advance, regenerate, ladder challenge/decay)
- Match details modal result entry
- JSON export/import

## Build Timeline

Commit timeline with elapsed time from zero is tracked in:

- `/Users/brett/code/tournament-ladder-component/BUILD_TIMELOG.md`

## Notes

- The engine is deterministic by design.
- All timestamps in state are ISO 8601 strings.
- UI store is isolated from engine internals; engine state remains plain JSON.

## License

MIT
