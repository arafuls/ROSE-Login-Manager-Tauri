/** Mirrors docs/command-contract.md's "Updater" and "Events" sections. */

export type LaunchContext = "profile" | "default" | "verify";

export interface LaunchStatus {
  context: LaunchContext;
  current?: number;
  max?: number;
  running: boolean;
  stage?: string;
}

export type UpdaterErrorKind =
  | "game_folder_not_set"
  | "game_executable_not_found"
  | "already_running"
  | "unknown";

export class UpdaterError extends Error {
  readonly kind: UpdaterErrorKind;

  constructor(kind: UpdaterErrorKind, message?: string) {
    super(message ?? defaultMessageFor(kind));
    this.name = "UpdaterError";
    this.kind = kind;
  }
}

function defaultMessageFor(kind: UpdaterErrorKind): string {
  switch (kind) {
    case "game_folder_not_set":
      return "Set your ROSE Online folder in Settings first.";
    case "game_executable_not_found":
      return "trose.exe wasn't found in the configured game folder.";
    case "already_running":
      return "This profile's client is already running.";
    default:
      return "Something went wrong.";
  }
}
