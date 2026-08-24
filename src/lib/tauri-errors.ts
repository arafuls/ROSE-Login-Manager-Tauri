/**
 * Every `#[tauri::command]` in the backend returns `Result<T, AppError>`
 * where `AppError` serializes to `{ kind, message }` (see `src-tauri/src/error.rs`).
 * When a command errors, `invoke()`'s rejected promise carries that plain
 * object, not a JS `Error` - this narrows `unknown` catch values down to it.
 */
export interface BackendError {
  kind: string;
  message: string;
}

export function isBackendError(error: unknown): error is BackendError {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { kind?: unknown }).kind === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}
