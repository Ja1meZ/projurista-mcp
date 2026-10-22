import { App, CachedMetadata, TFile, TFolder, getAllTags, normalizePath } from "obsidian";
import { pastasSempreExcluidas } from "../../configuracoes";
import { ContextoFerramenta, ErroFerramenta, ResultadoFerramenta } from "../tipos";

export function texto(conteudo: string): ResultadoFerramenta {
	return { content: [{ type: "text", text: conteudo }] };
}

export function textoJson(valor: unknown): ResultadoFerramenta {
	return texto(JSON.stringify(valor, null, 2));
}

export function argTexto(args: Record<string, unknown>, nome: string, obrigatorio = true): string {
	const valor = args[nome];
	if (valor === undefined || valor === null || valor === "") {
		if (obrigatorio) throw new ErroFerramenta(`O parâmetro "${nome}" é obrigatório.`);
		return "";
	}
	if (typeof valor !== "string") throw new ErroFerramenta(`O parâmetro "${nome}" deve ser texto.`);
	return valor;
}

export function argNumero(args: Record<string, unknown>, nome: string, padrao: number, minimo = 1, maximo = 10_000): number {
	const valor = args[nome];
	if (valor === undefined || valor === null) return padrao;
	const numero = typeof valor === "number" ? valor : Number(valor);
	if (!Number.isFinite(numero)) throw new ErroFerramenta(`O parâmetro "${nome}" deve ser numérico.`);
	return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}

export function argBooleano(args: Record<string, unknown>, nome: string, padrao: boolean): boolean {
	const valor = args[nome];
	if (valor === undefined || valor === null) return padrao;
	if (typeof valor === "boolean") return valor;
	if (valor === "true" || valor === "sim") return true;
	if (valor === "false" || valor === "não" || valor === "nao") return false;
	throw new ErroFerramenta(`O parâmetro "${nome}" deve ser verdadeiro ou falso.`);
}

/** Normaliza um caminho relativo ao cofre, sem barras iniciais nem segmentos "..". */
export function normalizarCaminho(caminho: string): string {
	const limpo = normalizePath(caminho.trim().replace(/\\/g, "/"));
	if (limpo.split("/").some((parte) => parte === "..")) {
		throw new ErroFerramenta("Caminhos com \"..\" não são permitidos.");
	}
	return limpo;
}

export function prefixosExcluidos(contexto: ContextoFerramenta): string[] {
	const lista = [...pastasSempreExcluidas(contexto.app.vault.configDir), ...contexto.configuracoes.pastasExcluidas];
	return lista
		.map((p) => p.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
		.filter((p) => p.length > 0);
}

export function estaExcluido(caminho: string, contexto: ContextoFerramenta): boolean {
	for (const prefixo of prefixosExcluidos(contexto)) {
		if (caminho === prefixo || caminho.startsWith(prefixo + "/")) return true;
	}
	return false;
}

export function garantirNaoExcluido(caminho: string, contexto: ContextoFerramenta): void {
	if (estaExcluido(caminho, contexto)) {
		throw new ErroFerramenta(`O caminho "${caminho}" está em uma pasta excluída pelas configurações do Projurista MCP.`);
	}
}

/**
 * Localiza uma nota pelo caminho. Aceita caminho sem extensão, e, se não houver
 * correspondência exata, tenta resolver pelo nome como se fosse um wikilink.
 */
export function localizarNota(caminhoBruto: string, contexto: ContextoFerramenta): TFile {
	const { app } = contexto;
	const caminho = normalizarCaminho(caminhoBruto);
	const candidatos = [caminho, caminho + ".md"];
	for (const candidato of candidatos) {
		const arquivo = app.vault.getFileByPath(candidato);
		if (arquivo) {
			garantirNaoExcluido(arquivo.path, contexto);
			return arquivo;
		}
	}
	const porLink = app.metadataCache.getFirstLinkpathDest(caminho.replace(/\.md$/i, ""), "");
	if (porLink) {
		garantirNaoExcluido(porLink.path, contexto);
		return porLink;
	}
	throw new ErroFerramenta(`Nota não encontrada: "${caminhoBruto}". Use listar_notas ou buscar_notas para obter o caminho exato.`);
}

export function localizarPasta(caminhoBruto: string, contexto: ContextoFerramenta): TFolder {
	const { app } = contexto;
	const caminho = caminhoBruto.trim() === "" || caminhoBruto.trim() === "/" ? "/" : normalizarCaminho(caminhoBruto);
	if (caminho === "/" || caminho === "") return app.vault.getRoot();
	const pasta = app.vault.getFolderByPath(caminho);
	if (!pasta) throw new ErroFerramenta(`Pasta não encontrada: "${caminhoBruto}".`);
	garantirNaoExcluido(pasta.path, contexto);
	return pasta;
}

export function listarArquivosDaPasta(pasta: TFolder, recursivo: boolean, contexto: ContextoFerramenta): TFile[] {
	const resultado: TFile[] = [];
	const visitar = (atual: TFolder) => {
		for (const filho of atual.children) {
			if (estaExcluido(filho.path, contexto)) continue;
			if (filho instanceof TFile) resultado.push(filho);
			else if (recursivo && filho instanceof TFolder) visitar(filho);
		}
	};
	visitar(pasta);
	return resultado;
}

export function formatarData(ms: number): string {
	return new Date(ms).toISOString();
}

export interface MetadadosNota {
	caminho: string;
	nome: string;
	tamanho: number;
	modificadaEm: string;
	criadaEm: string;
	frontmatter?: Record<string, unknown>;
	tags?: string[];
	linksDeSaida?: string[];
	cabecalhos?: string[];
}

export function metadadosDaNota(arquivo: TFile, app: App, completo: boolean): MetadadosNota {
	const base: MetadadosNota = {
		caminho: arquivo.path,
		nome: arquivo.basename,
		tamanho: arquivo.stat.size,
		modificadaEm: formatarData(arquivo.stat.mtime),
		criadaEm: formatarData(arquivo.stat.ctime),
	};
	if (!completo) return base;
	const cache: CachedMetadata | null = app.metadataCache.getFileCache(arquivo);
	if (!cache) return base;
	if (cache.frontmatter) {
		const { position: _posicao, ...resto } = cache.frontmatter as Record<string, unknown>;
		base.frontmatter = resto;
	}
	const tags = getAllTags(cache);
	if (tags && tags.length > 0) base.tags = Array.from(new Set(tags));
	const links = (cache.links ?? []).map((l) => l.link);
	if (links.length > 0) base.linksDeSaida = Array.from(new Set(links));
	const cabecalhos = (cache.headings ?? []).map((h) => `${"#".repeat(h.level)} ${h.heading}`);
	if (cabecalhos.length > 0) base.cabecalhos = cabecalhos;
	return base;
}

export function ehMarkdown(arquivo: TFile): boolean {
	return arquivo.extension.toLowerCase() === "md";
}

export function ehTextoLegivel(arquivo: TFile): boolean {
	return ["md", "txt", "csv", "json", "canvas", "yaml", "yml", "html", "xml"].includes(arquivo.extension.toLowerCase());
}
