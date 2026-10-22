import { TFile, getAllTags, prepareSimpleSearch } from "obsidian";
import { Ferramenta, ErroFerramenta } from "../tipos";
import { argNumero, argTexto, formatarData, listarArquivosDaPasta, localizarPasta, textoJson } from "./comum";

interface Trecho {
	linha: number;
	texto: string;
}

function trechos(conteudo: string, correspondencias: Array<[number, number]>, contexto: number, maximo: number): Trecho[] {
	const resultado: Trecho[] = [];
	const usados = new Set<number>();
	for (const [inicio, fim] of correspondencias) {
		if (resultado.length >= maximo) break;
		const de = Math.max(0, inicio - contexto);
		const ate = Math.min(conteudo.length, fim + contexto);
		const linha = conteudo.slice(0, inicio).split("\n").length;
		if (usados.has(linha)) continue;
		usados.add(linha);
		let trecho = conteudo.slice(de, ate).replace(/\s+/g, " ").trim();
		if (de > 0) trecho = "…" + trecho;
		if (ate < conteudo.length) trecho = trecho + "…";
		resultado.push({ linha, texto: trecho });
	}
	return resultado;
}

type Buscador = (texto: string) => { score: number; matches: Array<[number, number]> } | null;

/**
 * Termo entre aspas: frase exata, sem diferenciar maiúsculas (os índices são
 * preservados porque só se aplica toLowerCase). Caso contrário, a busca simples
 * do Obsidian, em que todas as palavras precisam aparecer.
 */
function prepararBuscador(termo: string): Buscador {
	const frase = /^["“”'‘’](.+)["“”'‘’]$/.exec(termo)?.[1]?.trim();
	if (frase) {
		const alvo = frase.toLowerCase();
		return (texto) => {
			const base = texto.toLowerCase();
			const matches: Array<[number, number]> = [];
			let posicao = base.indexOf(alvo);
			while (posicao >= 0 && matches.length < 50) {
				matches.push([posicao, posicao + alvo.length]);
				posicao = base.indexOf(alvo, posicao + alvo.length);
			}
			return matches.length > 0 ? { score: matches.length, matches } : null;
		};
	}
	const simples = prepareSimpleSearch(termo);
	return (texto) => {
		const r = simples(texto);
		return r ? { score: r.score, matches: r.matches } : null;
	};
}

export const buscarNotas: Ferramenta = {
	name: "buscar_notas",
	description:
		"Pesquisa texto nas notas do cofre (todas as palavras precisam aparecer, sem diferenciar maiúsculas ou acentos quando possível) e devolve as notas mais relevantes com trechos. Use antes de ler_nota.",
	inputSchema: {
		type: "object",
		properties: {
			termo: { type: "string", description: "Palavras a procurar. Use aspas para frase exata, por exemplo \"dano moral\"." },
			pasta: { type: "string", description: "Restringir a busca a uma pasta (opcional)." },
			limite: { type: "integer", description: "Máximo de notas (padrão 20).", default: 20 },
			contexto: { type: "integer", description: "Caracteres de contexto ao redor de cada ocorrência (padrão 120).", default: 120 },
		},
		required: ["termo"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const termo = argTexto(args, "termo").trim();
		if (termo.length < 2) throw new ErroFerramenta("Informe ao menos dois caracteres para buscar.");
		const limite = argNumero(args, "limite", 20, 1, 200);
		const janela = argNumero(args, "contexto", 120, 20, 1000);
		const pasta = localizarPasta(argTexto(args, "pasta", false), contexto);
		const buscador = prepararBuscador(termo);
		const arquivos = listarArquivosDaPasta(pasta, true, contexto).filter((a) => a.extension === "md");

		const encontrados: Array<{ arquivo: TFile; pontuacao: number; trechos: Trecho[] }> = [];
		for (const arquivo of arquivos) {
			const conteudo = await contexto.app.vault.cachedRead(arquivo);
			const resultado = buscador(conteudo);
			const noCaminho = buscador(arquivo.path);
			if (!resultado && !noCaminho) continue;
			const pontuacao = (resultado?.score ?? -100) + (noCaminho ? 5 : 0);
			encontrados.push({
				arquivo,
				pontuacao,
				trechos: resultado ? trechos(conteudo, resultado.matches, janela, 3) : [],
			});
		}
		encontrados.sort((a, b) => b.pontuacao - a.pontuacao);
		const itens = encontrados.slice(0, limite).map((e) => ({
			caminho: e.arquivo.path,
			modificadaEm: formatarData(e.arquivo.stat.mtime),
			trechos: e.trechos,
		}));
		return textoJson({ termo, total: encontrados.length, exibidos: itens.length, notas: itens });
	},
};

export const buscarPorTag: Ferramenta = {
	name: "buscar_por_tag",
	description: "Lista as notas que têm uma tag (no frontmatter ou no corpo). Aceita a tag com ou sem \"#\"; tags aninhadas como \"#direito/civil\" também incluem subtags.",
	inputSchema: {
		type: "object",
		properties: {
			tag: { type: "string", description: "Tag a procurar, por exemplo \"#processo\" ou \"processo\"." },
			limite: { type: "integer", description: "Máximo de notas (padrão 100).", default: 100 },
		},
		required: ["tag"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const bruta = argTexto(args, "tag").trim();
		const tag = (bruta.startsWith("#") ? bruta : "#" + bruta).toLowerCase();
		const limite = argNumero(args, "limite", 100, 1, 2000);
		const pasta = localizarPasta("", contexto);
		const arquivos = listarArquivosDaPasta(pasta, true, contexto).filter((a) => a.extension === "md");
		const itens: Array<{ caminho: string; tags: string[] }> = [];
		for (const arquivo of arquivos) {
			const cache = contexto.app.metadataCache.getFileCache(arquivo);
			if (!cache) continue;
			const tags = (getAllTags(cache) ?? []).map((t) => t.toLowerCase());
			if (tags.some((t) => t === tag || t.startsWith(tag + "/"))) {
				itens.push({ caminho: arquivo.path, tags: Array.from(new Set(tags)) });
				if (itens.length >= limite) break;
			}
		}
		return textoJson({ tag, total: itens.length, notas: itens });
	},
};

export const listarTags: Ferramenta = {
	name: "listar_tags",
	description: "Lista todas as tags usadas no cofre com a quantidade de notas em cada uma.",
	inputSchema: {
		type: "object",
		properties: {
			limite: { type: "integer", description: "Máximo de tags (padrão 200).", default: 200 },
		},
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const limite = argNumero(args, "limite", 200, 1, 5000);
		const pasta = localizarPasta("", contexto);
		const arquivos = listarArquivosDaPasta(pasta, true, contexto).filter((a) => a.extension === "md");
		const contagem = new Map<string, number>();
		for (const arquivo of arquivos) {
			const cache = contexto.app.metadataCache.getFileCache(arquivo);
			if (!cache) continue;
			for (const tag of new Set(getAllTags(cache) ?? [])) {
				contagem.set(tag, (contagem.get(tag) ?? 0) + 1);
			}
		}
		const itens = Array.from(contagem.entries())
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
			.slice(0, limite)
			.map(([tag, notas]) => ({ tag, notas }));
		return textoJson({ total: contagem.size, tags: itens });
	},
};

export const FERRAMENTAS_BUSCA: Ferramenta[] = [buscarNotas, buscarPorTag, listarTags];
