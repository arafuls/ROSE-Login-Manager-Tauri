//! Argon2id passphrase -> key derivation and AES-256-GCM authenticated encryption.
//!
//! Design (see `docs/command-contract.md` and the design-review note it carries over):
//! the old WPF app derived its AES key from hardware IDs (CPU/motherboard/disk serials
//! via WMI), which is independently computable by any local process, doesn't survive
//! hardware swaps, and can't support cross-machine export/import. This module instead
//! derives the key from a **user passphrase** via Argon2id, salted per-vault.
//!
//! Every ciphertext produced here is `nonce (12 bytes) || AES-256-GCM(ciphertext || tag)`,
//! base64-free at this layer (callers decide encoding). There is no separate IV column
//! anywhere in this codebase - the nonce always travels embedded in the ciphertext blob.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;
use rand::RngCore;

use crate::error::{AppError, AppResult};

pub const KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 12;

/// Minimum passphrase length enforced at the command boundary. The frontend
/// already enforces this via zod (vault setup and export password both use
/// an 8-character minimum) - this is defense-in-depth so a weak passphrase
/// can't reach `derive_key` just because some future or different caller
/// skips client-side validation.
pub const MIN_PASSPHRASE_LEN: usize = 8;

pub type VaultKey = [u8; KEY_LEN];

/// Rejects passphrases/export passwords shorter than [`MIN_PASSPHRASE_LEN`].
/// Counts Unicode scalar values, not bytes, so multi-byte characters aren't
/// penalized.
pub fn validate_passphrase_len(passphrase: &str) -> AppResult<()> {
    if passphrase.chars().count() < MIN_PASSPHRASE_LEN {
        return Err(AppError::PassphraseTooShort {
            min: MIN_PASSPHRASE_LEN,
        });
    }
    Ok(())
}

/// Generates a random 256-bit data-encryption key (DEK) - the key that
/// actually encrypts profile passwords. Both the passphrase and the
/// recovery key wrap (encrypt) a copy of this same DEK rather than being
/// used to encrypt data directly, so that either one can unlock the vault
/// independently, and rotating the passphrase (via `vault_recover`) never
/// requires re-encrypting every stored profile.
pub fn generate_dek() -> VaultKey {
    let mut key = [0u8; KEY_LEN];
    rand::thread_rng().fill_bytes(&mut key);
    key
}

const RECOVERY_KEY_BYTES: usize = 20; // 160 bits

/// Generates a one-time recovery key: 160 random bits, base32-encoded
/// (RFC 4648 - no 0/1/8/9 digits, so there's no risk of confusing a letter
/// for a digit when hand-copying it) and grouped into dashed 4-character
/// blocks for readability, e.g. `ABCD-EFGH-...`.
pub fn generate_recovery_key() -> String {
    let mut bytes = [0u8; RECOVERY_KEY_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    let encoded = data_encoding::BASE32_NOPAD.encode(&bytes);

    encoded
        .as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect::<Vec<_>>()
        .join("-")
}

/// Strips whitespace/dashes and uppercases a user-entered recovery key
/// before using it as KDF input, so formatting differences from how it was
/// originally displayed (spacing, case, stray dashes) don't cause a valid
/// key to be rejected.
pub fn normalize_recovery_key(input: &str) -> String {
    input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .flat_map(char::to_uppercase)
        .collect()
}

/// Generates a fresh cryptographically random salt suitable for Argon2id.
pub fn random_salt() -> [u8; SALT_LEN] {
    let mut salt = [0u8; SALT_LEN];
    rand::thread_rng().fill_bytes(&mut salt);
    salt
}

/// Derives a 256-bit key from a passphrase and salt using Argon2id (RFC 9106 defaults
/// from the `argon2` crate: m=19MiB, t=2, p=1), producing a raw key (not a PHC string).
pub fn derive_key(passphrase: &str, salt: &[u8]) -> AppResult<VaultKey> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Crypto(format!("key derivation failed: {e}")))?;
    Ok(key)
}

/// Encrypts `plaintext` under `key`, returning `nonce || ciphertext_with_tag`.
pub fn encrypt(key: &VaultKey, plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));

    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let mut ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Crypto(format!("encryption failed: {e}")))?;

    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.append(&mut ciphertext);
    Ok(out)
}

/// Decrypts a `nonce || ciphertext_with_tag` blob produced by [`encrypt`]. Failure
/// (including AEAD authentication failure, which is what happens when the wrong key
/// is used) is intentionally not distinguished from "malformed input" here - callers
/// that need to surface a "wrong passphrase" error map this to that themselves, since
/// only they know whether the caller-supplied key came from a passphrase attempt.
pub fn decrypt(key: &VaultKey, blob: &[u8]) -> AppResult<Vec<u8>> {
    if blob.len() < NONCE_LEN {
        return Err(AppError::Crypto("ciphertext too short".into()));
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::Crypto(format!("decryption failed: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_returns_original_plaintext() {
        let salt = random_salt();
        let key = derive_key("correct horse battery staple", &salt).unwrap();

        let plaintext = b"hunter2".to_vec();
        let ciphertext = encrypt(&key, &plaintext).unwrap();

        // Ciphertext should not just be the plaintext with a nonce slapped on.
        assert_ne!(&ciphertext[NONCE_LEN..], plaintext.as_slice());

        let decrypted = decrypt(&key, &ciphertext).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_passphrase_fails_to_decrypt() {
        let salt = random_salt();
        let right_key = derive_key("correct horse battery staple", &salt).unwrap();
        let wrong_key = derive_key("wrong guess", &salt).unwrap();

        let ciphertext = encrypt(&right_key, b"super secret password").unwrap();

        assert!(decrypt(&wrong_key, &ciphertext).is_err());
    }

    #[test]
    fn same_passphrase_and_salt_derive_the_same_key() {
        let salt = random_salt();
        let key_a = derive_key("passphrase", &salt).unwrap();
        let key_b = derive_key("passphrase", &salt).unwrap();
        assert_eq!(key_a, key_b);
    }

    #[test]
    fn different_salts_derive_different_keys() {
        let key_a = derive_key("passphrase", &random_salt()).unwrap();
        let key_b = derive_key("passphrase", &random_salt()).unwrap();
        assert_ne!(key_a, key_b);
    }

    #[test]
    fn validate_passphrase_len_rejects_short_passphrases() {
        let err = validate_passphrase_len("short").unwrap_err();
        assert!(matches!(err, AppError::PassphraseTooShort { min: 8 }));
    }

    #[test]
    fn validate_passphrase_len_accepts_eight_or_more_chars() {
        assert!(validate_passphrase_len("exactly8").is_ok());
        assert!(validate_passphrase_len("way more than eight characters").is_ok());
    }

    #[test]
    fn generate_dek_is_random() {
        assert_ne!(generate_dek(), generate_dek());
    }

    #[test]
    fn recovery_key_round_trips_through_normalize() {
        let key = generate_recovery_key();
        assert!(key.contains('-'));
        // Simulate a user retyping it with stray spacing/lowercase.
        let messy = format!(" {} ", key.to_lowercase());
        assert_eq!(normalize_recovery_key(&key), normalize_recovery_key(&messy));
    }

    #[test]
    fn dek_wrapped_by_recovery_key_unwraps_correctly() {
        let dek = generate_dek();
        let recovery_key = generate_recovery_key();
        let salt = random_salt();

        let derived = derive_key(&normalize_recovery_key(&recovery_key), &salt).unwrap();
        let wrapped = encrypt(&derived, &dek).unwrap();

        // Simulate the user retyping the key with different casing/spacing.
        let retyped = normalize_recovery_key(&format!("  {}  ", recovery_key.to_lowercase()));
        let re_derived = derive_key(&retyped, &salt).unwrap();
        let unwrapped = decrypt(&re_derived, &wrapped).unwrap();

        assert_eq!(unwrapped, dek);
    }
}
