//! OS-level protection for the vault's "stay unlocked" DEK cache.
//!
//! On Windows, backed by DPAPI (`CryptProtectData`/`CryptUnprotectData`),
//! which ties protection to the Windows login rather than a secret this app
//! has to manage - a normal user-initiated password change re-keys it
//! automatically, but an admin-initiated *reset* (not a change) can
//! invalidate it, which surfaces here as an ordinary `unprotect` failure for
//! the caller to handle (see `commands::vault::vault_resume_from_os`'s
//! self-heal). `CRYPTPROTECT_UI_FORBIDDEN` is always set so this never pops
//! OS UI; `CRYPTPROTECT_LOCAL_MACHINE` is deliberately never set, so the
//! protection stays tied to the current Windows user, not the machine.
//!
//! On Linux, backed by the freedesktop.org Secret Service API (GNOME
//! Keyring/KWallet) via the `keyring` crate's synchronous D-Bus backend.
//! Secret Service is itself a storage mechanism, unlike DPAPI which is a
//! pure encrypt/decrypt primitive - `protect` writes the DEK directly into
//! the keyring and returns a constant placeholder purely to satisfy
//! `vault_session`'s `NOT NULL` blob column, and `unprotect` ignores its
//! blob argument and reads the real DEK back from the keyring directly. Only
//! the synchronous Secret Service backend is used - no fallback to the
//! Linux kernel keyring or systemd-creds/TPM, which were deliberately ruled
//! out as disproportionate complexity for a low-stakes convenience feature.
//! Secret Service can be transiently unreachable (daemon not yet started at
//! login, collection still locked) well before a stored secret is actually
//! gone, unlike DPAPI's always-permanent failures - see
//! `AppError::CredentialStoreUnavailable`'s doc comment for how callers are
//! expected to tell the two apart.
//!
//! Not yet implemented for any other platform - see the stubs at the bottom.

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

/// Reverses [`protect`]. Fails if `blob` wasn't produced by this Windows user
/// account's DPAPI protection, or if that protection has since been
/// invalidated (see the module doc comment).
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
/// Returned by [`protect`] in place of real ciphertext - see the module doc
/// comment for why Secret Service doesn't produce one. Never used to recover
/// anything; its only job is satisfying `vault_session`'s `NOT NULL` column.
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

/// Ignores `_blob` and reads the DEK directly out of Secret Service. Maps a
/// transiently-unreachable keyring daemon/collection to
/// [`AppError::CredentialStoreUnavailable`] rather than the generic
/// `AppError::Crypto` other failures use, so `vault_resume_from_os` can tell
/// "try again later" apart from "this is permanently gone."
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

/// A real probe against the actual entry this feature uses - the `keyring`
/// crate has no dedicated "is a backend available" API. `NoEntry` (nothing
/// stored yet) counts as supported: it means Secret Service itself answered,
/// just with nothing there yet, which is the expected state before this
/// feature has ever been enabled.
#[cfg(target_os = "linux")]
pub fn is_supported() -> bool {
    use keyring::{Entry, Error as KeyringError};

    match Entry::new(LINUX_SERVICE, LINUX_ACCOUNT).and_then(|e| e.get_secret()) {
        Ok(_) | Err(KeyringError::NoEntry) => true,
        Err(_) => false,
    }
}

/// Deletes the Secret Service entry, if any. A failed best-effort cleanup
/// here must never block the local lock/reset/setup action the user actually
/// asked for, so every outcome other than success is logged and swallowed
/// rather than propagated - worst case, one orphaned entry lingers until the
/// next successful clear.
#[cfg(target_os = "linux")]
pub fn clear() -> AppResult<()> {
    use keyring::{Entry, Error as KeyringError};

    match Entry::new(LINUX_SERVICE, LINUX_ACCOUNT).and_then(|e| e.delete_credential()) {
        Ok(()) | Err(KeyringError::NoEntry) => {}
        Err(e) => tracing::warn!("failed to clear Secret Service entry: {e}"),
    }
    Ok(())
}

/// "Stay unlocked" isn't implemented on this platform - unreachable from the
/// UI (the Settings toggle only ever appears on Windows, or on Linux after
/// [`is_supported`] confirms Secret Service is reachable), so this is
/// defense-in-depth rather than a real user-facing path.
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
