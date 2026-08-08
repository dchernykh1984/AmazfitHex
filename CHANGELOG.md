# Changelog

## [0.3.0](https://github.com/dchernykh1984/AmazfitHex/compare/amazfit-hex-v0.2.1...amazfit-hex-v0.3.0) (2026-08-08)


### Features

* draw the board as hexagons you can drag around ([19802fe](https://github.com/dchernykh1984/AmazfitHex/commit/19802fea6eab03130b1a19c0c6741796b4d92aba))
* let the pie rule be switched off from the menu ([eaf4825](https://github.com/dchernykh1984/AmazfitHex/commit/eaf48256b04c236cbb7cf6721fed4856b843bdbc))


### Bug Fixes

* keep a dragged board in step with what the screen can show ([a103c63](https://github.com/dchernykh1984/AmazfitHex/commit/a103c633df175d32279785187568222eb6eb03f0))
* let the board be dragged far enough to free its corner cells ([5430ba4](https://github.com/dchernykh1984/AmazfitHex/commit/5430ba4e003b9eeb1cf6e3988b7a7b00fef84df2))
* read a touch in the screen coordinates the watch reports it in ([34fedea](https://github.com/dchernykh1984/AmazfitHex/commit/34fedea150d1dda650b9832ea1f0a477146e79aa))
* repaint the board as it is dragged instead of moving the canvas ([de8973b](https://github.com/dchernykh1984/AmazfitHex/commit/de8973bfd451290a2794c377e65a3ed73e0dfa16))
* say on screen when the opening stone changes hands ([2f0bfd1](https://github.com/dchernykh1984/AmazfitHex/commit/2f0bfd144262e5fffaf5011c4376f7695798fec5))
* take the opening stone only when it is worth taking ([4579618](https://github.com/dchernykh1984/AmazfitHex/commit/4579618494b62743a66f83723041f0084d1d68b3))


### Performance Improvements

* slide the board canvas while dragging and repaint once on release ([608c0bf](https://github.com/dchernykh1984/AmazfitHex/commit/608c0bff9f8c363436dfc599c0e1bed417e19369))

## [0.2.1](https://github.com/dchernykh1984/AmazfitHex/compare/amazfit-hex-v0.2.0...amazfit-hex-v0.2.1) (2026-08-06)


### Bug Fixes

* report the released version on the watch instead of 0.1.0 ([90d1719](https://github.com/dchernykh1984/AmazfitHex/commit/90d171901267f7a1439608083b89fa95f53377bd))
* stop demanding app.json's version code match its name on a release PR ([49f5a6e](https://github.com/dchernykh1984/AmazfitHex/commit/49f5a6e83cc261db9e08f6299db0f6ea6344c855))

## [0.2.0](https://github.com/dchernykh1984/AmazfitHex/compare/amazfit-hex-v0.1.0...amazfit-hex-v0.2.0) (2026-08-04)


### Features

* add the computer opponent and its three difficulty levels ([b80f355](https://github.com/dchernykh1984/AmazfitHex/commit/b80f355cf73b749c55de96e4bea58a67a0323fd1))
* add the hex board topology and the rules of the game ([b16c60f](https://github.com/dchernykh1984/AmazfitHex/commit/b16c60fc4ab0d5981535c8b08f64df20f59f4941))
* lay the hex board out on a round screen ([0bd8b99](https://github.com/dchernykh1984/AmazfitHex/commit/0bd8b9984ce7ceb1a25facdfa006d22fce23df8b))
* localize the screen strings and remember the chosen settings ([ae50aaa](https://github.com/dchernykh1984/AmazfitHex/commit/ae50aaa22e6dd6e089ba934333a0fde602df38af))
* play hex on the watch ([c1ec8d5](https://github.com/dchernykh1984/AmazfitHex/commit/c1ec8d514dd097488cb1e2d47015384555099cec))
* register the app as Hex Duel with its Zepp store id ([299d8d0](https://github.com/dchernykh1984/AmazfitHex/commit/299d8d091609cf2a178bc0b0cffaa6eb2ddb889b))


### Bug Fixes

* clear the page state when the page is built again ([df00577](https://github.com/dchernykh1984/AmazfitHex/commit/df00577361b443ed5583f36f244779ee78672c23))
* stop the watch turn instead of retrying when it has no move ([3b0c09f](https://github.com/dchernykh1984/AmazfitHex/commit/3b0c09f960c8ec1c76ab3d128a241f97cbc1ddbc))


### Performance Improvements

* reuse the board widgets when another game is dealt on the same board ([9e918d8](https://github.com/dchernykh1984/AmazfitHex/commit/9e918d8ae3d32de4b4ba804b1dff517728acac3a))
