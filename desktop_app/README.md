# EVE Industry Calculator (desktop)

Tauri 2 + React + TypeScript + Vite. Specification and design live in
`../.claude/goals/desktop_application/` (`openspec/`, `design/`).

## Layout

```
src/
  core/      domain logic - pure TypeScript, no UI, no I/O (enforced by ESLint)
  storage/   storage interface and its adapters (Tauri files, browser for development)
  ui/        React components
  appInfo.ts app name and version
src-tauri/   thin Rust layer: file access, single instance, Explorer
```

The app version is set in `package.json` only; `src-tauri/tauri.conf.json` and the UI read it from there.

## Scripts

| Script                | What it does                                                   |
|-----------------------|----------------------------------------------------------------|
| `npm run dev`         | Desktop window with hot reload                                 |
| `npm run dev:browser` | The app in a plain browser, using the browser storage adapter  |
| `npm test`            | Vitest, then `cargo test`                                      |
| `npm run lint`        | `tsc`, ESLint, then clippy with warnings as errors             |
| `npm run build`       | Windows installer (NSIS) in `src-tauri/target/release/bundle/` |

Requires Node LTS, Rust (stable, MSVC) and the Visual Studio Build Tools on Windows.

## Releasing

1. **Bump the version** in `package.json` (`"version"`), and nowhere else. The installer, the
   version shown in the app (sidebar, Data folder section) and `writtenBy` in `manifest.json`
   all read it from there. Windows recognises a newer installer as an update by the identifier
   `de.senjiu.eve-industry-calculator` in `tauri.conf.json`, which must never change.
2. **If any data file's shape changed** - a new field, even optional; a new enum value such
   as a recipe type; a new or renamed file - the format changes too
   (`../.claude/goals/desktop_application/design/upgrades.md`):
   - raise `CURRENT_FORMAT` in `src/core/data/format.ts` by exactly 1;
   - add a conversion step `{ from: N, describe, convert }` to the end of `CONVERSION_STEPS`
     there, with its own tests, including a malformed input;
   - add `src/core/data/fixtures/format-<N+1>/` (a complete data folder in the new format)
     and its `format-<N+1>.schema.json`. The format-N fixture and its released steps are
     never changed again.

   The format-change guard in `format.test.ts` fails until this is done.
   Once a release has been used against real data, this applies without exception.
3. `npm run lint` and `npm test` pass.
4. `npm run build` produces `src-tauri/target/release/bundle/nsis/EVE Industry Calculator_<version>_x64-setup.exe`.
   Installing it over an older version updates in place; the data folder
   `Documents\EVE Industry Calculator` is never touched by installing or uninstalling.
   The uninstaller says where the data folder is (`src-tauri/windows/hooks.nsh`).

Debug builds (`npm run dev`) use `Documents\EVE Industry Calculator (dev)`, so development
never touches real data.

The app icon is drawn in `app-icon.svg`; after changing it, run `npx tauri icon app-icon.svg`
and delete the generated `src-tauri/icons/android` and `src-tauri/icons/ios` folders.
