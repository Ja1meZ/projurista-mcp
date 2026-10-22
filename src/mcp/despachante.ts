import {
	CODIGOS,
	ContextoFerramenta,
	ErroFerramenta,
	Ferramenta,
	JsonRpcId,
	JsonRpcRequisicao,
	JsonRpcResposta,
	ResultadoFerramenta,
} from "./tipos";

export const VERSOES_PROTOCOLO = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const VERSAO_PROTOCOLO_PADRAO = "2025-06-18";

export interface OpcoesDespachante {
	nomeServidor: string;
	versaoServidor: string;
	ferramentas: Ferramenta[];
	contexto: () => ContextoFerramenta;
	escritaPermitida: () => boolean;
}

function respostaErro(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResposta {
	const erro: JsonRpcResposta["error"] = { code, message };
	if (data !== undefined) erro.data = data;
	return { jsonrpc: "2.0", id, error: erro };
}

function respostaOk(id: JsonRpcId, result: unknown): JsonRpcResposta {
	return { jsonrpc: "2.0", id, result };
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Despachante JSON-RPC do MCP. Independe do transporte: recebe uma mensagem
 * já desserializada e devolve a resposta (ou null para notificações).
 */
export class Despachante {
	constructor(private opcoes: OpcoesDespachante) {}

	get ferramentas(): Ferramenta[] {
		return this.opcoes.ferramentas;
	}

	/** Ferramentas visíveis para o cliente, conforme a chave de escrita. */
	ferramentasVisiveis(): Ferramenta[] {
		const escrita = this.opcoes.escritaPermitida();
		return this.opcoes.ferramentas.filter((f) => !f.escrita || escrita);
	}

	/** Trata texto bruto (uma linha ou um corpo HTTP). */
	async tratarTexto(texto: string): Promise<JsonRpcResposta | JsonRpcResposta[] | null> {
		let mensagem: unknown;
		try {
			mensagem = JSON.parse(texto);
		} catch {
			return respostaErro(null, CODIGOS.PARSE, "JSON inválido.");
		}
		return this.tratar(mensagem);
	}

	async tratar(mensagem: unknown): Promise<JsonRpcResposta | JsonRpcResposta[] | null> {
		if (Array.isArray(mensagem)) {
			if (mensagem.length === 0) {
				return respostaErro(null, CODIGOS.REQUISICAO_INVALIDA, "Lote vazio.");
			}
			const respostas: JsonRpcResposta[] = [];
			for (const item of mensagem) {
				const resposta = await this.tratarUma(item);
				if (resposta) respostas.push(resposta);
			}
			return respostas.length > 0 ? respostas : null;
		}
		return this.tratarUma(mensagem);
	}

	private async tratarUma(mensagem: unknown): Promise<JsonRpcResposta | null> {
		if (!ehObjeto(mensagem) || mensagem.jsonrpc !== "2.0" || typeof mensagem.method !== "string") {
			// Respostas vindas do cliente (a requisições do servidor) são ignoradas em silêncio.
			if (ehObjeto(mensagem) && ("result" in mensagem || "error" in mensagem)) return null;
			const id = ehObjeto(mensagem) && (typeof mensagem.id === "string" || typeof mensagem.id === "number") ? mensagem.id : null;
			return respostaErro(id, CODIGOS.REQUISICAO_INVALIDA, "Requisição JSON-RPC inválida.");
		}

		const requisicao = mensagem as unknown as JsonRpcRequisicao;
		const ehNotificacao = requisicao.id === undefined;
		const id: JsonRpcId = requisicao.id ?? null;
		const params = ehObjeto(requisicao.params) ? requisicao.params : {};

		try {
			switch (requisicao.method) {
				case "initialize":
					return respostaOk(id, this.inicializar(params));
				case "notifications/initialized":
				case "notifications/cancelled":
				case "notifications/progress":
				case "notifications/roots/list_changed":
					return null;
				case "ping":
					return respostaOk(id, {});
				case "tools/list":
					return respostaOk(id, {
						tools: this.ferramentasVisiveis().map((f) => ({
							name: f.name,
							description: f.description,
							inputSchema: f.inputSchema,
						})),
					});
				case "tools/call":
					return respostaOk(id, await this.chamarFerramenta(params));
				case "resources/list":
					return respostaOk(id, { resources: [] });
				case "resources/templates/list":
					return respostaOk(id, { resourceTemplates: [] });
				case "prompts/list":
					return respostaOk(id, { prompts: [] });
				case "logging/setLevel":
					return respostaOk(id, {});
				default:
					if (ehNotificacao) return null;
					return respostaErro(id, CODIGOS.METODO_NAO_ENCONTRADO, `Método não suportado: ${requisicao.method}`);
			}
		} catch (erro) {
			if (ehNotificacao) return null;
			if (erro instanceof ErroParametros) {
				return respostaErro(id, CODIGOS.PARAMETROS_INVALIDOS, erro.message);
			}
			const mensagemErro = erro instanceof Error ? erro.message : String(erro);
			this.opcoes.contexto().registro.erro(`Falha interna em ${requisicao.method}: ${mensagemErro}`);
			return respostaErro(id, CODIGOS.INTERNO, mensagemErro);
		}
	}

	private inicializar(params: Record<string, unknown>): unknown {
		const pedida = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
		const versao = VERSOES_PROTOCOLO.includes(pedida) ? pedida : VERSAO_PROTOCOLO_PADRAO;
		const cliente = ehObjeto(params.clientInfo) ? params.clientInfo : {};
		const nomeCliente = typeof cliente.name === "string" ? cliente.name : "cliente desconhecido";
		this.opcoes.contexto().registro.info(`Sessão iniciada por ${nomeCliente} (protocolo ${versao}).`);
		return {
			protocolVersion: versao,
			capabilities: {
				tools: { listChanged: true },
			},
			serverInfo: {
				name: this.opcoes.nomeServidor,
				title: "Projurista MCP",
				version: this.opcoes.versaoServidor,
			},
			instructions: this.instrucoes(),
		};
	}

	private instrucoes(): string {
		const escrita = this.opcoes.escritaPermitida();
		return [
			"Este servidor dá acesso a um cofre do Obsidian. Os caminhos são relativos à raiz do cofre e usam barra normal (/).",
			"Para localizar conteúdo, prefira buscar_notas; para ler uma nota inteira, use ler_nota com o caminho devolvido pela busca.",
			escrita
				? "A escrita está habilitada: criar_nota, anexar_a_nota, substituir_nota, editar_frontmatter, mover_nota e excluir_nota alteram o cofre do usuário. Confirme antes de alterações amplas."
				: "O servidor está em modo somente leitura; nenhuma ferramenta altera o cofre.",
		].join(" ");
	}

	private async chamarFerramenta(params: Record<string, unknown>): Promise<ResultadoFerramenta> {
		const nome = typeof params.name === "string" ? params.name : "";
		const ferramenta = this.ferramentasVisiveis().find((f) => f.name === nome);
		if (!ferramenta) {
			throw new ErroParametros(`Ferramenta desconhecida ou indisponível: ${nome || "(sem nome)"}`);
		}
		const argumentos = ehObjeto(params.arguments) ? params.arguments : {};
		const contexto = this.opcoes.contexto();
		const inicio = Date.now();
		try {
			const resultado = await ferramenta.executar(argumentos, contexto);
			contexto.registro.info(`${nome} concluída em ${Date.now() - inicio} ms.`);
			return this.limitarTamanho(resultado, contexto.configuracoes.limiteCaracteres);
		} catch (erro) {
			const mensagem = erro instanceof Error ? erro.message : String(erro);
			if (erro instanceof ErroFerramenta) {
				contexto.registro.aviso(`${nome}: ${mensagem}`);
			} else {
				contexto.registro.erro(`${nome} falhou: ${mensagem}`);
			}
			return { content: [{ type: "text", text: mensagem }], isError: true };
		}
	}

	private limitarTamanho(resultado: ResultadoFerramenta, limite: number): ResultadoFerramenta {
		if (!Number.isFinite(limite) || limite <= 0) return resultado;
		let restante = limite;
		const content = resultado.content.map((bloco) => {
			if (bloco.type !== "text") return bloco;
			if (bloco.text.length <= restante) {
				restante -= bloco.text.length;
				return bloco;
			}
			const texto = bloco.text.slice(0, Math.max(0, restante));
			restante = 0;
			return {
				type: "text" as const,
				text: `${texto}\n\n[Texto truncado pelo limite de ${limite.toLocaleString("pt-BR")} caracteres configurado no Projurista MCP.]`,
			};
		});
		return { ...resultado, content };
	}
}

export class ErroParametros extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroParametros";
	}
}
