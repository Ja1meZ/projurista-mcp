import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { scriptShellMac } from "./pontes";

export interface EntradaServidor {
	command: string;
	args: string[];
	env?: Record<string, string>;
}

export interface ParametrosConexao {
	nomeServidor: string;
	portaTcp: number;
	portaHttp: number;
	httpAtivo: boolean;
	token: string;
	/** Caminho absoluto de ponte.ps1 (Windows). */
	caminhoPontePowerShell: string;
	plataforma?: NodeJS.Platform;
}

export type Plataforma = "darwin" | "win32" | "linux" | "outra";

export function plataformaAtual(): Plataforma {
	switch (process.platform) {
		case "darwin":
			return "darwin";
		case "win32":
			return "win32";
		case "linux":
			return "linux";
		default:
			return "outra";
	}
}

/** Caminho do arquivo de configuração do Claude Desktop na plataforma atual (ou null se desconhecida). */
export function caminhoConfigClaude(plataforma: Plataforma = plataformaAtual()): string | null {
	const home = os.homedir();
	switch (plataforma) {
		case "darwin":
			return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
		case "win32": {
			const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
			return path.join(appData, "Claude", "claude_desktop_config.json");
		}
		case "linux":
			return path.join(home, ".config", "Claude", "claude_desktop_config.json");
		default:
			return null;
	}
}

export function caminhoPowerShell(): string {
	const raiz = process.env.SystemRoot || "C:\\Windows";
	return path.win32.join(raiz, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Monta a entrada mcpServers para a plataforma. No Linux usa a mesma ponte sh+nc do macOS. */
export function entradaServidor(parametros: ParametrosConexao, plataforma: Plataforma = plataformaAtual()): EntradaServidor {
	const env = { PROJURISTA_TOKEN: parametros.token };
	if (plataforma === "win32") {
		return {
			command: caminhoPowerShell(),
			args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", parametros.caminhoPontePowerShell, "-Porta", String(parametros.portaTcp)],
			env,
		};
	}
	const nc = plataforma === "darwin" ? "/usr/bin/nc" : "nc";
	return {
		command: "/bin/sh",
		args: ["-c", scriptShellMac(parametros.portaTcp).replace(/\/usr\/bin\/nc/g, nc)],
		env,
	};
}

export function configuracaoCompleta(parametros: ParametrosConexao, plataforma: Plataforma = plataformaAtual()): Record<string, unknown> {
	return { mcpServers: { [parametros.nomeServidor]: entradaServidor(parametros, plataforma) } };
}

export function comandoClaudeCode(parametros: ParametrosConexao): string {
	return `claude mcp add --transport http ${parametros.nomeServidor} http://127.0.0.1:${parametros.portaHttp}/mcp --header "Authorization: Bearer ${parametros.token}"`;
}

export interface ResultadoGravacao {
	caminho: string;
	copiaDeSeguranca: string | null;
	arquivoEstavaCorrompido: boolean;
	arquivoNovo: boolean;
}

export function claudeDesktopInstalado(plataforma: Plataforma = plataformaAtual()): boolean {
	const caminho = caminhoConfigClaude(plataforma);
	if (!caminho) return false;
	return fs.existsSync(path.dirname(caminho));
}

/**
 * Grava (ou atualiza) a entrada do servidor em claude_desktop_config.json.
 * Sempre faz cópia de segurança do arquivo existente antes de alterar.
 * Este é o único ponto do plugin que escreve fora do cofre, com consentimento do usuário.
 */
export function gravarNoClaudeDesktop(parametros: ParametrosConexao, opcoes: { criarPastaSeAusente: boolean }, plataforma: Plataforma = plataformaAtual()): ResultadoGravacao {
	const caminho = caminhoConfigClaude(plataforma);
	if (!caminho) throw new Error("Sistema operacional não suportado para configuração automática.");
	const pasta = path.dirname(caminho);
	if (!fs.existsSync(pasta)) {
		if (!opcoes.criarPastaSeAusente) {
			throw new Error(`A pasta do Claude Desktop não existe (${pasta}). Instale o Claude Desktop, abra-o uma vez e tente de novo.`);
		}
		fs.mkdirSync(pasta, { recursive: true });
	}

	let atual: Record<string, unknown> = {};
	let copiaDeSeguranca: string | null = null;
	let corrompido = false;
	let arquivoNovo = true;
	if (fs.existsSync(caminho)) {
		arquivoNovo = false;
		const texto = fs.readFileSync(caminho, "utf8");
		copiaDeSeguranca = `${caminho}.bak-${carimbo()}`;
		fs.copyFileSync(caminho, copiaDeSeguranca);
		if (texto.trim() !== "") {
			try {
				const lido = lerObjetoJson(texto);
				if (lido) atual = lido;
				else corrompido = true;
			} catch {
				corrompido = true;
			}
		}
	}

	const servidores = typeof atual.mcpServers === "object" && atual.mcpServers !== null && !Array.isArray(atual.mcpServers)
		? (atual.mcpServers as Record<string, unknown>)
		: {};
	servidores[parametros.nomeServidor] = entradaServidor(parametros, plataforma);
	const novo = corrompido ? { mcpServers: servidores } : { ...atual, mcpServers: servidores };
	fs.writeFileSync(caminho, JSON.stringify(novo, null, 2) + "\n", "utf8");
	return { caminho, copiaDeSeguranca, arquivoEstavaCorrompido: corrompido, arquivoNovo };
}

/** Remove a entrada do servidor do arquivo do Claude Desktop (desfazer). */
export function removerDoClaudeDesktop(nomeServidor: string, plataforma: Plataforma = plataformaAtual()): boolean {
	const caminho = caminhoConfigClaude(plataforma);
	if (!caminho || !fs.existsSync(caminho)) return false;
	let atual: Record<string, unknown> | null;
	try {
		atual = lerObjetoJson(fs.readFileSync(caminho, "utf8"));
	} catch {
		return false;
	}
	if (!atual) return false;
	const servidores = atual.mcpServers;
	if (typeof servidores !== "object" || servidores === null || !(nomeServidor in (servidores as Record<string, unknown>))) return false;
	fs.copyFileSync(caminho, `${caminho}.bak-${carimbo()}`);
	delete (servidores as Record<string, unknown>)[nomeServidor];
	fs.writeFileSync(caminho, JSON.stringify(atual, null, 2) + "\n", "utf8");
	return true;
}

/** Indica se o arquivo do Claude Desktop já tem a entrada deste servidor com a porta e o token atuais. */
export function estadoNoClaudeDesktop(parametros: ParametrosConexao, plataforma: Plataforma = plataformaAtual()): "ausente" | "atualizado" | "desatualizado" {
	const caminho = caminhoConfigClaude(plataforma);
	if (!caminho || !fs.existsSync(caminho)) return "ausente";
	try {
		const atual = lerObjetoJson(fs.readFileSync(caminho, "utf8"));
		const servidores = atual && typeof atual.mcpServers === "object" && atual.mcpServers !== null ? (atual.mcpServers as Record<string, unknown>) : null;
		const entrada = servidores?.[parametros.nomeServidor];
		if (!entrada) return "ausente";
		const esperada = entradaServidor(parametros, plataforma);
		return JSON.stringify(entrada) === JSON.stringify(esperada) ? "atualizado" : "desatualizado";
	} catch {
		return "ausente";
	}
}

/** Desserializa JSON e devolve o objeto, ou null se o texto não for um objeto JSON. Lança em JSON inválido. */
function lerObjetoJson(texto: string): Record<string, unknown> | null {
	const lido: unknown = JSON.parse(texto);
	if (typeof lido === "object" && lido !== null && !Array.isArray(lido)) return lido as Record<string, unknown>;
	return null;
}

function carimbo(): string {
	const d = new Date();
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
