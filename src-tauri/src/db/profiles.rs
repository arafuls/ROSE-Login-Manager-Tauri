//! CRUD for the `profiles` table.
//!
//! Passwords are stored and handled here purely as opaque encrypted blobs
//! (`nonce || ciphertext`, see `crate::crypto`) - this module never sees plaintext.
//! Callers in `crate::commands::profiles` are responsible for encrypting/decrypting
//! with the unlocked vault key before/after calling into here.

use rusqlite::{Connection, OptionalExtension};

use crate::error::{AppError, AppResult};
use crate::models::Profile;

fn row_to_profile(row: &rusqlite::Row) -> rusqlite::Result<Profile> {
    Ok(Profile {
        email: row.get(0)?,
        name: row.get(1)?,
        status: row.get::<_, i64>(2)? != 0,
        order: row.get(4)?,
    })
}

pub fn list(conn: &Connection) -> AppResult<Vec<Profile>> {
    let mut stmt = conn.prepare(
        "SELECT email, name, status, password, profile_order FROM profiles ORDER BY profile_order ASC",
    )?;
    let rows = stmt.query_map([], row_to_profile)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn email_exists(conn: &Connection, email: &str) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM profiles WHERE email = ?1",
        [email],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn next_order(conn: &Connection) -> AppResult<i64> {
    let max: i64 = conn.query_row(
        "SELECT COALESCE(MAX(profile_order), 0) FROM profiles",
        [],
        |row| row.get(0),
    )?;
    Ok(max + 1)
}

/// Inserts a new profile. Errors with [`AppError::DuplicateEmail`] if the email is
/// already taken.
pub fn insert(
    conn: &Connection,
    name: &str,
    email: &str,
    encrypted_password: &[u8],
) -> AppResult<Profile> {
    if email_exists(conn, email)? {
        return Err(AppError::DuplicateEmail);
    }

    let order = next_order(conn)?;
    conn.execute(
        "INSERT INTO profiles (email, name, status, password, profile_order) VALUES (?1, ?2, 0, ?3, ?4)",
        rusqlite::params![email, name, encrypted_password, order],
    )?;

    Ok(Profile {
        email: email.to_string(),
        name: name.to_string(),
        status: false,
        order,
    })
}

/// Fetches a profile by email, without its password, for existence checks and
/// building the return value of `profiles_update`.
pub fn get(conn: &Connection, email: &str) -> AppResult<Option<Profile>> {
    conn.query_row(
        "SELECT email, name, status, password, profile_order FROM profiles WHERE email = ?1",
        [email],
        row_to_profile,
    )
    .optional()
    .map_err(Into::into)
}

/// Updates a profile identified by its current `email`. `new_email`/`new_name` rename
/// the row when `Some`; `new_encrypted_password`, when `Some`, replaces the stored
/// ciphertext. Errors with [`AppError::ProfileNotFound`] if `email` doesn't exist, or
/// [`AppError::DuplicateEmail`] if `new_email` collides with a *different* existing
/// profile.
pub fn update(
    conn: &Connection,
    email: &str,
    new_name: Option<&str>,
    new_email: Option<&str>,
    new_encrypted_password: Option<&[u8]>,
) -> AppResult<Profile> {
    let existing = get(conn, email)?.ok_or(AppError::ProfileNotFound)?;

    if let Some(candidate) = new_email {
        // Case-insensitive comparison, matching the column's COLLATE NOCASE:
        // renaming "test@x.com" -> "Test@x.com" is the same profile, not a
        // collision with itself.
        if !candidate.eq_ignore_ascii_case(email) && email_exists(conn, candidate)? {
            return Err(AppError::DuplicateEmail);
        }
    }

    let final_email = new_email.unwrap_or(email);
    let final_name = new_name.unwrap_or(&existing.name);

    if let Some(password) = new_encrypted_password {
        conn.execute(
            "UPDATE profiles SET email = ?1, name = ?2, password = ?3 WHERE email = ?4",
            rusqlite::params![final_email, final_name, password, email],
        )?;
    } else {
        conn.execute(
            "UPDATE profiles SET email = ?1, name = ?2 WHERE email = ?3",
            rusqlite::params![final_email, final_name, email],
        )?;
    }

    Ok(Profile {
        email: final_email.to_string(),
        name: final_name.to_string(),
        status: existing.status,
        order: existing.order,
    })
}

pub fn delete(conn: &Connection, email: &str) -> AppResult<()> {
    conn.execute("DELETE FROM profiles WHERE email = ?1", [email])?;
    Ok(())
}

/// Sets `profile_order` for every profile in `ordered_emails` to its index in that
/// list, atomically. Unknown emails are silently ignored (no-op update).
pub fn reorder(conn: &Connection, ordered_emails: &[String]) -> AppResult<()> {
    let tx = conn.unchecked_transaction()?;
    for (index, email) in ordered_emails.iter().enumerate() {
        tx.execute(
            "UPDATE profiles SET profile_order = ?1 WHERE email = ?2",
            rusqlite::params![index as i64, email],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Fetches the raw encrypted password blob for a single profile, for
/// `profiles_launch` to decrypt just before spawning the game client.
pub fn get_encrypted_password(conn: &Connection, email: &str) -> AppResult<Option<Vec<u8>>> {
    conn.query_row(
        "SELECT password FROM profiles WHERE email = ?1",
        [email],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

/// Sets whether a profile's client is currently running.
pub fn set_status(conn: &Connection, email: &str, status: bool) -> AppResult<()> {
    conn.execute(
        "UPDATE profiles SET status = ?1 WHERE email = ?2",
        rusqlite::params![status, email],
    )?;
    Ok(())
}

/// Resets every profile's status to "not running". Called once at startup:
/// a `status = 1` row surviving from a previous session (e.g. the app was
/// killed while a client was running) doesn't mean anything is actually
/// running in *this* session, since nothing here is tracking it - matches
/// the old app's `ProcessManager` constructor calling `ClearAllProfileStatus`.
pub fn clear_all_status(conn: &Connection) -> AppResult<()> {
    conn.execute("UPDATE profiles SET status = 0", [])?;
    Ok(())
}

/// Fetches `(name, email, encrypted_password)` for the given emails, in the order
/// they were requested, skipping any that don't exist. Used by `profiles_export`.
pub fn get_many_with_password(
    conn: &Connection,
    emails: &[String],
) -> AppResult<Vec<(String, String, Vec<u8>)>> {
    let mut out = Vec::with_capacity(emails.len());
    for email in emails {
        let row: Option<(String, String, Vec<u8>)> = conn
            .query_row(
                "SELECT name, email, password FROM profiles WHERE email = ?1",
                [email],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        if let Some(row) = row {
            out.push(row);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn insert_then_list_round_trips() {
        let conn = open_in_memory().unwrap();
        let p = insert(&conn, "Main", "main@example.com", b"ciphertext").unwrap();
        assert_eq!(p.email, "main@example.com");
        assert_eq!(p.order, 1);
        assert!(!p.status);

        let all = list(&conn).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].email, "main@example.com");
    }

    #[test]
    fn insert_rejects_duplicate_email() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "Main", "dup@example.com", b"ct").unwrap();
        let err = insert(&conn, "Alt", "dup@example.com", b"ct2").unwrap_err();
        assert!(matches!(err, AppError::DuplicateEmail));
    }

    #[test]
    fn update_rejects_collision_with_other_profile() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "A", "a@example.com", b"ct").unwrap();
        insert(&conn, "B", "b@example.com", b"ct").unwrap();

        let err = update(&conn, "b@example.com", None, Some("a@example.com"), None).unwrap_err();
        assert!(matches!(err, AppError::DuplicateEmail));
    }

    #[test]
    fn insert_rejects_duplicate_email_case_insensitively() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "Main", "dup@example.com", b"ct").unwrap();
        let err = insert(&conn, "Alt", "DUP@Example.com", b"ct2").unwrap_err();
        assert!(matches!(err, AppError::DuplicateEmail));
    }

    #[test]
    fn update_allows_renaming_to_a_different_case_of_the_same_email() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "Main", "test@example.com", b"ct").unwrap();

        let updated = update(
            &conn,
            "test@example.com",
            None,
            Some("Test@Example.com"),
            None,
        )
        .unwrap();
        assert_eq!(updated.email, "Test@Example.com");
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn update_rejects_collision_with_other_profile_case_insensitively() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "A", "a@example.com", b"ct").unwrap();
        insert(&conn, "B", "b@example.com", b"ct").unwrap();

        let err = update(&conn, "b@example.com", None, Some("A@Example.com"), None).unwrap_err();
        assert!(matches!(err, AppError::DuplicateEmail));
    }

    #[test]
    fn update_missing_profile_is_not_found() {
        let conn = open_in_memory().unwrap();
        let err = update(&conn, "ghost@example.com", Some("New Name"), None, None).unwrap_err();
        assert!(matches!(err, AppError::ProfileNotFound));
    }

    #[test]
    fn reorder_sets_profile_order_by_position() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "A", "a@example.com", b"ct").unwrap();
        insert(&conn, "B", "b@example.com", b"ct").unwrap();
        insert(&conn, "C", "c@example.com", b"ct").unwrap();

        reorder(
            &conn,
            &[
                "c@example.com".to_string(),
                "a@example.com".to_string(),
                "b@example.com".to_string(),
            ],
        )
        .unwrap();

        let all = list(&conn).unwrap();
        let emails: Vec<&str> = all.iter().map(|p| p.email.as_str()).collect();
        assert_eq!(emails, vec!["c@example.com", "a@example.com", "b@example.com"]);
    }

    #[test]
    fn delete_removes_profile() {
        let conn = open_in_memory().unwrap();
        insert(&conn, "A", "a@example.com", b"ct").unwrap();
        delete(&conn, "a@example.com").unwrap();
        assert!(list(&conn).unwrap().is_empty());
    }
}
