//! The single-row `vault_meta` table: Argon2id salt + an AES-GCM "verifier" blob
//! (a known plaintext encrypted under the derived key) used to tell a correct
//! passphrase from an incorrect one on `vault_unlock` without ever storing the key
//! itself.

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;

pub struct VaultMeta {
    pub salt: Vec<u8>,
    pub verifier: Vec<u8>,
}

pub fn is_initialized(conn: &Connection) -> AppResult<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM vault_meta", [], |row| row.get(0))?;
    Ok(count > 0)
}

pub fn load(conn: &Connection) -> AppResult<Option<VaultMeta>> {
    conn.query_row(
        "SELECT salt, verifier FROM vault_meta WHERE id = 1",
        [],
        |row| {
            Ok(VaultMeta {
                salt: row.get(0)?,
                verifier: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub fn insert(conn: &Connection, salt: &[u8], verifier: &[u8]) -> AppResult<()> {
    conn.execute(
        "INSERT INTO vault_meta (id, salt, verifier) VALUES (1, ?1, ?2)",
        rusqlite::params![salt, verifier],
    )?;
    Ok(())
}
