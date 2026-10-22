import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { strToU8, zipSync } from "fflate";
import { PONTE_NODE } from "./pontes";
import type { Ferramenta } from "../mcp/tipos";

export interface ParametrosMcpb {
	nomeServidor: string;
	nomeCofre: string;
	portaTcp: number;
	token: string;
	versao: string;
	ferramentas: Ferramenta[];
}

/** Monta, em memória, o pacote .mcpb (ZIP com manifest.json e ponte.js). */
export function montarMcpb(parametros: ParametrosMcpb): Uint8Array {
	const manifesto = {
		manifest_version: "0.3",
		name: parametros.nomeServidor,
		display_name: `Projurista MCP (${parametros.nomeCofre})`,
		version: parametros.versao,
		description: `Conecta o Claude Desktop ao cofre "${parametros.nomeCofre}" do Obsidian pelo plugin Projurista MCP.`,
		long_description:
			"Esta extensão é apenas uma ponte: ela conversa com o plugin Projurista MCP em execução dentro do Obsidian (127.0.0.1). O Obsidian precisa estar aberto com o plugin ativo.",
		author: { name: "Projurista", url: "https://www.instagram.com/projurista/" },
		license: "MIT",
		repository: { type: "git", url: "https://github.com/Ja1meZ/projurista-mcp" },
		keywords: ["obsidian", "notas", "cofre", "projurista"],
		compatibility: {
			platforms: ["darwin", "win32", "linux"],
			runtimes: { node: ">=18.0.0" },
		},
		tools: parametros.ferramentas.map((f) => ({ name: f.name, description: f.description })),
		server: {
			type: "node",
			entry_point: "ponte.js",
			mcp_config: {
				command: "node",
				args: ["${__dirname}/ponte.js"],
				env: {
					PROJURISTA_PORTA: String(parametros.portaTcp),
					PROJURISTA_TOKEN: parametros.token,
				},
			},
		},
	};
	return zipSync(
		{
			"manifest.json": strToU8(JSON.stringify(manifesto, null, 2) + "\n"),
			"ponte.js": strToU8(PONTE_NODE),
		},
		{ level: 6 },
	);
}

export function nomeArquivoMcpb(nomeServidor: string): string {
	return `${nomeServidor}.mcpb`;
}

/** Salva o pacote: pede o local com o diálogo do sistema e, se indisponível, grava em Downloads. */
export async function salvarMcpb(conteudo: Uint8Array, nomeSugerido: string): Promise<string | null> {
	const destinoPadrao = path.join(os.homedir(), "Downloads", nomeSugerido);
	let destino: string | null = null;
	try {
		// O Obsidian expõe o módulo electron ao renderer por window.require; o diálogo nativo é opcional.
		type Electron = { remote?: { dialog?: { showSaveDialog: (o: unknown) => Promise<{ canceled: boolean; filePath?: string }> } } };
		const carregar = (window as unknown as { require?: (modulo: string) => unknown }).require;
		const electron = typeof carregar === "function" ? (carregar("electron") as Electron | undefined) : undefined;
		const dialogo = electron?.remote?.dialog;
		if (dialogo) {
			const resposta = await dialogo.showSaveDialog({
				title: "Salvar extensão do Claude Desktop",
				defaultPath: destinoPadrao,
				filters: [{ name: "Extensão do Claude Desktop", extensions: ["mcpb"] }],
			});
			if (resposta.canceled) return null;
			destino = resposta.filePath ?? null;
		}
	} catch {
		destino = null;
	}
	if (!destino) {
		fs.mkdirSync(path.dirname(destinoPadrao), { recursive: true });
		destino = destinoPadrao;
	}
	fs.writeFileSync(destino, Buffer.from(conteudo));
	return destino;
}
