---
name: store-submission
description: Prepare everything the Zepp App Store console asks for - screenshots, icon, and the copy for every field on the release form. Load this when asked to prepare a store submission, produce listing assets or screenshots, or fill in the Zepp developer console.
---

# Submitting to the Zepp App Store

Uploading is **manual**: Zepp has no publish API. The job is to produce the
bundle, the images and the copy, and hand them over. Put the images in
`tmp/store/` - `tmp/` is git-ignored, which is where working artefacts belong.

## The bundle

Download the `.zab` from the GitHub release the pipeline produced; do not build
one by hand. Its name already carries the app id, the app name and the version,
which is the quickest check that the right thing is being uploaded.

## The images

| Asset       | Spec                                                         |
| ----------- | ------------------------------------------------------------ |
| Screenshots | 360x360 px PNG, between one and ten                          |
| App icon    | 240x240 px PNG, circular, transparent background, no padding |

Take screenshots from the simulator (see the **zepp-simulator** skill for the
capture and crop, and for how to boot straight into a screen you cannot reach by
tapping). Four is a good set: the menu, a game in play, a finished game with the
result on screen, and the largest board.

The icon is generated rather than drawn, so it can be regenerated at any size and
always matches the board the game actually draws. Keep the store icon and the
icon inside the bundle (`assets/common.r/icon.png`) the same design - if the game's
look changes, both need regenerating, and the one in the bundle needs a release to
reach the store.

## The form

Fields that are always the same for this app:

- **payment status**: free
- **Publish Area**: Global
- **Call Permission**: None. The app reads the device model and screen size and
  uses local storage; it has no network, no sensors and no background execution.
- **Installation package includes SDK**: No
- **Full music playback**: No
- **Supported Devices** and **Version No.**: filled in automatically once the
  `.zab` is uploaded

`Service Category` and `App Classification` are dropdowns whose options are not
visible from outside the console. Recommend the closest fit and let the user pick.

## Writing the copy

Length limits are hard: 30 characters for the name, 40 for the introduction, 600
for the details. Write to them.

- The **introduction** is one line that has to say what the player does, not what
  the app is. "Connect your two sides before they do" beats "A game of Hex".
- The **details** should open with the rules in two or three sentences, then the
  modes, then anything unusual about the controls, and close with the privacy
  position. Someone deciding whether to install wants to know how it is played.
- The **privacy statement** must be concrete: what is collected (nothing), what is
  stored (the chosen settings, in local storage on the watch), and that removing
  the app removes it. Do not write a generic paragraph.
- **Features Descriptions** is for the reviewer, not the player: name the device
  capabilities used and why, and state plainly what is not used.

Hand the copy back in a form that can be copied field by field - each field in its
own fenced block, so nothing has to be untangled from prose.
