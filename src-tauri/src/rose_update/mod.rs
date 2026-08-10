//! Update logic vendored from rednimgames/rose-updater
//! (https://github.com/rednimgames/rose-updater, MIT licensed), adapted to
//! run headlessly from our own Tauri commands instead of their FLTK GUI.
//!
//! Why vendor instead of depending on their `rose_update` crate directly:
//! that crate's Cargo.toml lists `fltk`/`fltk-webview`/`rfd` (their GUI
//! toolkit) as unconditional dependencies, not feature-gated - depending on
//! it at all would pull in a full native GUI toolkit requiring a C++/CMake
//! build toolchain, even though we only need five source files' worth of
//! pure update logic (manifest fetching, chunked-diff downloading via
//! `bitar`, progress tracking) that never touch FLTK.
//!
//! Tradeoff accepted: we now own this code. If Rednim changes their
//! manifest format or chunking scheme, that won't reach us automatically -
//! someone has to notice and re-sync manually. For a protocol this
//! stable/slow-moving, that's a reasonable one-time cost.
//!
//! Not vendored: their src/dns.rs (a hardcoded-Cloudflare-resolver
//! robustness measure, not required for correctness - see clone.rs) and
//! the GUI's "update the updater binary itself, then restart" logic in
//! main.rs (irrelevant - we don't ship or run rose-updater.exe as a binary
//! at all, so there's no updater executable of our own to keep current).

pub mod clone;
pub mod error;
pub mod manifest;
pub mod progress;
pub mod sync;
