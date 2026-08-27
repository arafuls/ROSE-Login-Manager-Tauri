//! OS-level protection for the vault's "stay unlocked" DEK cache.
//!
//! Windows: DPAPI (`CryptProtectData`/`CryptUnprotectData`), tied to the
//! Windows login. A password *reset* (not a change) invalidates it -
//! surfaces as an `unprotect` failure, see `vault_resume_from_os`.
//!
//! Linux: Secret Service (GNOME Keyring/KWallet) via sync D-Bus only - no
//! kernel keyring or systemd-creds/TPM fallback. It's storage, not just
//! encrypt/decrypt, so `protect`/`unprotect` read/write the DEK directly
//! and use a placeholder blob to satisfy `vault_session`'s schema.
//! Transient unreachability is distinct from a dead secret - see
//! `AppError::CredentialStoreUnavailable`.
//!
//! Not implemented elsewhere - see the stubs below.

use crate::error::AppResult;

#[cfg(windows)]
use crate::error::AppError;

/// DPAPI-protects `data`, returning an opaque blob only this Windows user
/// account can later `unprotect`.
#[cfg(windows)]
pub fn protect(data: &[u8]) -> AppResult<Vec<u8>> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptProtectData(
            &input,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|e| AppError::Crypto(format!("DPAPI protect failed: {e}")))?;

        let out = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(out)
    }
}

/// Reverses [`protect`] - fails if `blob` wasn't produced by this account's
/// DPAPI, or that protection has since been invalidated (module doc).
#[cfg(windows)]
pub fn unprotect(blob: &[u8]) -> AppResult<Vec<u8>> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    let input = CRYPT_INTEGER_BLOB {
        cbData: blob.len() as u32,
        pbData: blob.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptUnprotectData(&input, None, None, None, None, 0, &mut output)
            .map_err(|e| AppError::Crypto(format!("DPAPI unprotect failed: {e}")))?;

        let out = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(out)
    }
}

/// DPAPI is a standard part of Windows going back to XP - always available.
#[cfg(windows)]
pub fn is_supported() -> bool {
    true
}

/// DPAPI has no separate storage to clean up - the ciphertext is entirely
/// owned by `vault_session`, so there's nothing external to delete here.
#[cfg(windows)]
pub fn clear() -> AppResult<()> {
    Ok(())
}

#[cfg(target_os = "linux")]
const LINUX_SERVICE: &str = "rose-login-manager-tauri";
#[cfg(target_os = "linux")]
const LINUX_ACCOUNT: &str = "vault-dek";
/// Placeholder returned by [`protect`] instead of real ciphertext, just to
/// satisfy `vault_session`'s `NOT NULL` column - never used to recover anything.
#[cfg(target_os = "linux")]
const LINUX_PLACEHOLDER: &[u8] = b"secret-service";

/// Writes `data` directly into the Secret Service entry this app uses,
/// returning [`LINUX_PLACEHOLDER`] rather than real ciphertext.
#[cfg(target_os = "linux")]
pub fn protect(data: &[u8]) -> AppResult<Vec<u8>> {
    use crate::error::AppError;
    use keyring::Entry;

    let entry = Entry::new(LINUX_SERVICE, LINUX_ACCOUNT)
        .map_err(|e| AppError::Crypto(format!("Secret Service error: {e}")))?;
    entry
        .set_secret(data)
        .map_err(|e| AppError::Crypto(format!("Secret Service error: {e}")))?;
    Ok(LINUX_PLACEHOLDER.to_vec())
}

/// Ignores `_blob`, reading the DEK straight from Secret Service. Maps a
/// transiently-unreachable daemon to `CredentialStoreUnavailable` (not
/// `Crypto`), so callers can tell "try again" from "gone for good."
#[cfg(target_os = "linux")]
pub fn unprotect(_blob: &[u8]) -> AppResult<Vec<u8>> {
    use crate::error::AppError;
    use keyring::{Entry, Error as KeyringError};

    let entry = Entry::new(LINUX_SERVICE, LINUX_ACCOUNT)
        .map_err(|e| AppError::Crypto(format!("Secret Service error: {e}")))?;
    entry.get_secret().map_err(|e| match e {
        KeyringError::NoStorageAccess(_) | KeyringError::PlatformFailure(_) => {
            AppError::CredentialStoreUnavailable(format!("Secret Service unreachable: {e}"))
        }
        other => AppError::Crypto(format!("Secret Service error: {other}")),
    })
}

/// Probes the real entry - `keyring` has no "is available" API. `NoEntry`
/// still counts as supported: Secret Service answered, just with nothing
/// stored yet (the expected state before this is ever enabled).
#[cfg(target_os = "linux")]
pub fn is_supported() -> bool {
    use keyring::{Entry, Error as KeyringError};

    match Entry::new(LINUX_SERVICE, LINUX_ACCOUNT).and_then(|e| e.get_secret()) {
        Ok(_) | Err(KeyringError::NoEntry) => true,
        Err(_) => false,
    }
}

/// Deletes the Secret Service entry, if any. Never propagates failures - a
/// bad remote cleanup must not block the local action the user asked for;
/// worst case, one orphaned entry lingers until the next clear.
#[cfg(target_os = "linux")]
pub fn clear() -> AppResult<()> {
    use keyring::{Entry, Error as KeyringError};

    match Entry::new(LINUX_SERVICE, LINUX_ACCOUNT).and_then(|e| e.delete_credential()) {
        Ok(()) | Err(KeyringError::NoEntry) => {}
        Err(e) => tracing::warn!("failed to clear Secret Service entry: {e}"),
    }
    Ok(())
}

/// "Stay unlocked" isn't implemented on this platform - unreachable from
/// the UI, so this is defense-in-depth, not a real user-facing path.
#[cfg(not(any(windows, target_os = "linux")))]
pub fn protect(_data: &[u8]) -> AppResult<Vec<u8>> {
    Err(crate::error::AppError::Internal(
        "stay-unlocked isn't supported on this platform".into(),
    ))
}

/// See [`protect`]'s doc comment.
#[cfg(not(any(windows, target_os = "linux")))]
pub fn unprotect(_blob: &[u8]) -> AppResult<Vec<u8>> {
    Err(crate::error::AppError::Internal(
        "stay-unlocked isn't supported on this platform".into(),
    ))
}

/// See [`protect`]'s doc comment.
#[cfg(not(any(windows, target_os = "linux")))]
pub fn is_supported() -> bool {
    false
}

/// See [`protect`]'s doc comment - nothing is ever persisted on this
/// platform, so there's nothing to clear.
#[cfg(not(any(windows, target_os = "linux")))]
pub fn clear() -> AppResult<()> {
    Ok(())
}
