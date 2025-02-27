import eslint from "@eslint/js";
import prettierPlugin from "eslint-plugin-prettier";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      "prettier/prettier": "error",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-useless-escape": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "src-tauri/**",
      "libs/**",
      "public/openscad.js",
      "public/openscad.wasm",
      "public/libraries/**",
      "src/wasm/**",
      "**/*.wasm",
    ],
  },
];
