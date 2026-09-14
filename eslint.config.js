import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/coverage/**", "**/dist/**", "**/node_modules/**", "_local/**", "output/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["examples/crisp/*.js"],
    languageOptions: { globals: { document: "readonly", window: "readonly" } },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
