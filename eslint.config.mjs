import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
		},
	},
	{ ignores: ["main.js", "node_modules/**", "esbuild.config.mjs", "version-bump.mjs", "eslint.config.mjs"] },
);
