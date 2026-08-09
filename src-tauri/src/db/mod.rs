//! SQLite persistence via `rusqlite`.
//!
//! Schema mirrors the old WPF app's `Profiles` table (`ProfileStatus, ProfileEmail,
//! ProfileName, ProfilePassword, ProfileIV, ProfileOrder`, see
//! `ROSE Login Manager/Model/DatabaseManager.cs` in the old codebase) with one
//! deliberate change: there is no `ProfileIV` column. AES-GCM nonces are generated
//! per-encryption and stored embedded in the `password` blob (`nonce || ciphertext`,
//! see `crate::crypto`), so a separate IV column would just be redundant state that
//! could drift out of sync with the ciphertext it belongs to.
//!
//! A second table, `vault_meta`, holds the vault's key-wrapping data: a DEK
//! (data-encryption key) independently wrapped under both a passphrase- and
//! a recovery-key-derived key (see `crate::db::vault_meta`).
//!
//! `email` is declared `COLLATE NOCASE` so uniqueness (and every lookup) is
//! case-insensitive - `Test@example.com` and `test@example.com` are the same
//! profile. This also matches the frontend's mock duplicate-email check
//! (`profiles/api.ts`, `.toLowerCase()` comparison); without this the two
//! sides would disagree once the mock is swapped for real commands.

pub mod profiles;
pub mod vault_meta;

use std::path::Path;

use rusqlite::Connection;

use crate::error::AppResult;

pub fn open(db_path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    migrate_legacy_vault_meta(conn)?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS profiles (
            email           TEXT    PRIMARY KEY COLLATE NOCASE,
            name            TEXT    NOT NULL,
            status          INTEGER NOT NULL DEFAULT 0,
            password        BLOB    NOT NULL,
            profile_order   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS vault_meta (
            id                          INTEGER PRIMARY KEY CHECK (id = 1),
            passphrase_salt             BLOB NOT NULL,
            wrapped_dek_by_passphrase   BLOB NOT NULL,
            recovery_salt               BLOB NOT NULL,
            wrapped_dek_by_recovery     BLOB NOT NULL
        );
        "#,
    )?;
    Ok(())
}

/// Pre-release schema change: `vault_meta` used to store a single
/// passphrase-derived key directly (a `salt` + `verifier` pair), with no
/// recovery-key support. That scheme can't be upgraded in place - the old
/// key never wrapped a separate DEK, so there's nothing to carry forward,
/// and the profiles it encrypted are structurally tied to it. Since this
/// predates any real release, a vault found in the old shape is reset
/// (dropped and recreated empty) rather than migrated.
fn migrate_legacy_vault_meta(conn: &Connection) -> AppResult<()> {
    let is_legacy_shape: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('vault_meta') WHERE name = 'verifier'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if is_legacy_shape {
        conn.execute_batch("DROP TABLE vault_meta; DROP TABLE IF EXISTS profiles;")?;
    }
    Ok(())
}

#[cfg(test)]
pub fn open_in_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    migrate(&conn)?;
    Ok(conn)
}
