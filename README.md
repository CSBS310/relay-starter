# Relay

Relay matches commuting students into carpools. A driver posts an offer for one day
(from a zone, arriving at campus by a time, with some free seats, optionally detouring
through other zones); a rider posts a request (from a zone, must arrive by a time, cannot
leave before another). Relay ranks the offers that can serve a request, reserves a seat
on the best one, and keeps a simple reliability record so that people who turn up are
preferred over people who do not. It is a command-line tool backed by one JSON file; the
Sustainability Office runs it from a laptop.

**This is a fictional system made for teaching.** Larch Mountain College, the
zones, the people and every record in `data/` are invented. Nothing here is real.

## What you need

Node 20 or newer (`node --version`). Nothing else: there are no runtime dependencies.

## Getting started

```
npm install
npm run check        # typecheck + lint + tests; this is what CI runs
```

## Everyday commands

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit`                                            |
| `npm run lint`      | ESLint; complexity above 10 in any function is an error   |
| `npm test`          | Vitest, once                                              |
| `npm run coverage`  | Tests with coverage; fails under 80 % lines / 70 % branches |
| `npm run build`     | Compile `src/` to `dist/`                                 |
| `npm start -- ...`  | Run the CLI from `dist/` (same as `node dist/cli.js ...`) |

The CLI reads and writes `data/sample.json` unless you pass `--file <path>`. Zones come
from `data/zones.json` (`--zones <path>` to override). `--now YYYY-MM-DDTHH:MM` fixes the
clock, which matters for `complete` and `no-show` (they are only allowed on or after the
ride's date). Run `node dist/cli.js` with no arguments for the full command list.

## Demo walkthrough

Build first (`npm run build`). The sample data is set up for the morning of
17 November 2026, so every command below pins the clock with `--now`. The walkthrough
changes `data/sample.json`; reset it afterwards with `git checkout data/sample.json`.

1. What is on the board this morning?

   ```
   node dist/cli.js board 2026-11-17 --now 2026-11-17T07:00
   ```
   ```
   Board for 2026-11-17 (now 2026-11-17)

   Offers
   O08  Marisol Vega    sandy       via boring         07:30  08:50  3 seats  open
   O09  Hana Okafor     gresham                        07:45  08:50  2 seats  open
   O10  Ingrid Solberg  troutdale   via fairview       08:00  09:15  3 seats  open
   O11  Finn Gallagher  hood-river  via cascade-locks  07:15  08:45  2 seats  open

   Requests
   R08  Deshawn Pruitt     estacada       07:00  09:00  open
   R09  Mateo Castellanos  gresham        07:00  09:00  open
   R10  Caleb Whitlock     fairview       07:30  09:30  open
   ...
   ```

2. Mateo lives in Gresham, Hana drives from Gresham: an exact match.

   ```
   node dist/cli.js propose R09 --now 2026-11-17T07:00
   ```
   ```
   #  offer  driver       reach  arrives  score
   1  O09    Hana Okafor  exact  08:50    0.75
   Proposed M11: R09 rides with O09
   ```

3. Caleb lives in Fairview. Ingrid detours through Fairview (`via`), Hana's Gresham is
   one hop away (`adjacent`); `via` wins even though Hana arrives earlier.

   ```
   node dist/cli.js propose R10 --now 2026-11-17T07:00
   ```
   ```
   #  offer  driver          reach     arrives  score
   1  O10    Ingrid Solberg  via       09:15    0.75
   2  O09    Hana Okafor     adjacent  08:50    0.75
   Proposed M12: R10 rides with O10
   ```

4. Deshawn lives in Estacada. Marisol goes via Boring, and Boring is adjacent to
   Estacada, so you would expect a match. Try it:

   ```
   node dist/cli.js propose R08 --now 2026-11-17T07:00
   ```
   ```
   Error: No open offer can reach estacada on 2026-11-17
   ```
   (exit code 1). That is one of the open issues.

5. Mateo confirms his seat.

   ```
   node dist/cli.js confirm M11 --now 2026-11-17T07:00
   ```
   ```
   M11  O09 <- R09  confirmed
   ```

6. Ingrid's car will not start. Cancelling her offer cancels both matches on it.

   ```
   node dist/cli.js cancel-offer O10 --now 2026-11-17T07:00
   ```
   ```
   Cancelled O10 and 2 match(es): M09, M12
   ```

7. Later that morning, Hana and Mateo report the ride happened.

   ```
   node dist/cli.js complete M11 --now 2026-11-17T10:00
   ```
   ```
   M11  O09 <- R09  completed
   ```

8. Who is reliable? (Yuki missed a ride on 10 November.)

   ```
   node dist/cli.js reliability
   ```
   ```
   person              completed  no-shows  score
   Hana Okafor         3          0         0.80
   Mateo Castellanos   3          0         0.80
   Ingrid Solberg      2          0         0.75
   ...
   Yuki Tanabe         0          1         0.33
   ```

## How the code is organised

`src/domain` holds the entity types and the one error class; `src/matching`,
`src/people` and `src/zones` hold the rules and services; `src/storage` has the
in-memory and JSON-file stores; `src/cli.ts` is the only place that prints. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the diagrams, the numbered rules and the known
limitations.

## Where to start

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and review rules, then pick up
issues #1 and #2: both are small, well-bounded, and each says where to look. Every
issue cites the rule or limitation in ARCHITECTURE.md that it touches.
