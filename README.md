<p align="center"><img src="branding/logo-lockup.svg" alt="GenoCode" width="480"></p>

# GenoCode

Code, breed and share creatures that dance to music.

GenoCode is a small language for describing creatures. A program drives a 3D turtle that lays down
simple shapes, and the values marked as **genes** can be mutated, bred and morphed, so every
program describes a whole family of related creatures. Creatures can react to music, so how they
dance is part of their genes too.

You can write creatures as code or build them by dragging blocks onto a canvas, with the code
written for you. Creature files use the `.genie` extension.

```
creature Flower

gene rings  = 3   in 1..6 step 1    // how many rings of petals
gene shrink = 0.7 in 0.4..0.95      // each ring's size compared with the ring outside it
gene twist  = 29  in 0..180         // how far each ring turns from the last
```

**Status:** early development. Nothing is usable yet.

The language is defined in [docs/LANGUAGE.md](docs/LANGUAGE.md).

## Repository layout

| Folder            | Contents                                                           |
| ----------------- | ------------------------------------------------------------------ |
| `packages/core`   | the language: parser, checker, formatter, interpreter and genetics |
| `packages/render` | draws creatures, textures and backgrounds (three.js)               |
| `packages/music`  | turns music into the inputs creatures react to                     |
| `packages/dance`  | the dance effects: morph, zoom, spin, turn, reverse and flat       |
| `packages/blocks` | the block editor                                                   |
| `packages/app`    | the web app                                                        |
| `creatures`       | the starter library of `.genie` creatures                          |
| `docs`            | documentation                                                      |

## Development

You need Node.js 22 or later (see `.nvmrc`).

```
npm install
npm run build     # compile all packages
npm test          # run the tests
npm run check     # build, type-check, test and check formatting, as CI does
```

**Write creatures in the browser:** `npm run dev`, then open the address it prints. Pick one of
the starter creatures in `creatures/`, start a **New** one, or open or drop any `.genie` file. In
Chromium-based browsers, a file opened from disk is watched too, so you can edit it in any editor
and see the changes (until you edit it in the app). **Save** keeps a creature in the browser, under
**Mine** in the creature menu, and **Download…** writes it as a `.genie` file.

The app has three modes:

- **View** shows the code beside the creature, rebuilt as you type. The editor colours the code,
  marks problems as you type, completes names and explains whatever you point at. Each gene has a
  slider, colour picker or menu in the side panel; letting go writes the new value into the code.
  Creatures that react to time or music get sliders for `time`, `beat` and the `music` values. Lock
  a gene (🔓) to keep it fixed while breeding. **Code** hides or shows the editor.
- **Breed** shows a grid of variations. Click creatures to choose them as parents, then **Mutate**
  (the strength sets how far genes move) or **Breed** (children of random pairs of parents).
  **Back** returns to the previous generation, and double-clicking a creature opens it in View.
- **Morph** blends through the chosen creatures (or the whole grid) in a loop.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## Related repositories

`core` and `render` are published to npm as
[`@genocode/core`](https://www.npmjs.com/package/@genocode/core) and
[`@genocode/render`](https://www.npmjs.com/package/@genocode/render), so tools can live in
repositories of their own:

| Repository                                                         | Contents                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| [GenoCode-cli](https://github.com/genocode-org/GenoCode-cli)       | `genie`, the command line: check, format and render creatures |
| [GenoCode-vscode](https://github.com/genocode-org/GenoCode-vscode) | the VS Code extension and language server                     |

A version tag (such as `v0.2.0`) publishes `core` and `render` to npm.

## Credits and license

GenoCode is inspired by DancerDNA (1999) and other work in evolutionary art; see
[CREDITS.md](CREDITS.md). Released under the [MIT License](LICENSE).
