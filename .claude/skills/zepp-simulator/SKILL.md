---
name: zepp-simulator
description: Run the app in the Zepp OS simulator and get screenshots out of it. Load this when asked to run, launch or screenshot the app, to check a change on a watch screen, or when a rendering needs looking at rather than reasoning about.
---

# Running in the simulator

The simulator is launched from the Zeus CLI and shows the app on an emulated
watch. It is the only way to see this app short of a real device, and it is worth
using: several bugs in this project were only visible in a screenshot.

## Starting it

The user launches the simulator itself; `zeus dev` builds the app and pushes it
into whatever is running.

```bash
npx --yes @zeppos/zeus-cli@1.9.2 dev -t "Amazfit Active 2 (Round)"
```

`-t` takes a **device name, not a key from app.json**. Passing something it does
not recognise is the quickest way to see the list: it prints every supported
model and then opens an interactive picker (which will hang in a non-interactive
shell, so pass `-t` and do not rely on the prompt). Any round model works;
`Amazfit Active 2 (Round)` is 466x466 and is what this app is checked against.

Run it in the background and read its log: it stays alive and rebuilds on every
file change, which makes an edit-and-look loop cheap.

Signs it worked, in the log: `ROLLUP Transform ... JS files`, `rebuild done`,
`refreshing simulator`, `watching the changes in this project`. Lines reading
`shebei chongfu` in Chinese characters are noise from the CLI, not an error.

## Screenshots

The simulator window cannot be brought to the foreground on this setup, and a
plain screen grab of its rectangle returns the desktop. Use **`PrintWindow`**
against the window handle instead, which captures the window's own contents
regardless of what is in front of it. Find the window by its title,
`Zepp OS Simulator`.

For a store screenshot, crop the 466x466 watch face out of the window (it is
centred horizontally in the client area, below the simulator's own menu strip),
scale it to 360x360, and black out the corners outside the circle - the simulator
paints its own grey behind the round screen and it has no business in a listing.

## You cannot click in it

Every route tried here failed: synthetic mouse events at the window's screen
coordinates, `PostMessage` of `WM_LBUTTONDOWN`/`WM_LBUTTONUP` to the window, and
`AttachThreadInput` to force focus first. The window will not take the foreground
and QEMU does not read posted messages.

So **do not plan on driving the app through the simulator**. To see a screen that
is more than one tap from launch, boot straight into it: temporarily edit
`build()` to set the state you want and call `startGame()`, let the watcher
rebuild, screenshot, then revert the edit. Set up a whole position by calling
`play()` in a loop with the cell indexes you want.

Always revert those edits before committing, and check `git status` to be sure.

## What to look at

Read the pixels, not the impression. A dark board of packed cells looks like a
grey panel against black, and it is easy to invent a bug that is not there.
Sampling the colours of a scanline settles it in seconds and has already
prevented one unnecessary fix in this project.
