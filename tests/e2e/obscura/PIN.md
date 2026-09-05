# Obscura pin

Obscura is a headless browser engine written in Rust (own DOM/CSS layout/paint,
embedded V8 via `rusty_v8`) that exposes a Chrome DevTools Protocol server so
Puppeteer/Playwright can drive it with `connectOverCDP`. It is not Chromium and
not a Chromium wrapper.

- Repository: https://github.com/h4ckf0r0day/obscura (Apache-2.0)
- Docs: https://docs.obscura.sh/ (CLI reference: `/reference/cli-reference.md`,
  Playwright guide: `/guides/use-with-playwright.md`)

## Pinned release

| Item | Value |
| --- | --- |
| Release tag | `v0.2.1` (published 2026-08-23) |
| Tag commit | `2810cb478696885e0d44d1741cbf586f1cc98bb5` |
| Asset | `obscura-x86_64-linux.tar.gz` (glibc build, rendering enabled) |
| Asset URL | https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.1/obscura-x86_64-linux.tar.gz |
| Asset SHA-256 | `6a1a66b3f1ab118fa7d31330894a868617aea68c06d75436d851356c39df1ed3` |
| `obscura` SHA-256 | `80153abcd279328f92c11903866df5911a90577d95633d329fe886db00abb332` |
| `obscura-worker` SHA-256 | `509fbdbeb2e0cb7caf6c46cf905a6052f3ad6012487c1bdcdf405e3319ec0902` |
| `obscura --version` | `obscura 0.2.1` |
| Reported CDP identity | `Chrome/145.0.0.0`, Protocol-Version 1.3, V8 14.5.0.0 |

Upstream publishes no checksum file for release assets; the hashes above were
computed locally after download.

## Install location

Everything lives under `.tools/obscura/` (git-ignored via `.tools/` in
`.gitignore`):

```
.tools/obscura/
  obscura                  # release binary (glibc, needs GLIBC_2.35)
  obscura-worker           # only used by `obscura scrape`, not by `serve`
  obscura-x86_64-linux.tar.gz
  run.sh                   # launcher, see below
  glibc/                   # private glibc runtime for musl hosts (see below)
  src/                     # shallow clone of tag v0.2.1 (reference only)
```

Re-create it with:

```sh
mkdir -p .tools/obscura && cd .tools/obscura
curl -sSLO https://github.com/h4ckf0r0day/obscura/releases/download/v0.2.1/obscura-x86_64-linux.tar.gz
echo '6a1a66b3f1ab118fa7d31330894a868617aea68c06d75436d851356c39df1ed3  obscura-x86_64-linux.tar.gz' | sha256sum -c
tar xzf obscura-x86_64-linux.tar.gz
```

## Launching

```sh
.tools/obscura/run.sh serve --port 9222 --allow-private-network
# CDP:  http://127.0.0.1:9222/json/version  ->  ws://127.0.0.1:9222/devtools/browser
```

`--allow-private-network` is required, otherwise Obscura refuses to load pages
from loopback/RFC1918 addresses (the Playwright `webServer` on 127.0.0.1).
Other useful `serve` flags: `--host`, `--stealth`, `--storage-dir <dir>`,
`--workers <n>`, `--quiet`.

Connect with `chromium.connectOverCDP('http://127.0.0.1:9222')` (Playwright's
`connect` / `connectOptions.wsEndpoint` speak Playwright's own protocol and do
not work against Obscura).

## musl hosts (this WSL2 distro is Alpine 3.21)

The release binaries are dynamically linked against glibc (`GLIBC_2.35`), and
rusty_v8 only started shipping musl prebuilts in v150.2.0 while Obscura
`v0.2.1` (and `main` as of 2026-09-02) pins `v8 = 137.3.0`, so a native
`cargo build` on musl is not possible without porting Obscura to a newer V8
API (upstream issue #32 is closed as "blocked on rusty_v8"). Alpine's `gcompat`
shim is missing `backtrace`, `mallopt`, `__res_init` and others.

`run.sh` therefore runs the binary with a private glibc loader extracted from
Debian bookworm packages into `.tools/obscura/glibc/` (no root, nothing
installed system-wide):

| Package | SHA-256 |
| --- | --- |
| `libc6_2.36-9+deb12u14_amd64.deb` | `ba4f88f73dbc3ae9055f3c20f4523bfdbaf1ad13ff95e258924f77d20b4fbedf` |
| `libgcc-s1_12.2.0-14+deb12u1_amd64.deb` | `3016e62cb4b7cd8038822870601f5ed131befe942774d0f745622cc77d8a88f7` |

```sh
cd .tools/obscura && mkdir -p glibc/deb && cd glibc/deb
curl -sSLO https://deb.debian.org/debian/pool/main/g/glibc/libc6_2.36-9+deb12u14_amd64.deb
curl -sSLO https://deb.debian.org/debian/pool/main/g/gcc-12/libgcc-s1_12.2.0-14+deb12u1_amd64.deb
for d in *.deb; do bsdtar -xOf "$d" 'data.tar.*' | bsdtar -xf - -C .. --strip-components=3 './lib/x86_64-linux-gnu/*'; done
```

`run.sh` is:

```sh
exec "$DIR/glibc/ld-linux-x86-64.so.2" --library-path "$DIR/glibc" "$DIR/obscura" "$@"
```

On a glibc host (Ubuntu CI runners, Debian containers) run `./obscura` directly
and skip the `glibc/` directory.

## Playwright Chromium (standard lane)

- Playwright `1.62.1` pins Chromium `151.0.7922.34` (registry revision `1234`).
- Installed with `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright bunx playwright install chromium`
  into `~/.cache/ms-playwright/chromium-1234` and `chromium_headless_shell-1234`.
- The interactive shell on this machine exports `PLAYWRIGHT_BROWSERS_PATH=/usr/bin`,
  which makes `bunx playwright install` fail with `EACCES mkdir /usr/bin/__dirlock`;
  unset it or point it at the cache directory.
- Those Playwright builds are glibc-linked and do not start on this Alpine host
  (`Error relocating ... posix_fallocate64`). The musl build that does run is
  Alpine's own `/usr/bin/chromium` (`Chromium 136.0.7103.113`), usable through
  `launchOptions.executablePath` for local runs; on glibc CI runners the pinned
  Playwright Chromium works as normal.
