# Contributing to GenoCode

GenoCode is at an early stage, and the project's structure is still settling. Issues and ideas are
welcome.

## Setting up

```
npm install
npm run check
```

`npm run check` builds every package, runs the tests and checks formatting, exactly as CI does.
Please run it before opening a pull request.

## Code

- Everything is TypeScript, in strict mode. Shaders are GLSL.
- Packages live in `packages/` and depend on each other through npm workspaces and TypeScript
  project references. `core` must not depend on any other package, and must run both in the
  browser and in Node.
- Tests sit next to the code as `*.test.ts` and run with Vitest.
- Formatting is done by Prettier: `npm run format`.

## Creatures

Starter creatures go in `creatures/` as `.genie` files. Each one starts with a comment saying who
made it and, if it was inspired by an existing creature, which one.

## Original DancerDNA material

Don't add any files from DancerDNA (populations, music styles, textures, backgrounds or the
program itself), or code taken from it, to this repository. GenoCode creatures and dance styles
inspired by the originals are rewritten from scratch and credited. See [CREDITS.md](CREDITS.md).
