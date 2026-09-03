# Hex Duel (AmazfitHex)

A **Zepp OS mini app** for Amazfit watches: the connection game Hex, for **round
screens only**. Published in the Zepp App Store as **Hex Duel**.

Hex is played on a rhombus of hexagons. Red joins the top and bottom edges, Blue
the left and right. Stones are only ever added, never moved or taken, and a full
board always holds exactly one crossing chain, so a game can never be drawn.

## Layout

| Path              | What lives there                                                  |
| ----------------- | ----------------------------------------------------------------- |
| `lib/hex/`        | Rules, board topology, position evaluation, the computer opponent |
| `lib/layout/`     | Where the board sits on a round screen, and hit testing           |
| `lib/i18n/`       | On-watch strings, one table per language                          |
| `lib/settings.js` | What is remembered between runs, and how a stored value is read   |
| `page/index.js`   | The one screen: drawing, touch, menus. Deliberately thin          |
| `utils/config/`   | Colours, spacings and device metrics                              |
| `scripts/`        | `sync-app-version.mjs`, which keeps the two version numbers level |
| `test/`           | Vitest, including `test/doubles/` for the Zepp OS runtime         |

Everything under `lib/` is a plain ES module with **no Zepp OS import**, which is
what makes it directly unit testable. The page is the only file that touches
`@zos/*`, and it is kept as thin as it can be for the same reason.

## Conventions

- **Conventional Commits**, one atomic change per commit, and the subject on a
  **single line**. Anything a reviewer would want to accept or reject on its own
  belongs in its own commit.
- **Source and config stay ASCII.** A pre-commit hook enforces it over
  `*.js`, `*.mjs`, `*.json`, `*.yml`, `*.md`. The only exception is anything under
  a path containing `i18n/`, where the on-watch translations legitimately are not.
  This file is checked too, so keep prose plain: no dashes other than `-`, no
  typographic quotes.
- **Prettier owns formatting.** Never hand-format; run `npm run format`.
- Comments explain **why**, not what. The existing code is the reference for
  density and tone - match it rather than introducing a new voice.
- Cover behaviour with tests, including the page (see `test/page.test.mjs`).

## The gates

Every pull request must pass all of these, and they all run locally:

```bash
npm run format:check    # Prettier
npm run lint            # ESLint
npm test                # Vitest
npm run version:check   # app.json still names the version being released
pre-commit run --all-files
```

CI adds `actionlint`, `cz check` over the commit range, and a Google OSV
dependency scan. `pre-commit` is a Python tool: `uv tool install pre-commit`.

## Two version numbers

A Zepp app carries its version in `app.json`, not `package.json`: `version.name`
is what a person sees, and `version.code` is an integer the store insists must
grow with every upload. `release-please` owns `package.json` and writes
`version.name` into `app.json` in the release PR; `npm run version:sync` derives
the code as `major * 10000 + minor * 100 + patch` and runs before `zeus build`.

`version:check` compares only the name. The code is legitimately one release
behind between the release PR and the build, because `release-please` cannot
compute it - do not "fix" that by asserting they match.

`app.json` is in `.prettierignore` because `release-please` rewrites it with its
own JSON formatter, and the two would fight on every release PR.

## Skills in this repository

Load these rather than rediscovering what is in them:

- **zepp-os-ui** - what actually draws and what silently does not on this
  platform, with measured costs. Read it before touching rendering or touch.
- **zepp-simulator** - running the app in the simulator, taking screenshots, and
  the fact that you cannot click in it.
- **ship-release** - pull request through to a verified release, with `gh`.
- **store-submission** - the assets and copy the Zepp console asks for.

## Reference implementations

Sibling apps by the same author, same foundation, worth reading before inventing
an approach: `AmazfitRaceStats` (the ground truth for app.json, targets, i18n),
`AmazfitSerpent`, `AmazfitSokoban`, `AmazfitKlotski`, `AmazfitBridges`,
`AmazfitBullsAndCows`. Their READMEs record platform findings this project also
depends on.
