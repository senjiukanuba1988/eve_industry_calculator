//! File operations inside the data folder. Every path is relative to the folder's root,
//! uses `/` as separator, and may not leave the folder, so the webview can reach nothing
//! else on disk. The commit protocol built from these lives in the TypeScript core.

use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::thread;
use std::time::Duration;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub is_dir: bool,
}

/// Resolves a relative path inside `root`, refusing anything that could point outside it.
pub fn resolve(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut path = root.to_path_buf();
    if relative.is_empty() {
        return Ok(path);
    }
    for part in relative.split('/') {
        let mut components = Path::new(part).components();
        match (components.next(), components.next()) {
            (Some(Component::Normal(name)), None) => path.push(name),
            _ => return Err(format!("refusing path outside the data folder: {relative:?}")),
        }
    }
    Ok(path)
}

fn describe(action: &str, relative: &str, error: io::Error) -> String {
    format!("could not {action} {relative:?}: {error}")
}

/// The file's text, or None if it does not exist.
pub fn read_text(root: &Path, relative: &str) -> Result<Option<String>, String> {
    match fs::read_to_string(resolve(root, relative)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(describe("read", relative, e)),
    }
}

/// Creates or overwrites the file and flushes it to disk before returning.
pub fn write_text(root: &Path, relative: &str, text: &str) -> Result<(), String> {
    let path = resolve(root, relative)?;
    let write = || -> io::Result<()> {
        let mut file = fs::File::create(&path)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()
    };
    write().map_err(|e| describe("write", relative, e))
}

/// Renames a file, replacing the target if it exists. Retries for a while if the file is
/// locked, as OneDrive's sync client briefly does to files in a synced Documents folder.
pub fn rename(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let source = resolve(root, from)?;
    let target = resolve(root, to)?;
    with_retry(|| replace_file(&source, &target)).map_err(|e| describe("rename", from, e))
}

/// Deletes a file. A file that does not exist counts as deleted.
pub fn remove(root: &Path, relative: &str) -> Result<(), String> {
    let path = resolve(root, relative)?;
    match with_retry(|| fs::remove_file(&path)) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(describe("delete", relative, e)),
        _ => Ok(()),
    }
}

/// The files and folders directly inside a folder, sorted by name; empty if it does not exist.
pub fn list(root: &Path, relative: &str) -> Result<Vec<Entry>, String> {
    let read = match fs::read_dir(resolve(root, relative)?) {
        Ok(read) => read,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(describe("list", relative, e)),
    };
    let mut entries = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| describe("list", relative, e))?;
        let is_dir = entry.file_type().map_err(|e| describe("list", relative, e))?.is_dir();
        entries.push(Entry { name: entry.file_name().to_string_lossy().into_owned(), is_dir });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

/// Copies a file byte for byte and flushes the copy to disk.
pub fn copy(root: &Path, from: &str, to: &str) -> Result<(), String> {
    let target = resolve(root, to)?;
    fs::copy(resolve(root, from)?, &target)
        // Flushing needs write access on Windows.
        .and_then(|_| fs::OpenOptions::new().write(true).open(&target)?.sync_all())
        .map_err(|e| describe("copy", from, e))
}

/// Creates a folder and any missing parents.
pub fn create_dir(root: &Path, relative: &str) -> Result<(), String> {
    fs::create_dir_all(resolve(root, relative)?).map_err(|e| describe("create folder", relative, e))
}

pub fn exists(root: &Path, relative: &str) -> Result<bool, String> {
    Ok(resolve(root, relative)?.exists())
}

const RETRY_DELAYS_MS: [u64; 6] = [25, 50, 100, 200, 400, 800];

fn with_retry<T>(mut operation: impl FnMut() -> io::Result<T>) -> io::Result<T> {
    let mut delays = RETRY_DELAYS_MS.iter();
    loop {
        match operation() {
            Err(e) if is_lock(&e) => match delays.next() {
                Some(ms) => thread::sleep(Duration::from_millis(*ms)),
                None => return Err(e),
            },
            result => return result,
        }
    }
}

/// Access denied, sharing violation, lock violation: what a briefly held file looks like on Windows.
fn is_lock(error: &io::Error) -> bool {
    matches!(error.raw_os_error(), Some(5 | 32 | 33))
}

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

    let wide = |p: &Path| p.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<u16>>();
    let (source, target) = (wide(source), wide(target));
    // Write-through: the rename has reached the disk when this returns, which the
    // commit protocol relies on for the ordering of its steps.
    let ok = unsafe { MoveFileExW(source.as_ptr(), target.as_ptr(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> io::Result<()> {
    fs::rename(source, target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn folder() -> TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn writes_and_reads_text() {
        let dir = folder();
        write_text(dir.path(), "items.json", "{}\n").unwrap();
        assert_eq!(read_text(dir.path(), "items.json").unwrap().as_deref(), Some("{}\n"));
    }

    #[test]
    fn keeps_text_exactly_including_non_ascii() {
        let dir = folder();
        let text = "{\n  \"'Arbalest' Cruise Launcher I\": 1,\n  \"é\": 2\n}\n";
        write_text(dir.path(), "hangar.json", text).unwrap();
        assert_eq!(fs::read(dir.path().join("hangar.json")).unwrap(), text.as_bytes());
    }

    #[test]
    fn reading_a_missing_file_gives_none() {
        assert_eq!(read_text(folder().path(), "plans.json").unwrap(), None);
    }

    #[test]
    fn overwrites_an_existing_file() {
        let dir = folder();
        write_text(dir.path(), "a.json", "old, and longer").unwrap();
        write_text(dir.path(), "a.json", "new").unwrap();
        assert_eq!(read_text(dir.path(), "a.json").unwrap().as_deref(), Some("new"));
    }

    #[test]
    fn rename_replaces_the_target() {
        let dir = folder();
        write_text(dir.path(), "items.json", "old").unwrap();
        write_text(dir.path(), "items.json.tmp", "new").unwrap();
        rename(dir.path(), "items.json.tmp", "items.json").unwrap();
        assert_eq!(read_text(dir.path(), "items.json").unwrap().as_deref(), Some("new"));
        assert!(!exists(dir.path(), "items.json.tmp").unwrap());
    }

    #[test]
    fn rename_of_a_missing_file_fails() {
        let error = rename(folder().path(), "nothing.tmp", "nothing").unwrap_err();
        assert!(error.starts_with("could not rename \"nothing.tmp\""), "{error}");
    }

    #[cfg(windows)]
    #[test]
    fn rename_waits_for_a_briefly_locked_file() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = folder();
        write_text(dir.path(), "items.json", "old").unwrap();
        write_text(dir.path(), "items.json.tmp", "new").unwrap();
        // Hold the target open with no sharing, as a sync client might, then let go.
        let lock = fs::OpenOptions::new().read(true).share_mode(0).open(dir.path().join("items.json")).unwrap();
        let release = thread::spawn(move || {
            thread::sleep(Duration::from_millis(150));
            drop(lock);
        });
        rename(dir.path(), "items.json.tmp", "items.json").unwrap();
        release.join().unwrap();
        assert_eq!(read_text(dir.path(), "items.json").unwrap().as_deref(), Some("new"));
    }

    #[cfg(windows)]
    #[test]
    fn rename_gives_up_on_a_file_that_stays_locked() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = folder();
        write_text(dir.path(), "items.json", "old").unwrap();
        write_text(dir.path(), "items.json.tmp", "new").unwrap();
        let _lock = fs::OpenOptions::new().read(true).share_mode(0).open(dir.path().join("items.json")).unwrap();
        assert!(rename(dir.path(), "items.json.tmp", "items.json").is_err());
        assert_eq!(read_text(dir.path(), "items.json.tmp").unwrap().as_deref(), Some("new"));
    }

    #[test]
    fn remove_deletes_and_tolerates_a_missing_file() {
        let dir = folder();
        write_text(dir.path(), "commit.json", "{}").unwrap();
        remove(dir.path(), "commit.json").unwrap();
        assert!(!exists(dir.path(), "commit.json").unwrap());
        remove(dir.path(), "commit.json").unwrap();
    }

    #[test]
    fn lists_files_and_folders_sorted() {
        let dir = folder();
        write_text(dir.path(), "plans.json", "").unwrap();
        write_text(dir.path(), "hangar.json", "").unwrap();
        create_dir(dir.path(), "backups").unwrap();
        assert_eq!(
            list(dir.path(), "").unwrap(),
            vec![
                Entry { name: "backups".into(), is_dir: true },
                Entry { name: "hangar.json".into(), is_dir: false },
                Entry { name: "plans.json".into(), is_dir: false },
            ]
        );
    }

    #[test]
    fn listing_a_missing_folder_is_empty() {
        assert_eq!(list(folder().path(), "backups").unwrap(), vec![]);
    }

    #[test]
    fn copies_into_a_nested_folder() {
        let dir = folder();
        write_text(dir.path(), "items.json", "items").unwrap();
        create_dir(dir.path(), "backups/format 1 to 2 - 2026-10-04 16-32").unwrap();
        copy(dir.path(), "items.json", "backups/format 1 to 2 - 2026-10-04 16-32/items.json").unwrap();
        assert_eq!(
            read_text(dir.path(), "backups/format 1 to 2 - 2026-10-04 16-32/items.json").unwrap().as_deref(),
            Some("items")
        );
    }

    #[test]
    fn exists_tells_files_and_folders_from_nothing() {
        let dir = folder();
        create_dir(dir.path(), "backups").unwrap();
        assert!(exists(dir.path(), "backups").unwrap());
        assert!(exists(dir.path(), "").unwrap());
        assert!(!exists(dir.path(), "items.json").unwrap());
    }

    #[test]
    fn refuses_paths_leaving_the_folder() {
        let root = Path::new("C:/data");
        for bad in ["..", "../x", "a/../../x", "a//b", "/etc", "C:/Windows", "C:", "./a", "a\\..\\..\\x"] {
            assert!(resolve(root, bad).is_err(), "{bad:?} should be refused");
        }
        assert_eq!(resolve(root, "backups/x y/items.json").unwrap(), root.join("backups").join("x y").join("items.json"));
    }
}
