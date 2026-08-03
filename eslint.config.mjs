import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

// Flat ESLint config. Pure logic is plain ES modules; the device app, the side
// service and the settings app run in Zepp OS runtimes that expose a few globals,
// declared below so lint does not flag them. Prettier owns formatting, so its
// config is applied last to turn off the stylistic rules that would fight it.
export default [
  { ignores: ["node_modules/", "dist/", "build/", "coverage/"] },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.es2021,
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        // Zepp OS module entry points and runtime globals.
        App: "readonly",
        Page: "readonly",
        AppSideService: "readonly",
        AppSettingsPage: "readonly",
        getApp: "readonly",
        getCurrentPage: "readonly",
        getDeviceInfo: "readonly",
        fetch: "readonly",
        // Settings-app UI builders (setting/index.js).
        View: "readonly",
        Text: "readonly",
        TextInput: "readonly",
        Button: "readonly",
        Select: "readonly",
        Toggle: "readonly",
        gettext: "readonly",
      },
    },
  },

  // Tests and Node-side tooling run under Node/Vitest.
  {
    files: ["**/*.test.mjs", "*.config.mjs", "scripts/**/*.js"],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
];
