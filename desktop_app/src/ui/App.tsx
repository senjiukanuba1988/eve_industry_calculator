import { APP_NAME, APP_VERSION } from "../appInfo";
import type { Runtime } from "../storage/runtime";

interface AppProps {
  runtime: Runtime;
}

export function App({ runtime }: AppProps) {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>
        Version {APP_VERSION} · {runtime === "desktop" ? "desktop" : "browser (development)"}
      </p>
    </main>
  );
}
