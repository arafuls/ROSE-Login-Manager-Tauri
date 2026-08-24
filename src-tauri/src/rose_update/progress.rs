//! Vendored from rednimgames/rose-updater (MIT licensed), src/progress.rs,
//! with `fltk::app::awake()` calls removed - those existed to wake their
//! FLTK GUI's redraw loop, which is meaningless here. We poll this struct
//! from a ticker task instead (see commands/process.rs) and emit real
//! Tauri events, rather than the original's "wake the GUI, it'll notice
//! the new values next paint" model.

use std::sync::atomic::{self, AtomicU64};
use std::sync::Arc;

/// Which phase of a sync/verify a `ProgressState` is currently in.
#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(usize)]
pub enum ProgressStage {
    None,
    Start,
    FetchingMetadata,
    CheckingFiles,
    DownloadingUpdates,
    VerifyingFiles,
    Done,
}

impl From<usize> for ProgressStage {
    fn from(value: usize) -> Self {
        match value {
            1 => ProgressStage::Start,
            2 => ProgressStage::FetchingMetadata,
            3 => ProgressStage::CheckingFiles,
            4 => ProgressStage::DownloadingUpdates,
            5 => ProgressStage::VerifyingFiles,
            6 => ProgressStage::Done,
            _ => ProgressStage::None,
        }
    }
}

impl ProgressStage {
    /// Human-readable label for the LaunchStatusBar - not part of the
    /// vendored code, added for our own UI.
    pub fn label(self) -> &'static str {
        match self {
            ProgressStage::None | ProgressStage::Start => "Starting...",
            ProgressStage::FetchingMetadata => "Checking for updates...",
            ProgressStage::CheckingFiles => "Checking game files...",
            ProgressStage::DownloadingUpdates => "Downloading updates...",
            ProgressStage::VerifyingFiles => "Verifying game files...",
            ProgressStage::Done => "Done",
        }
    }
}

/// Shared, atomically-updated sync/verify progress - cheap to `Clone`
/// (every clone shares the same underlying counters via `Arc`), so a copy
/// can be handed to both the async work and the ticker task that polls it
/// (see `run_with_progress` in `commands/process.rs`).
#[derive(Clone)]
pub struct ProgressState {
    current_progress: Arc<AtomicU64>,
    max_progress: Arc<AtomicU64>,
    stage: Arc<AtomicU64>,
}

impl Default for ProgressState {
    fn default() -> Self {
        Self {
            current_progress: Arc::new(AtomicU64::new(0)),
            max_progress: Arc::new(AtomicU64::new(0)),
            stage: Arc::new(AtomicU64::new(ProgressStage::Start as u64)),
        }
    }
}

impl ProgressState {
    pub fn max_progress(&self) -> u64 {
        self.max_progress.load(atomic::Ordering::Relaxed)
    }

    pub fn current_progress(&self) -> u64 {
        self.current_progress.load(atomic::Ordering::Relaxed)
    }

    pub fn set_max_progress(&self, val: u64) {
        self.max_progress.store(val, atomic::Ordering::Relaxed);
    }

    pub fn set_current_progress(&self, val: u64) {
        self.current_progress.store(val, atomic::Ordering::Relaxed);
    }

    pub fn increment_progress(&self, val: u64) {
        self.current_progress
            .fetch_add(val, atomic::Ordering::Relaxed);
    }

    pub fn set_stage(&self, val: ProgressStage) {
        self.stage.store(val as u64, atomic::Ordering::Relaxed);
    }

    pub fn current_stage(&self) -> ProgressStage {
        ProgressStage::from(self.stage.load(atomic::Ordering::Relaxed) as usize)
    }
}
