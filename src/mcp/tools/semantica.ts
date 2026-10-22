import { Ferramenta, ErroFerramenta, ContextoFerramenta } from "../tipos";
import { argBooleano, argNumero, argTexto, estaExcluido, normalizarCaminho, textoJson } from "./comum";
import { PASTAS_SEMPRE_EXCLUIDAS } from "../../configuracoes";

/**
 * Integração opcional com o plugin Smart Connections (embeddings locais).
 * O Smart Connections publica seu ambiente em window.smart_env. Usamos duas vias:
 *  1. a via nova, por ações (lookup_lists → lookup_list_get_results);
 *  2. a via clássica, collection.lookup({ hypotheticals, filter }), a mesma usada
 *     pelo obsidian-mcp-tools, mantida pelo Smart Connections por compatibilidade.
 * Nada é enviado para fora da máquina: os vetores são calculados e consultados localmente.
 */

interface ItemSmart {
	key: string;
	path?: string;
	source?: { path?: string };
	read?: () => Promise<string>;
}

interface ResultadoSmart {
	item: ItemSmart;
	score: number;
}

interface ColecaoSmart {
	embed_model?: unknown;
	lookup?: (params: { hypotheticals: string[]; filter?: Record<string, unknown> }) => Promise<ResultadoSmart[] | { error: string }>;
}

interface ListaLookup {
	actions?: { lookup_list_get_results?: (params: Record<string, unknown>) => Promise<ResultadoSmart[]> };
}

interface AmbienteSmart {
	state?: string;
	smart_sources?: ColecaoSmart;
	smart_blocks?: ColecaoSmart;
	lookup_lists?: { new_lookup_list?: (params: Record<string, unknown>) => ListaLookup };
}

export type EstadoSmartConnections = "ausente" | "carregando" | "sem-modelo" | "pronto";

export function ambienteSmart(): AmbienteSmart | null {
	const env = (window as unknown as { smart_env?: AmbienteSmart }).smart_env;
	return env && typeof env === "object" ? env : null;
}

export function estadoSmartConnections(): EstadoSmartConnections {
	const env = ambienteSmart();
	if (!env || !env.smart_sources) return "ausente";
	if (env.state && env.state !== "loaded") return "carregando";
	if (!env.smart_sources.embed_model) return "sem-modelo";
	return "pronto";
}

export function descricaoEstadoSmart(estado: EstadoSmartConnections): string {
	switch (estado) {
		case "pronto":
			return "Smart Connections detectado: busca semântica disponível.";
		case "carregando":
			return "Smart Connections ainda carregando; a busca semântica aparece quando ele terminar.";
		case "sem-modelo":
			return "Smart Connections instalado, mas sem modelo de embeddings ativo. Configure-o nas opções do Smart Connections.";
		default:
			return "Busca semântica indisponível: instale e ative o plugin Smart Connections para habilitá-la.";
	}
}

type Colecao = "smart_sources" | "smart_blocks";

async function consultar(env: AmbienteSmart, consulta: string, colecao: Colecao, limite: number, filtro: Record<string, unknown>): Promise<ResultadoSmart[]> {
	const erros: string[] = [];

	// Via nova (ações). Qualquer falha cai na via clássica.
	try {
		const novaLista = env.lookup_lists?.new_lookup_list;
		if (typeof novaLista === "function" && env[colecao]) {
			const lista = novaLista.call(env.lookup_lists, { query: consulta, results_collection_key: colecao, filter: filtro });
			const acao = lista?.actions?.lookup_list_get_results;
			if (typeof acao === "function") {
				const resultados = await acao.call(lista, { query: consulta, limit: limite, results_collection_key: colecao, filter: filtro });
				if (Array.isArray(resultados)) return resultados;
			}
		}
	} catch (erro) {
		erros.push(`via ações: ${erro instanceof Error ? erro.message : String(erro)}`);
	}

	// Via clássica.
	const alvo = env[colecao];
	if (alvo && typeof alvo.lookup === "function") {
		const resultados = await alvo.lookup({ hypotheticals: [consulta], filter: { ...filtro, limit: limite } });
		if (Array.isArray(resultados)) return resultados;
		if (resultados && typeof resultados === "object" && "error" in resultados) erros.push(`lookup: ${resultados.error}`);
	} else {
		erros.push("a coleção não oferece lookup");
	}
	throw new ErroFerramenta(`O Smart Connections não respondeu à busca semântica (${erros.join("; ")}).`);
}

function caminhoDoItem(item: ItemSmart): string {
	if (item.source?.path) return item.source.path;
	if (item.path) return item.path;
	const indice = item.key.indexOf("#");
	return indice > 0 ? item.key.slice(0, indice) : item.key;
}

function prefixosExcluidos(contexto: ContextoFerramenta): string[] {
	return [...PASTAS_SEMPRE_EXCLUIDAS, ...contexto.configuracoes.pastasExcluidas]
		.map((p) => p.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
		.filter((p) => p.length > 0)
		.map((p) => p + "/");
}

export const buscarSemantica: Ferramenta = {
	name: "buscar_semantica",
	description:
		"Busca por significado (embeddings locais do plugin Smart Connections): encontra notas ou trechos sobre um tema mesmo quando as palavras não coincidem. Use para perguntas conceituais; para termos exatos, prefira buscar_notas.",
	inputSchema: {
		type: "object",
		properties: {
			consulta: { type: "string", description: "Pergunta ou descrição do que se procura, em linguagem natural." },
			nivel: { type: "string", enum: ["notas", "trechos"], description: "notas: resultado por nota inteira (padrão); trechos: blocos/seções mais parecidos.", default: "notas" },
			limite: { type: "integer", description: "Máximo de resultados (padrão 10).", default: 10 },
			pasta: { type: "string", description: "Restringir a uma pasta (opcional)." },
			incluir_conteudo: { type: "boolean", description: "Incluir o texto de cada resultado (padrão: verdadeiro para trechos, falso para notas).", default: false },
		},
		required: ["consulta"],
		additionalProperties: false,
	},
	disponivel: () => estadoSmartConnections() === "pronto",
	async executar(args, contexto) {
		const estado = estadoSmartConnections();
		if (estado !== "pronto") throw new ErroFerramenta(descricaoEstadoSmart(estado));
		const env = ambienteSmart();
		if (!env) throw new ErroFerramenta(descricaoEstadoSmart("ausente"));

		const consulta = argTexto(args, "consulta").trim();
		if (consulta.length < 3) throw new ErroFerramenta("Descreva melhor o que procura (ao menos três caracteres).");
		const nivel = argTexto(args, "nivel", false) || "notas";
		const colecao: Colecao = nivel === "trechos" && env.smart_blocks ? "smart_blocks" : "smart_sources";
		const limite = argNumero(args, "limite", 10, 1, 100);
		const pastaBruta = argTexto(args, "pasta", false);
		const incluirConteudo = argBooleano(args, "incluir_conteudo", colecao === "smart_blocks");

		const filtro: Record<string, unknown> = { exclude_key_starts_with_any: prefixosExcluidos(contexto) };
		if (pastaBruta) {
			const pasta = normalizarCaminho(pastaBruta).replace(/\/+$/, "");
			filtro.key_starts_with = pasta + "/";
		}

		// Pede alguns a mais para compensar os que forem removidos pelo filtro de pastas ocultas.
		const brutos = await consultar(env, consulta, colecao, limite + 10, filtro);
		const resultados: Array<{ caminho: string; chave: string; pontuacao: number; conteudo?: string }> = [];
		const notasVistas = new Set<string>();
		for (const r of brutos) {
			if (!r?.item?.key) continue;
			const caminho = caminhoDoItem(r.item);
			if (estaExcluido(caminho, contexto)) continue;
			// No nível "notas", o Smart Connections pode devolver a nota e seus blocos; fica só a primeira (maior pontuação).
			if (colecao === "smart_sources") {
				if (notasVistas.has(caminho)) continue;
				notasVistas.add(caminho);
			}
			const entrada: { caminho: string; chave: string; pontuacao: number; conteudo?: string } = {
				caminho,
				chave: colecao === "smart_sources" ? caminho : r.item.key,
				pontuacao: Number.isFinite(r.score) ? Math.round(r.score * 1000) / 1000 : 0,
			};
			if (incluirConteudo) {
				try {
					if (typeof r.item.read === "function") entrada.conteudo = (await r.item.read()).slice(0, 2000);
					else {
						const arquivo = contexto.app.vault.getFileByPath(caminho);
						if (arquivo) entrada.conteudo = (await contexto.app.vault.cachedRead(arquivo)).slice(0, 2000);
					}
				} catch {
					// Conteúdo é opcional; segue sem ele.
				}
			}
			resultados.push(entrada);
			if (resultados.length >= limite) break;
		}
		return textoJson({ consulta, nivel: colecao === "smart_blocks" ? "trechos" : "notas", total: resultados.length, resultados });
	},
};

export const FERRAMENTAS_SEMANTICA: Ferramenta[] = [buscarSemantica];
