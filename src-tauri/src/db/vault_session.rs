//! The single-row `vault_session` table: an OS-protected (DPAPI, on Windows)
//! copy of the vault's DEK, persisted only when the user opts into "stay
//! unlocked" from Settings. Independent of `vault_meta`'s passphrase/recovery
//! wrappings - this is purely a convenience cache that lets `vault_resume_from_os`
//! skip the passphrase prompt on a future launch. Whether "stay unlocked" is
//! on is derived from whether this row exists, not a separate settings flag,
//! so it can never drift from whether a usable blob actually exists.

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;

/// Whether a `vault_session` row currently exists.
pub fn is_enabled(conn: &Connection) -> AppResult<bool> {
    Ok(load(conn)?.is_some())
}

/// Loads the OS-protected DEK blob, if "stay unlocked" is on.
pub fn load(conn: &Connection) -> AppResult<Option<Vec<u8>>> {
    conn.query_row(
        "SELECT wrapped_dek_by_os FROM vault_session WHERE id = 1",
        [],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

/// Persists (or replaces) the OS-protected DEK blob.
pub fn save(conn: &Connection, wrapped_dek_by_os: &[u8]) -> AppResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO vault_session (id, wrapped_dek_by_os) VALUES (1, ?1)",
        rusqlite::params![wrapped_dek_by_os],
    )?;
    Ok(())
}

/// Deletes the `vault_session` row, if any - turns "stay unlocked" back off.
pub fn clear(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM vault_session", [])?;
    Ok(())
}
