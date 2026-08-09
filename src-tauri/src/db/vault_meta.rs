//! The single-row `vault_meta` table.
//!
//! The vault's actual data-encryption key (DEK) is never stored - instead, two
//! independently-wrapped copies of it are: one encrypted under a key derived
//! from the user's passphrase, one under a key derived from a one-time
//! recovery key shown to the user at setup. Either can be decrypted to
//! recover the same DEK, which is how `vault_unlock` and `vault_recover` both
//! work without knowing about each other. A decrypt failure (AES-GCM
//! authentication failure) is how a wrong passphrase/recovery key is detected
//! - there's no separate "verifier" needed, unwrapping successfully *is* the
//! proof the key was right.

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;

pub struct VaultMeta {
    pub passphrase_salt: Vec<u8>,
    pub wrapped_dek_by_passphrase: Vec<u8>,
    pub recovery_salt: Vec<u8>,
    pub wrapped_dek_by_recovery: Vec<u8>,
}

pub fn is_initialized(conn: &Connection) -> AppResult<bool> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM vault_meta", [], |row| row.get(0))?;
    Ok(count > 0)
}

pub fn load(conn: &Connection) -> AppResult<Option<VaultMeta>> {
    conn.query_row(
        "SELECT passphrase_salt, wrapped_dek_by_passphrase, recovery_salt, wrapped_dek_by_recovery
         FROM vault_meta WHERE id = 1",
        [],
        |row| {
            Ok(VaultMeta {
                passphrase_salt: row.get(0)?,
                wrapped_dek_by_passphrase: row.get(1)?,
                recovery_salt: row.get(2)?,
                wrapped_dek_by_recovery: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

pub fn insert(conn: &Connection, meta: &VaultMeta) -> AppResult<()> {
    conn.execute(
        "INSERT INTO vault_meta
            (id, passphrase_salt, wrapped_dek_by_passphrase, recovery_salt, wrapped_dek_by_recovery)
         VALUES (1, ?1, ?2, ?3, ?4)",
        rusqlite::params![
            meta.passphrase_salt,
            meta.wrapped_dek_by_passphrase,
            meta.recovery_salt,
            meta.wrapped_dek_by_recovery
        ],
    )?;
    Ok(())
}

/// Replaces the passphrase-wrapped copy of the DEK, e.g. after `vault_recover`
/// re-wraps the recovered DEK under a newly-chosen passphrase. Leaves the
/// recovery-key wrapping untouched - the original recovery key still works
/// after a passphrase reset, since it wraps the same DEK independently.
pub fn update_passphrase_wrap(
    conn: &Connection,
    passphrase_salt: &[u8],
    wrapped_dek_by_passphrase: &[u8],
) -> AppResult<()> {
    conn.execute(
        "UPDATE vault_meta SET passphrase_salt = ?1, wrapped_dek_by_passphrase = ?2 WHERE id = 1",
        rusqlite::params![passphrase_salt, wrapped_dek_by_passphrase],
    )?;
    Ok(())
}

/// The last-resort fallback: wipes the vault entirely (both `vault_meta` and
/// every saved profile) when the user has lost both their passphrase and
/// their recovery key. There is no other way out of that situation - a
/// "backdoor" recovery path would defeat the point of encrypting the data at
/// all - so this trades all saved profiles for making the app usable again.
pub fn reset(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM vault_meta", [])?;
    conn.execute("DELETE FROM profiles", [])?;
    Ok(())
}
