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
| `packages/cli`    | the `genie` command line                                           |
| `packages/vscode` | VS Code extension and language server                              |
| `creatures`       | the starter library of `.genie` creatures                          |
| `docs`            | documentation                                                      |

## Development

You need Node.js 22 or later (see `.nvmrc`).

```
npm install
npm run build     # compile all packages
npm test          # run the tests
npm run check     # build, test and check formatting, as CI does
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## Credits and license

GenoCode is inspired by DancerDNA (1999) and other work in evolutionary art; see
[CREDITS.md](CREDITS.md). Released under the [MIT License](LICENSE).
