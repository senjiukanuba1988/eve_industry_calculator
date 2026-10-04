import type { DataFolder } from "./fileSystem";
import { MemoryFileSystem } from "./memoryFileSystem";

/** localStorage key under which the browser adapter keeps its whole "data folder". */
export const BROWSER_STORAGE_KEY = "eve-industry-calculator:data-folder";

interface Saved {
  files: Record<string, string>;
  dirs: string[];
}

/**
 * The data folder for `npm run dev:browser`: an in-memory file system saved to
 * localStorage after every change, so data survives a page reload. Development only;
 * the desktop app never uses it.
 */
export class BrowserFileSystem extends MemoryFileSystem {
  constructor(private readonly storage: Storage | undefined = safeLocalStorage()) {
    super();
    const saved = this.load();
    if (saved) {
      this.files = new Map(Object.entries(saved.files));
      this.dirs = new Set(saved.dirs);
    }
  }

  protected override changed(): void {
    const saved: Saved = { files: Object.fromEntries(this.files), dirs: [...this.dirs] };
    try {
      this.storage?.setItem(BROWSER_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage full or blocked: keep working in memory for this session.
    }
  }

  private load(): Saved | undefined {
    try {
      const text = this.storage?.getItem(BROWSER_STORAGE_KEY);
      return text ? (JSON.parse(text) as Saved) : undefined;
    } catch {
      return undefined;
    }
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function browserDataFolder(): DataFolder {
  return {
    fs: new BrowserFileSystem(),
    path: "(browser storage - development only)",
    open: async () => {
      console.info(`The browser data folder lives in localStorage under "${BROWSER_STORAGE_KEY}".`);
    },
  };
}
