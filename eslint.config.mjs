import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Module boundary rules (see CLAUDE.md):
//  - A module may only be imported through its index.ts, e.g. "@/modules/booking".
//  - Modules never import from src/app.
//  - Adapters never import from modules (modules depend on adapter interfaces, not the reverse).
const deepModuleImport = {
  group: ["@/modules/*/*", "**/modules/*/*"],
  message: "Import a module only through its index.ts (e.g. '@/modules/booking').",
};

const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"] },
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/app/**/*.{ts,tsx}", "src/shared/**/*.ts", "src/adapters/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [deepModuleImport] }] },
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            deepModuleImport,
            { group: ["@/app/*", "**/app/*"], message: "Modules must not import from src/app." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            deepModuleImport,
            { group: ["@/modules", "@/modules/*"], message: "Adapters must not depend on modules." },
          ],
        },
      ],
    },
  },
  {
    // Business rules must stay pure: no framework or database imports inside rule files.
    files: ["src/modules/**/rules.ts", "src/modules/**/*.rules.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            deepModuleImport,
            { group: ["@/app/*", "**/app/*"], message: "Modules must not import from src/app." },
            { group: ["next", "next/*", "react", "@supabase/*", "@/shared/db", "@/adapters/*"], message: "rules.ts must be pure: no framework, database or adapter imports." },
          ],
        },
      ],
    },
  },
];

export default config;
