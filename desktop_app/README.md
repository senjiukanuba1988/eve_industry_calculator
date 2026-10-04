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
