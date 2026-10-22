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

## Branches and pull requests

`main` is protected: every change reaches it through a pull request whose CI check passes. Nobody
pushes to `main` directly.

- Make a branch from an up-to-date `main`, named `type/short-topic`, where the type is one of
  `feat` (something new), `fix` (a bug), `docs`, `chore` (tooling, dependencies, CI) or `release`
  (version bumps). For example `feat/creature-textures` or `fix/patterns-own-kinds`.
- Keep one change per branch. A change that spans the GenoCode repos (GenoCode, GenoCode-cli,
  GenoCode-vscode, GenoCode-agent) uses the same branch name in each. The GenoCode pull request is
  merged and released first, then the others move to the new packages.
- Open the pull request against `main` and fill in its template: what changed, how it was tested,
  and what needs releasing afterwards.
- Pull requests are squash-merged, so each becomes one commit on `main`. Write its title as that
  commit's message. The branch is deleted after merging.

### Releases

A version bump goes in its own `release/...` pull request (for example `release/render-0.11.0`).
Once it is merged, the version tag (`vX.Y.Z`) is pushed from `main` and the release workflow
publishes the packages.

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
