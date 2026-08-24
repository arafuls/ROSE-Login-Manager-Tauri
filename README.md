# ROSE Login Manager

A companion login manager for [ROSE Online](https://www.roseonlinegame.com/), rewritten from my
older WPF/C# app as a Tauri + Rust + React desktop application.

It saves multiple game login profiles behind a single encrypted vault, launches the client
directly into a chosen account with no manual retyping, and keeps game files up to date without
opening the official updater's own window.

## Why this exists

The original app derived its encryption key from hardware IDs (CPU/motherboard/disk serials read
via WMI). That has three real problems: the key is independently computable by any other local
process (WMI isn't privileged), it doesn't survive a hardware swap, and it can't support copying
your vault to a different machine. This rewrite replaces it with a **user passphrase**, fixing all
three at once — see [Vault security](#vault-security) below for the actual design.

The update/launch pipeline also used to shell out to the official `rose-updater.exe`. That binary
turns out to be a full GUI application with no headless mode (confirmed by reading its own
`main.rs`), and its own window doesn't auto-launch the game after updating — a human still has to
click Play inside a second window. This app instead vendors `rose-updater`'s core sync logic
directly (see [Game update pipeline](#game-update-pipeline)) so one click does the whole thing:
sync, then launch.

## Features

- **Encrypted profile vault** — passphrase-unlocked, with a one-time recovery key and a
  last-resort reset if both are lost.
- **Multiple saved profiles** — add, edit, delete, reorder (drag-and-drop), all with credentials
  encrypted at rest.
- **One-click launch** — launches the game client directly into a saved account; syncs game files
  first if anything's out of date.
- **Password-protected export/import** — move profiles between machines as a single encrypted
  bundle, independent of the vault's own passphrase.
- **In-process game file sync** — chunked-diff updates and a full "Verify Files" repair pass, with
  live progress, no separate updater window.
- **Two navigation styles** — a collapsible icon sidebar or a classic top toolbar, switchable at
  any time; both sit under a fully custom, cross-platform titlebar.
- **Fully custom color themes** — six built-in palettes (including a light theme, Dracula, Nord,
  Catppuccin, and Gruvbox) plus a live theme editor for building your own; every themeable surface,
  including nav items and the Home screen's avatar placeholder, updates instantly.
- **Embedded news panel** — the game's own patch notes and announcements, rendered natively instead
  of an iframe embed of the website.
- **Automatic app updates** — checked and installed via Tauri's own updater, separate from the game
  file sync above.
- **Settings** — game folder (auto-detect via registry, or browse manually), display/mask emails,
  launch client behind the login manager window, skip the planet-travel cutscene, default login
  screen, and (on Linux) a choice between launching the Windows client through Wine or a native
  Linux client build.

## Vault security

- **Key derivation**: [Argon2id](https://en.wikipedia.org/wiki/Argon2) turns your passphrase into
  a 256-bit key. Never the hardware-ID scheme the old app used.
- **Dual-wrapped DEK**: on setup, a random 256-bit data-encryption key (DEK) is generated and
  encrypted twice — once under a key derived from your passphrase, once under a key derived from a
  one-time recovery key shown to you exactly once. Neither the passphrase nor the recovery key
  encrypts your profile data directly; they each independently unwrap the same DEK.
- **Recovery, not backdoor**: forget your passphrase and you can recover with the recovery key
  (`vault_recover`), which also lets you set a new passphrase in the same step — the original
  recovery key keeps working afterward. If you lose *both*, `vault_reset` wipes the vault; there is
  deliberately no other way in, since any backdoor would defeat the point of encrypting the data at
  all.
- **Encryption**: AES-256-GCM (authenticated encryption) for every ciphertext — profile passwords,
  both DEK wrappings, and export bundles all use the same primitive.
- **Export bundles** are re-encrypted under a separate export password you choose at export time,
  not your vault passphrase — so sharing/moving a bundle never exposes your vault credentials.

## Game update pipeline

Update logic (manifest fetching, chunked-diff downloads via [`bitar`](https://github.com/oll3/bitar))
is vendored from [rose-updater](https://github.com/rednimgames/rose-updater) (MIT) into
`src-tauri/src/rose_update/` and runs **in-process** — this app never shells out to
`rose-updater.exe`. Launching a profile or the default client syncs only files whose hash actually
changed (fast when already up to date); "Verify Files" always does a full check-and-repair pass
against the remote manifest.

## Theming

Every color in the app — backgrounds, text, borders, the active nav item, even the Home screen's
avatar placeholder — is driven by a single `ThemeColors` shape (`src-tauri/src/models.rs`) applied
as CSS custom properties at runtime (`ThemeApplier`, `src/features/themes/theme-applier.tsx`). Six
built-in palettes ship with the app; anything you create, edit, duplicate, or import through
Settings → Appearance is saved to `themes.json` and can be exported to share or back up.

The theme editor groups related colors together and shows a live, non-interactive preview next to
each group — including small recreations of real UI (the Home screen's profile row, the News
panel's card) rather than abstract swatches, so what you see while editing matches what actually
changes in the app.

## Tech stack

| Layer | Stack |
|---|---|
| Shell | [Tauri 2](https://tauri.app) |
| Backend | Rust, [rusqlite](https://github.com/rusqlite/rusqlite) (SQLite, bundled), [tokio](https://tokio.rs) |
| Frontend | React 19, TypeScript, [Vite](https://vitejs.dev) |
| Routing | [react-router](https://reactrouter.com) |
| UI | Tailwind CSS v4, [shadcn/ui](https://ui.shadcn.com/), [lucide-react](https://lucide.dev) icons |
| Forms | [react-hook-form](https://react-hook-form.com) + [zod](https://zod.dev) |
| Drag & drop | [dnd-kit](https://dndkit.com) |
| Crypto | [argon2](https://crates.io/crates/argon2), [aes-gcm](https://crates.io/crates/aes-gcm) |

Architecture follows [bulletproof-react](https://github.com/alan2207/bulletproof-react)'s
feature-based structure on the frontend (`src/features/<feature>/{components,api,types}`), with a
matching `#[tauri::command]` module per feature on the Rust side
(`src-tauri/src/commands/{vault,profiles,settings,process,theme,news}.rs`).
`docs/command-contract.md` is the authoritative list of every command, its types, and its error
variants — kept in sync with the Rust implementation by hand, not generated.

## Project structure

```
src/                          React frontend
├── app/                      Router, providers, root layout, global theme tokens (global.css)
├── components/               App-level shell: custom titlebar, sidebar/topbar nav
├── components/ui/            shadcn/ui primitives (Button, Dialog, Form, Select, Sidebar, ...)
└── features/
    ├── vault/                Unlock, setup, recovery-key, reset-vault screens + provider
    ├── profiles/             Profile list/card, add/edit/delete/export/import dialogs
    ├── home/                 Quick-launch screen (profile list + news + status bar)
    ├── settings/             Settings page, theme editor dialog
    ├── themes/               Theme types, API, live ThemeApplier
    ├── updater/               Launch status bar, game file sync/verify API
    ├── app-update/            App-level (Tauri) update checking
    ├── news/                 Embedded ROSE Online patch-notes panel
    └── errors/               Shared error boundary

src-tauri/                    Rust backend
├── src/
│   ├── commands/             #[tauri::command] handlers, one module per feature
│   ├── crypto/                Argon2id + AES-256-GCM primitives
│   ├── db/                   SQLite persistence (profiles, vault_meta)
│   ├── rose_update/           Vendored rose-updater sync/verify/manifest logic
│   ├── settings/              settings.toml + game's own rose.toml + registry lookup
│   ├── theme/                 Built-in palettes + themes.json persistence
│   ├── native_launch.rs       Native Linux client launch (no Wine)
│   ├── wine.rs                 Wine-prefix launch for the Windows client on Linux
│   ├── state.rs               Shared AppState (db connection, in-memory vault key)
│   ├── win32_window.rs         "Launch behind" window positioning (Windows only)
│   └── models.rs, error.rs    Shared DTOs and the AppError type
└── tauri.conf.json

docs/command-contract.md      Full command/type/error reference, source of truth
```

## Getting started

Requires the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform
(Rust toolchain + platform-specific system dependencies) and Node.js.

```bash
npm install
npm run tauri dev
```

This project defaults to [bun](https://bun.sh) in `tauri.conf.json`'s `beforeDevCommand`/
`beforeBuildCommand`; swap those (and `.husky/pre-commit`, `package.json`'s `lint-staged` entry) to
your package manager of choice if you're not using bun.

### Other scripts

```bash
npm run dev          # Vite dev server only (frontend, no Tauri shell)
npm run build         # Type-check + production frontend build
npm run typecheck     # tsc --noEmit
npm run check          # Lint (Biome via ultracite)
npm run fix            # Lint --fix
npm run tauri build    # Full native app bundle
```

Rust-side tests: `cd src-tauri && cargo test` (crypto round-trips, profile CRUD invariants like
case-insensitive duplicate-email detection, theme persistence, registry lookup).

### Releasing

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds and publishes signed
installers for Windows and Linux (Ubuntu 24.04) via GitHub Releases, read by the in-app updater.

## Known limitations

- `trose.exe` only accepts login credentials as command-line arguments, which are visible to any
  other process on the machine (Task Manager's Command Line column, etc.) for the life of the
  client. This is a limitation of the game client itself, not something a launcher can fix — the
  game developers have been informed.
- Writing the active character's name into the game window title (a feature of the old app)
  required a memory scanner that was never built for this rewrite, and has been dropped rather than
  shipped as a dead toggle.

## Acknowledgments

- [rose-updater](https://github.com/rednimgames/rose-updater) (Rednim Games, MIT) — vendored core
  update logic.
- [shadcn/ui](https://ui.shadcn.com/) and [lucide](https://lucide.dev) for UI components and icons.
- Bootstrapped from [`create-tauri-react`](https://www.npmjs.com/package/create-tauri-react).

## License

MIT — see [LICENSE](./LICENSE).
