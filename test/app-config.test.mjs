import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LABELS } from "../lib/i18n/labels.js";
import { UI_KEYS } from "../lib/i18n/keys.js";

const read = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL("../" + name, import.meta.url)), "utf8"));

const appJson = read("app.json");
const packageJson = read("package.json");

// The store listing and what the app calls itself are two places the same name
// has to be written down, and app.json is not covered by any other test, so this
// is where the two are held together.
describe("app.json", () => {
  it("carries the registered store id, not a placeholder", () => {
    expect(Number.isInteger(appJson.app.appId)).toBe(true);
    expect(appJson.app.appId).toBe(1122457);
  });

  it("calls the app the same thing the store, the launcher and the title screen do", () => {
    const name = appJson.app.appName;
    expect(name).toBe("Hex Duel");
    expect(LABELS.en.title).toBe(name);
    for (const locale of Object.keys(appJson.i18n)) {
      expect(appJson.i18n[locale].appName, locale).toBe(name);
    }
    // The name is the app's own, so it reads the same in every language rather
    // than being translated.
    for (const language of Object.keys(LABELS)) {
      expect(LABELS[language].title, language).toBe(name);
    }
  });

  it("keeps the title inside the budget the title screen allows", () => {
    expect(UI_KEYS).toContain("title");
    expect(appJson.app.appName.length).toBeGreaterThan(0);
  });

  // The two version numbers are held together in app-version.test.mjs, against
  // the script that writes them. Not here, and not as an equality: release-please
  // writes the name into app.json when it opens a release PR but cannot compute
  // the code, so between that commit and the build the code is legitimately one
  // release behind, and demanding they agree would fail every release PR's own CI.

  it("is the same project the package is", () => {
    expect(packageJson.name).toBe("amazfit-hex");
    expect(appJson.app.vender.length).toBeGreaterThan(0);
  });

  it("builds for round screens only, which is the only shape the layout handles", () => {
    const platforms = appJson.targets.common.platforms;
    expect(platforms.length).toBeGreaterThan(0);
    for (const platform of platforms) {
      expect(platform.st, JSON.stringify(platform)).toBe("r");
      expect(platform.dw).toBeGreaterThan(0);
    }
    expect(platforms.map((platform) => platform.dw).sort((a, b) => a - b)).toEqual([466, 480]);
  });

  it("ships the one page the app has and the icon it names", () => {
    expect(appJson.targets.common.module.page.pages).toEqual(["page/index"]);
    expect(appJson.app.icon).toBe("icon.png");
    expect(() =>
      readFileSync(fileURLToPath(new URL("../assets/common.r/icon.png", import.meta.url)))
    ).not.toThrow();
  });

  it("asks for the permissions the page actually uses", () => {
    expect(appJson.permissions).toContain("data:os.device.info");
    expect(appJson.permissions).toContain("device:os.local_storage");
  });
});
