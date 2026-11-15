import esbuild from "esbuild";
import process from "process";
import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";

const builtins = [...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

const banner = `/*
Projurista MCP — plugin para Obsidian.
Código-fonte: https://github.com/Ja1meZ/projurista-mcp
Compilado com esbuild; se quiser ler o código, abra o repositório.
*/
`;

const modo = process.argv[2];
const prod = modo === "production";

const context = await esbuild.context({
	banner: { js: banner },
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	minify: false,
});

/** Servidor avulso de súmulas: um arquivo Node, sem dependências (dist/projurista-sumulas.mjs). */
async function compilarAvulso() {
	const { version } = JSON.parse(readFileSync("package.json", "utf8"));
	await esbuild.build({
		banner: { js: "#!/usr/bin/env node\n// Projurista Súmulas — servidor MCP avulso. Código-fonte: https://github.com/Ja1meZ/projurista-mcp" },
		entryPoints: ["src/avulso/servidor-stdio.ts"],
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node18",
		define: { __VERSAO_PROJURISTA__: JSON.stringify(version) },
		logLevel: "info",
		outfile: "dist/projurista-sumulas.mjs",
	});
}

/** Núcleo de súmulas compilado só para os testes (node --test). */
async function compilarTestes() {
	await esbuild.build({
		entryPoints: ["src/sumulas/index.ts"],
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node18",
		logLevel: "warning",
		outfile: "dist/nucleo-sumulas.mjs",
	});
}

if (modo === "testes") {
	await context.dispose();
	await compilarTestes();
	await compilarAvulso();
	process.exit(0);
} else if (prod) {
	await context.rebuild();
	await compilarAvulso();
	process.exit(0);
} else {
	await context.watch();
}
