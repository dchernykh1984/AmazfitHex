# Amazfit Hex

**Hex** for Amazfit watches: a **Zepp OS mini app** for round screens.

Hex is a connection game played on a rhombus of hexagons. Red owns the top and bottom
edges, Blue the left and right ones, and each player is trying to be the first to join
its own two sides with an unbroken chain of its own stones. Stones are only ever added,
never moved or taken, and a full Hex board always contains exactly one crossing chain -
so the game can never be drawn.

Play it against the watch on three levels, or pass the watch back and forth with a
friend.

## Playing

- Tap an empty cell to place a stone. The cells along each edge are tinted in that
  player's colour, and the four corners carry an edge of each player, which is exactly
  how Hex counts them.
- A dot marks the stone played last.
- **Swap** appears in reply to the opening stone. This is the pie rule: the second
  player may take the opening stone instead of answering it, which is what keeps Hex
  fair, since the player who moves first is otherwise proven to have the advantage.
  Against the watch, the watch decides for itself whether to take yours.
- Board sizes are 5x5, 7x7 and 9x9. The choice of mode, level and board size is
  remembered for next time.

## The computer opponent

The search is bounded by work rather than by depth, because a watch has very little of
it to give: an alpha-beta over a handful of candidate moves, deepened until a fixed
budget of positions runs out, on flat integer buffers allocated once per board size.

Positions are judged by the classic Hex **two-distance** - how many stones a player
still needs before it owns a connection the opponent cannot cut - and candidate moves
are rated by whose crossing runs through them, so the search only ever looks at the
cells the game is actually being decided on. The three levels differ in how far they
look:

| Level  | Plays                                                           |
| ------ | --------------------------------------------------------------- |
| Easy   | Finishes a crossing it can finish; otherwise plays anywhere     |
| Normal | Weighs every candidate move one ply deep                        |
| Hard   | Searches three plies, widest at the root, within a fixed budget |

## Setup

```bash
git clone https://github.com/dchernykh1984/AmazfitHex.git
cd AmazfitHex
npm install
```

## Develop

```bash
npm test          # run the unit tests (Vitest)
npm run lint      # ESLint
npm run format    # rewrite files with Prettier
npm run dev       # run in the Zepp OS simulator
npm run preview   # QR-preview on a device via the Zepp app in Developer Mode
npm run build     # produce the .zab store bundle
```

`dev`, `preview` and `build` fetch the [Zeus CLI](https://docs.zepp.com/docs/guides/quick-start/)
on demand (`npx`), so it is not tracked as a dependency; the first run downloads it.

The rules, the geometry and the opponent are plain ES modules with no Zepp OS
dependency, so they are unit tested directly. The page is tested too: the Zepp OS
runtime modules it imports are aliased to hand-written doubles in `test/doubles/`
(wired up in `vitest.config.mjs`), so the tests build the page, tap it and read back
what it drew.

## Continuous integration and releases

Every pull request must pass the required checks: Prettier, ESLint, the unit tests,
`actionlint`, commitizen (Conventional Commits), and an OSV dependency scan.

Releases are automated with `release-please`: it maintains a version-bump PR from the
Conventional Commits and, when merged, tags a GitHub Release. The release build
workflow then produces the `.zab` store bundle and attaches it. Uploading the `.zab`
to the Zepp App Store stays manual, because Zepp has no public publish API.

The `appId` in `app.json` is a placeholder until the app is registered in the Zepp
developer console; the store will not accept a bundle built with it.

## License

Released under the [MIT License](LICENSE).
