import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "src/api/generated/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Use coldStartAwareFetch from src/api/client.ts so Render cold starts surface ColdStartBanner.",
        },
      ],
    },
  },
  {
    files: ["src/api/client.ts", "src/test/**/*.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-globals": "off",
    },
  },
);
