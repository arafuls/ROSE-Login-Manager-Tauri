//! Windows-only: repositions the ROSE client's window behind the login
//! manager's own window in the z-order, for the "launch client behind"
//! setting. Matches the old app's `ProcessManager.MoveToBackground` /
//! `FindMainWindowHandle`: poll for the newly-launched process's visible
//! top-level window (it doesn't exist the instant the process spawns), then
//! `SetWindowPos` it directly behind this app's window.

use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager};

const MAX_POLL_ATTEMPTS: u32 = 50;
const POLL_INTERVAL: Duration = Duration::from_millis(100);

#[cfg(windows)]
pub fn move_behind_main_window(app: &AppHandle, child_pid: u32) {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetWindowPos, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE,
    };

    struct SearchState {
        target_pid: u32,
        found: Option<isize>,
    }

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let state = unsafe { &mut *(lparam.0 as *mut SearchState) };
        let mut window_pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
        }
        if window_pid == state.target_pid && unsafe { IsWindowVisible(hwnd) }.as_bool() {
            state.found = Some(hwnd.0 as isize);
            return BOOL(0); // stop enumeration
        }
        BOOL(1) // keep going
    }

    let Some(main_window) = app.get_webview_window("main") else {
        eprintln!("warning: no main window found, can't move client behind it");
        return;
    };
    let Ok(main_hwnd) = main_window.hwnd() else {
        eprintln!("warning: couldn't resolve the app's own window handle");
        return;
    };

    for _ in 0..MAX_POLL_ATTEMPTS {
        let mut state = SearchState {
            target_pid: child_pid,
            found: None,
        };
        unsafe {
            let _ = EnumWindows(
                Some(enum_windows_proc),
                LPARAM(std::ptr::addr_of_mut!(state) as isize),
            );
        }
        if let Some(raw_hwnd) = state.found {
            let child_hwnd = HWND(raw_hwnd as *mut core::ffi::c_void);
            unsafe {
                let _ = SetWindowPos(
                    child_hwnd,
                    Some(main_hwnd),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
            return;
        }
        thread::sleep(POLL_INTERVAL);
    }
    eprintln!(
        "warning: timed out waiting for the client's window to appear, couldn't move it behind"
    );
}

#[cfg(not(windows))]
pub fn move_behind_main_window(_app: &AppHandle, _child_pid: u32) {}
