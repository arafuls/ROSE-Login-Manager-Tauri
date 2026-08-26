//! OS-level protection for the vault's "stay unlocked" DEK cache, backed by
//! Windows DPAPI (`CryptProtectData`/`CryptUnprotectData`). DPAPI ties the
//! protection to the Windows login itself rather than a secret this app has
//! to manage - a normal user-initiated password change re-keys it
//! automatically, but an admin-initiated *reset* (not a change) can
//! invalidate it, which surfaces here as an ordinary `unprotect` failure for
//! the caller to handle (see `commands::vault::vault_resume_from_os`'s
//! self-heal). `CRYPTPROTECT_UI_FORBIDDEN` is always set so this never pops
//! OS UI; `CRYPTPROTECT_LOCAL_MACHINE` is deliberately never set, so the
//! protection stays tied to the current Windows user, not the machine.
//!
//! Not yet implemented for other platforms - see the non-Windows stubs below.

#[cfg(windows)]
use crate::error::AppError;
use crate::error::AppResult;

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

/// "Stay unlocked" isn't implemented on this platform yet - unreachable from
/// the UI (the Settings toggle is Windows-only), so this is defense-in-depth
/// rather than a real user-facing path.
#[cfg(not(windows))]
pub fn protect(_data: &[u8]) -> AppResult<Vec<u8>> {
    Err(crate::error::AppError::Internal(
        "stay-unlocked is only supported on Windows".into(),
    ))
}

/// See [`protect`]'s non-Windows stub.
#[cfg(not(windows))]
pub fn unprotect(_blob: &[u8]) -> AppResult<Vec<u8>> {
    Err(crate::error::AppError::Internal(
        "stay-unlocked is only supported on Windows".into(),
    ))
}
