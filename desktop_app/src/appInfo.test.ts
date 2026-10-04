import packageJson from "../package.json" with { type: "json" };
import tauriConfig from "../src-tauri/tauri.conf.json" with { type: "json" };
import { APP_VERSION } from "./appInfo";

describe("app version", () => {
  it("comes from package.json", () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it("is the version Tauri builds with", () => {
    expect(tauriConfig.version).toBe("../package.json");
  });
});
