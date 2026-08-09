# Phase 1 Command Contract

Shared source of truth for the Rust backend and React frontend while they're built in parallel.
Backend implements these exactly; frontend calls these exactly (via a mock today, via real `invoke()` later).
If either side needs to deviate, update this file first, then implement — don't let the two drift.

Scope: profile CRUD/reorder, profile import/export, the passphrase-based vault, and settings.
Out of scope for Phase 1: process launching, memory scanning, the game updater, HWID. Those are later phases.

**Update:** `profiles_launch` (Phase 2) has been added below, ahead of the rest of Phase 2 - it's just
the launch-with-credentials piece, not the "launch behind" window positioning or character-name/window-title
scanning (those still require `windows-rs` Win32 window-handle work and the memory scanner respectively,
and remain deferred). Accepted limitation carried over from the old app: `trose.exe` only accepts login
credentials as CLI arguments, visible to any other process on the machine for the life of the client. This
is a game-client limitation, not something the launcher can close; the game developers have been informed.

## Design decision carried over from the old app's review

The old WPF app derived its AES key from hardware IDs (CPU/motherboard/disk serials via WMI). That key
is independently computable by any local process (WMI isn't privileged), it doesn't survive a disk/motherboard
swap, and it can't support cross-machine import/export. This rewrite uses a **user passphrase** instead
(Argon2id-derived key), entered once to unlock the vault. This fixes all three problems at once.

**Update:** a random DEK (data-encryption key) is generated at setup and wrapped independently under both
the passphrase and a one-time recovery key shown once to the user - neither the passphrase nor the recovery
key encrypts profile data directly. This means a forgotten passphrase is recoverable via the recovery key
(`vault_recover`, which also lets the user set a new passphrase in the same step), and if *both* are lost,
`vault_reset` wipes the vault as a last resort - there is deliberately no other way in, since a backdoor
would defeat the point of encrypting the data at all.

## Types (mirror exactly in Rust `serde` structs and TypeScript types)

```ts
type Profile = {
  email: string;
  name: string;
  status: boolean; // true = client currently running for this profile
  order: number;
  // Note: password never leaves Rust in plaintext. Frontend never sees it.
};

type NewProfileInput = {
  name: string;
  email: string;
  password: string; // plaintext in-memory only, sent once over invoke(), never logged
};

type UpdateProfileInput = {
  name?: string;
  email?: string;
  password?: string; // omit to leave password unchanged
};

type Settings = {
  roseGameFolder: string | null;
  displayEmail: boolean;
  maskEmail: boolean;
  launchClientBehind: boolean;
  skipPlanetCutscene: boolean;
  loginScreen: "Random" | "Treehouse" | "Adventure Plains" | "Junon Polis";
};
// toggleCharDataScanning (writing the active character's name to the game
// window title) was removed - it required the memory scanner, which was
// never implemented, so the toggle did nothing. Revisit if/when the memory
// scanner phase happens.

type ExportBundle = {
  version: 1;
  ciphertext: string; // base64, re-encrypted under the export password, not the vault key
};
```

## Commands (`#[tauri::command]` names, snake_case in Rust, camelCase at the invoke() boundary)

### Vault
- `vault_is_initialized() -> bool` — false on first run, before any passphrase has been set.
- `vault_setup(passphrase: string) -> { recoveryKey: string }` — first-run only; errors if already initialized. The returned recovery key is shown to the user exactly once (never retrievable again) - the frontend must force acknowledgment (e.g. a "yes, I saved this" confirmation) before proceeding, not just toast it.
- `vault_unlock(passphrase: string) -> void` — errors with a distinguishable `wrong_passphrase` variant.
- `vault_recover(recoveryKey: string, newPassphrase: string) -> void` — unlocks using the recovery key instead of the passphrase, and sets `newPassphrase` as the passphrase going forward in the same step. Errors with `invalid_recovery_key` if it doesn't match; the original recovery key keeps working afterward.
- `vault_reset() -> void` — wipes the vault and every saved profile. Last resort when both the passphrase and the recovery key are lost. The frontend must gate this behind strong, hard-to-misclick confirmation (e.g. typing a confirmation phrase), not a single click - there is no undo.
- `vault_is_unlocked() -> bool`
- `vault_lock() -> void` — clears the in-memory derived key.

### Profiles (all error if `!vault_is_unlocked()`)
- `profiles_list() -> Profile[]`
- `profiles_create(input: NewProfileInput) -> Profile` — errors on duplicate email (return a typed error, e.g. `{ kind: "duplicate_email" }`, not just a string, so the frontend can show a field-level message instead of a generic toast).
- `profiles_update(email: string, input: UpdateProfileInput) -> Profile` — same duplicate-email error shape if the new email collides.
- `profiles_delete(email: string) -> void`
- `profiles_reorder(orderedEmails: string[]) -> void`
- `profiles_export(emails: string[], exportPassword: string) -> ExportBundle`
- `profiles_import(bundle: ExportBundle, exportPassword: string) -> { imported: number; skipped: string[] }` — skips (doesn't overwrite) profiles whose email already exists; returns which were skipped so the UI can tell the user.
- `profiles_launch(email: string) -> void` — decrypts the profile's password and spawns `trose.exe` with it. Errors: `game_folder_not_set`, `game_executable_not_found`, `already_running` (in addition to the usual `vault_locked`/`profile_not_found`). Flips the profile's `status` to running immediately, and back to not-running automatically once the client process exits (emits `profiles-changed` both times).

### Settings
- `settings_get() -> Settings`
- `settings_update(patch: Partial<Settings>) -> Settings`
- `settings_find_game_folder() -> string | null` — registry lookup; try both `HKLM` and `HKCU` (the old app only checked `HKLM`, which is one of the silent-failure bugs we're fixing).

## Events (Rust `emit`, frontend `listen`)

- `profiles-changed` — emitted after any create/update/delete/reorder/import. Frontend refetches `profiles_list()`.

## UX requirements the frontend MUST implement (fixes from the old-app review — not optional polish)

1. **Delete requires a confirmation dialog.** The old app deleted on a single click with zero confirmation. Do not repeat that.
2. **Duplicate-email and other validation errors must be shown inline on the form**, not silently swallowed. The old app logged validation failures to a file the user never saw; the Add/Edit dialog just silently did nothing. Use the typed error `kind` from the command result to show a field-level message.
3. **Wrong-passphrase on unlock must show a visible error**, not a silent no-op.

## Mock layer (frontend, until backend lands)

Put all `invoke()` calls behind `src/features/*/api.ts` per-feature modules. Until the real commands exist,
these call an in-memory mock that matches the exact type signatures above. Swapping mock → real `invoke()`
should be a one-line change per function, not a rewrite.
