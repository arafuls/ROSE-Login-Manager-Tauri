/**
 * Profiles API layer - see docs/command-contract.md, "Profiles" section.
 *
 * Every export matches a real command 1:1. Swapping to the real backend is
 * a one-line change per function, e.g.:
 *
 *   export async function profilesList(): Promise<Profile[]> {
 *     return invoke("profiles_list");
 *   }
 *
 * and for the typed duplicate-email error:
 *
 *   export async function profilesCreate(input: NewProfileInput): Promise<Profile> {
 *     try {
 *       return await invoke("profiles_create", { input });
 *     } catch (e) {
 *       throw toProfileError(e); // map the Rust error shape to ProfileError
 *     }
 *   }
 *
 * The mock stores plaintext passwords in its private in-memory record so
 * "login" round-trips are realistic, but `Profile` objects returned to
 * callers NEVER include the password field, matching the contract's note
 * that the frontend never sees it.
 */
import { mockDelay, readMockState, writeMockState } from "@/lib/mock-storage";
import type {
  ExportBundle,
  ImportResult,
  NewProfileInput,
  Profile,
  UpdateProfileInput,
} from "./types";
import { ProfileError } from "./types";

type StoredProfile = Profile & { password: string };

const STORAGE_KEY = "profiles";

const SEED: StoredProfile[] = [
  {
    name: "Scout",
    email: "scout@example.com",
    password: "correct-horse-1",
    status: false,
    order: 0,
  },
  {
    name: "Mage",
    email: "mage@example.com",
    password: "correct-horse-2",
    status: true,
    order: 1,
  },
];

function loadAll(): StoredProfile[] {
  return readMockState<StoredProfile[]>(STORAGE_KEY, SEED);
}

function saveAll(profiles: StoredProfile[]): void {
  writeMockState(STORAGE_KEY, profiles);
}

function toPublic({ password: _password, ...profile }: StoredProfile): Profile {
  return profile;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Mirrors the `profiles-changed` event from the contract (Rust `emit`,
 * frontend `listen`). The mock calls this after every mutation; swap the
 * subscription side (in `use-profiles.ts`) for
 * `listen("profiles-changed", cb)` from `@tauri-apps/api/event` later -
 * this function's call sites don't need to change.
 */
export function onProfilesChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

export async function profilesList(): Promise<Profile[]> {
  await mockDelay();
  return loadAll()
    .sort((a, b) => a.order - b.order)
    .map(toPublic);
}

export async function profilesCreate(input: NewProfileInput): Promise<Profile> {
  await mockDelay();
  const all = loadAll();
  if (all.some((p) => p.email.toLowerCase() === input.email.toLowerCase())) {
    throw new ProfileError("duplicate_email");
  }
  const created: StoredProfile = {
    name: input.name,
    email: input.email,
    password: input.password,
    status: false,
    order: all.length,
  };
  saveAll([...all, created]);
  emitChanged();
  return toPublic(created);
}

export async function profilesUpdate(
  email: string,
  input: UpdateProfileInput
): Promise<Profile> {
  await mockDelay();
  const all = loadAll();
  const index = all.findIndex((p) => p.email === email);
  if (index === -1) {
    throw new ProfileError("not_found");
  }
  const nextEmail = input.email ?? all[index].email;
  if (
    nextEmail.toLowerCase() !== email.toLowerCase() &&
    all.some((p) => p.email.toLowerCase() === nextEmail.toLowerCase())
  ) {
    throw new ProfileError("duplicate_email");
  }
  const updated: StoredProfile = {
    ...all[index],
    name: input.name ?? all[index].name,
    email: nextEmail,
    password: input.password ?? all[index].password,
  };
  const next = [...all];
  next[index] = updated;
  saveAll(next);
  emitChanged();
  return toPublic(updated);
}

export async function profilesDelete(email: string): Promise<void> {
  await mockDelay();
  const all = loadAll();
  saveAll(all.filter((p) => p.email !== email));
  emitChanged();
}

export async function profilesReorder(orderedEmails: string[]): Promise<void> {
  await mockDelay(120);
  const all = loadAll();
  const byEmail = new Map(all.map((p) => [p.email, p]));
  const reordered = orderedEmails
    .map((email, index) => {
      const profile = byEmail.get(email);
      return profile ? { ...profile, order: index } : null;
    })
    .filter((p): p is StoredProfile => p !== null);
  saveAll(reordered);
  emitChanged();
}

export async function profilesExport(
  emails: string[],
  exportPassword: string
): Promise<ExportBundle> {
  await mockDelay(300);
  const all = loadAll();
  const selected = all.filter((p) => emails.includes(p.email));
  // NOTE: real encryption (re-encrypted under exportPassword, independent of
  // the vault key) happens in Rust. The mock just base64-encodes a payload
  // that embeds the password so `profilesImport` below can "verify" it -
  // this is NOT cryptography, purely a stand-in so the round trip is
  // testable end-to-end in the browser.
  const payload = JSON.stringify({ exportPassword, profiles: selected });
  const ciphertext = btoa(unescape(encodeURIComponent(payload)));
  return { version: 1, ciphertext };
}

export async function profilesImport(
  bundle: ExportBundle,
  exportPassword: string
): Promise<ImportResult> {
  await mockDelay(300);
  let decoded: { exportPassword: string; profiles: StoredProfile[] };
  try {
    decoded = JSON.parse(decodeURIComponent(escape(atob(bundle.ciphertext))));
  } catch {
    throw new ProfileError(
      "unknown",
      "This export file is corrupted or invalid."
    );
  }
  if (decoded.exportPassword !== exportPassword) {
    throw new ProfileError("unknown", "Incorrect export password.");
  }

  const all = loadAll();
  const existingEmails = new Set(all.map((p) => p.email.toLowerCase()));
  const skipped: string[] = [];
  const toAdd: StoredProfile[] = [];
  let nextOrder = all.length;

  for (const profile of decoded.profiles) {
    if (existingEmails.has(profile.email.toLowerCase())) {
      skipped.push(profile.email);
      continue;
    }
    toAdd.push({ ...profile, order: nextOrder++ });
    existingEmails.add(profile.email.toLowerCase());
  }

  saveAll([...all, ...toAdd]);
  emitChanged();
  return { imported: toAdd.length, skipped };
}
