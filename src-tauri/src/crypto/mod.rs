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

pub type VaultKey = [u8; KEY_LEN];

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
}
