import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const double = (name) => fileURLToPath(new URL("./test/doubles/" + name, import.meta.url));

// The device app imports the Zepp OS runtime modules, which exist only on a
// watch. Pointing them at hand-written doubles lets the page itself be driven by
// the unit tests - built, tapped, redrawn - instead of being the one part of the
// app nothing can check.
export default defineConfig({
  resolve: {
    alias: {
      "@zos/ui": double("zos-ui.js"),
      "@zos/device": double("zos-device.js"),
      "@zos/settings": double("zos-settings.js"),
      "@zos/display": double("zos-display.js"),
      "@zos/storage": double("zos-storage.js"),
    },
  },
});
