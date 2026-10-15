# The GenoCode logo

The mark is a G laid down the way a GenoCode turtle builds a creature: a chain of balls, each a
little smaller and a little further round the colour wheel, from blue to pink. Everything here is
built by `node branding/build.mjs` from one description of the mark, so change the script, not the
files.

| File              | Use                                                                    |
| ----------------- | ---------------------------------------------------------------------- |
| `logo.svg`        | the mark on its tile, for 48 pixels and up                             |
| `logo-small.svg`  | the mark as one thick stroke, for small sizes where balls blur         |
| `logo-mark.svg`   | the mark without its tile, for your own backgrounds                    |
| `logo-lockup.svg` | the mark with the name, for headers and the README                     |
| `genie.ico`       | the icon for `.genie` files: 16 to 256 pixels, the small sizes stroked |
| `png/`            | the mark at 16 to 512 pixels                                           |

The build also writes the web app's favicon, `packages/app/public/favicon.svg`. The command line's
version is the banner in
[GenoCode-cli](https://github.com/genocode-org/GenoCode-cli)'s `packages/cli/src/banner.ts`, shown
by `genie help`.

## Showing the icon for .genie files on Windows

Until there's an installer, you can register the icon for your own account. In a registry file
(`.reg`), with the path to your copy of `genie.ico`:

```
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Classes\.genie]
@="GenoCode.Creature"

[HKEY_CURRENT_USER\Software\Classes\GenoCode.Creature]
@="GenoCode creature"

[HKEY_CURRENT_USER\Software\Classes\GenoCode.Creature\DefaultIcon]
@="D:\Tegemeo\GenoCode\branding\genie.ico"
```

Explorer may need a restart (or a sign out) before it shows the new icon.
