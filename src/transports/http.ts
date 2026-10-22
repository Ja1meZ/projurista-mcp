import * as http from "http";
import { VERSOES_PROTOCOLO, type Despachante } from "../mcp/despachante";
import type { Registro } from "../registro";
import { tokensIguais } from "./tcp";

export interface OpcoesHttp {
	despachante: Despachante;
	registro: Registro;
	token: () => string;
}

const ORIGENS_LOCAIS = /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/i;
const LIMITE_CORPO = 20 * 1024 * 1024;

/**
 * Transporte Streamable HTTP (endpoint único /mcp), sem sessão e com resposta
 * JSON única por requisição. Serve ao Claude Code, Cursor e outros clientes.
 * Exige Authorization: Bearer <token>, valida Origin e escuta só em 127.0.0.1.
 */
export class TransporteHttp {
	private servidor: http.Server | null = null;
	private porta = 0;

	constructor(private opcoes: OpcoesHttp) {}

	get ativo(): boolean {
		return this.servidor !== null;
	}

	get portaAtual(): number {
		return this.porta;
	}

	async iniciar(portaDesejada: number): Promise<number> {
		if (this.servidor) return this.porta;
		let ultimoErro: Error | null = null;
		for (let tentativa = 0; tentativa < 20; tentativa++) {
			const porta = portaDesejada + tentativa;
			try {
				await this.escutar(porta);
				this.porta = porta;
				return porta;
			} catch (erro) {
				ultimoErro = erro instanceof Error ? erro : new Error(String(erro));
				if ((erro as NodeJS.ErrnoException).code !== "EADDRINUSE") break;
			}
		}
		throw ultimoErro ?? new Error("Não foi possível abrir o servidor HTTP.");
	}

	private escutar(porta: number): Promise<void> {
		return new Promise((resolver, rejeitar) => {
			const servidor = http.createServer((req, res) => {
				this.tratar(req, res).catch((erro) => {
					this.opcoes.registro.erro(`HTTP: ${erro instanceof Error ? erro.message : String(erro)}`);
					if (!res.headersSent) this.responderJson(res, 500, { jsonrpc: "2.0", id: null, error: { code: -32603, message: "Erro interno." } });
				});
			});
			servidor.once("error", (erro) => {
				servidor.close();
				rejeitar(erro);
			});
			servidor.listen(porta, "127.0.0.1", () => {
				servidor.removeAllListeners("error");
				servidor.on("error", (erro) => this.opcoes.registro.erro(`Servidor HTTP: ${erro.message}`));
				this.servidor = servidor;
				resolver();
			});
		});
	}

	async parar(): Promise<void> {
		const servidor = this.servidor;
		this.servidor = null;
		this.porta = 0;
		if (!servidor) return;
		servidor.closeAllConnections?.();
		await new Promise<void>((resolver) => servidor.close(() => resolver()));
	}

	private async tratar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const caminho = url.pathname.replace(/\/+$/, "") || "/";

		if (caminho === "/" && req.method === "GET") {
			this.responderJson(res, 200, { servidor: "Projurista MCP", endpoint: "/mcp", autenticacao: "Authorization: Bearer <token>" });
			return;
		}
		if (caminho !== "/mcp") {
			this.responderJson(res, 404, { erro: "Use o endpoint /mcp." });
			return;
		}

		const origem = req.headers.origin;
		if (origem && !ORIGENS_LOCAIS.test(origem)) {
			this.opcoes.registro.aviso(`HTTP recusado: Origin não local (${origem}).`);
			this.responderJson(res, 403, { erro: "Origem não permitida." });
			return;
		}

		const autorizacao = req.headers.authorization ?? "";
		const token = autorizacao.startsWith("Bearer ") ? autorizacao.slice(7).trim() : "";
		if (!tokensIguais(token, this.opcoes.token())) {
			this.opcoes.registro.aviso("HTTP recusado: token ausente ou inválido.");
			res.setHeader("WWW-Authenticate", 'Bearer realm="Projurista MCP"');
			this.responderJson(res, 401, { erro: "Token inválido. Copie o token nas configurações do Projurista MCP." });
			return;
		}

		if (req.method === "GET" || req.method === "DELETE") {
			res.statusCode = 405;
			res.setHeader("Allow", "POST");
			res.end();
			return;
		}
		if (req.method !== "POST") {
			res.statusCode = 405;
			res.setHeader("Allow", "POST");
			res.end();
			return;
		}

		const versaoCabecalho = req.headers["mcp-protocol-version"];
		if (typeof versaoCabecalho === "string" && !VERSOES_PROTOCOLO.includes(versaoCabecalho)) {
			this.responderJson(res, 400, { erro: `Versão de protocolo não suportada: ${versaoCabecalho}` });
			return;
		}

		const corpo = await this.lerCorpo(req);
		if (corpo === null) {
			this.responderJson(res, 413, { erro: "Corpo da requisição maior que o permitido." });
			return;
		}
		const resposta = await this.opcoes.despachante.tratarTexto(corpo);
		if (resposta === null) {
			res.statusCode = 202;
			res.end();
			return;
		}
		this.responderJson(res, 200, resposta);
	}

	private lerCorpo(req: http.IncomingMessage): Promise<string | null> {
		return new Promise((resolver, rejeitar) => {
			const pedacos: Buffer[] = [];
			let tamanho = 0;
			req.on("data", (pedaco: Buffer) => {
				tamanho += pedaco.length;
				if (tamanho > LIMITE_CORPO) {
					resolver(null);
					req.destroy();
					return;
				}
				pedacos.push(pedaco);
			});
			req.on("end", () => resolver(Buffer.concat(pedacos).toString("utf8")));
			req.on("error", rejeitar);
		});
	}

	private responderJson(res: http.ServerResponse, status: number, corpo: unknown): void {
		const texto = JSON.stringify(corpo);
		res.statusCode = status;
		res.setHeader("Content-Type", "application/json; charset=utf-8");
		res.setHeader("Content-Length", Buffer.byteLength(texto));
		res.end(texto);
	}
}
