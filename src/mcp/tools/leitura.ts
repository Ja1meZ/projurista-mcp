import { TFile, TFolder } from "obsidian";
import { Ferramenta, ErroFerramenta } from "../tipos";
import { descricaoEstadoSmart, estadoSmartConnections } from "./semantica";
import {
	argBooleano,
	argNumero,
	argTexto,
	ehTextoLegivel,
	estaExcluido,
	formatarData,
	listarArquivosDaPasta,
	localizarNota,
	localizarPasta,
	metadadosDaNota,
	texto,
	textoJson,
} from "./comum";

export const infoDoCofre: Ferramenta = {
	name: "info_do_cofre",
	description:
		"Informa o nome do cofre do Obsidian, a quantidade de notas e de pastas, se a escrita está habilitada e quais pastas estão ocultas. Use primeiro para se orientar.",
	inputSchema: { type: "object", properties: {}, additionalProperties: false },
	async executar(_args, contexto) {
		const { app, configuracoes } = contexto;
		const todos = app.vault.getFiles().filter((f) => !estaExcluido(f.path, contexto));
		const markdown = todos.filter((f) => f.extension === "md");
		let pastas = 0;
		const contar = (pasta: TFolder) => {
			for (const filho of pasta.children) {
				if (filho instanceof TFolder && !estaExcluido(filho.path, contexto)) {
					pastas += 1;
					contar(filho);
				}
			}
		};
		contar(app.vault.getRoot());
		return textoJson({
			nomeDoCofre: app.vault.getName(),
			notasMarkdown: markdown.length,
			arquivosNoTotal: todos.length,
			pastas,
			escritaHabilitada: configuracoes.permitirEscrita,
			buscaSemantica: descricaoEstadoSmart(estadoSmartConnections()),
			pastasOcultas: [app.vault.configDir, ".trash", ...configuracoes.pastasExcluidas],
			notaAtiva: app.workspace.getActiveFile()?.path ?? null,
		});
	},
};

export const listarPastas: Ferramenta = {
	name: "listar_pastas",
	description:
		"Mostra a árvore de pastas do cofre (ou de uma pasta específica), com a quantidade de notas em cada uma. Útil para entender como o cofre está organizado.",
	inputSchema: {
		type: "object",
		properties: {
			pasta: { type: "string", description: "Pasta de partida. Vazio ou \"/\" para a raiz do cofre." },
			profundidade: { type: "integer", description: "Níveis a percorrer (padrão 4).", default: 4 },
		},
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const pasta = localizarPasta(argTexto(args, "pasta", false), contexto);
		const profundidade = argNumero(args, "profundidade", 4, 1, 20);
		const linhas: string[] = [];
		const visitar = (atual: TFolder, nivel: number) => {
			const notas = atual.children.filter((c) => c instanceof TFile && !estaExcluido(c.path, contexto)).length;
			const nome = atual.isRoot() ? "/" : `${atual.name}/`;
			linhas.push(`${"  ".repeat(nivel)}${nome} (${notas} ${notas === 1 ? "arquivo" : "arquivos"})`);
			if (nivel >= profundidade) return;
			const subpastas = atual.children
				.filter((c): c is TFolder => c instanceof TFolder && !estaExcluido(c.path, contexto))
				.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
			for (const sub of subpastas) visitar(sub, nivel + 1);
		};
		visitar(pasta, 0);
		return texto(linhas.join("\n"));
	},
};

export const listarNotas: Ferramenta = {
	name: "listar_notas",
	description:
		"Lista os arquivos de uma pasta do cofre com caminho, tamanho e data de modificação. Por padrão percorre subpastas e devolve só notas Markdown.",
	inputSchema: {
		type: "object",
		properties: {
			pasta: { type: "string", description: "Pasta a listar. Vazio para a raiz do cofre." },
			recursivo: { type: "boolean", description: "Incluir subpastas (padrão verdadeiro).", default: true },
			apenas_markdown: { type: "boolean", description: "Somente notas .md (padrão verdadeiro).", default: true },
			ordenar_por: { type: "string", enum: ["nome", "modificacao"], description: "Ordenação: nome ou modificacao (mais recentes primeiro).", default: "nome" },
			limite: { type: "integer", description: "Máximo de itens (padrão 200).", default: 200 },
		},
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const pasta = localizarPasta(argTexto(args, "pasta", false), contexto);
		const recursivo = argBooleano(args, "recursivo", true);
		const apenasMarkdown = argBooleano(args, "apenas_markdown", true);
		const ordenar = argTexto(args, "ordenar_por", false) || "nome";
		const limite = argNumero(args, "limite", 200, 1, 5000);
		let arquivos = listarArquivosDaPasta(pasta, recursivo, contexto);
		if (apenasMarkdown) arquivos = arquivos.filter((a) => a.extension === "md");
		if (ordenar === "modificacao") arquivos.sort((a, b) => b.stat.mtime - a.stat.mtime);
		else arquivos.sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
		const total = arquivos.length;
		const itens = arquivos.slice(0, limite).map((a) => ({
			caminho: a.path,
			tamanho: a.stat.size,
			modificadaEm: formatarData(a.stat.mtime),
		}));
		return textoJson({ pasta: pasta.isRoot() ? "/" : pasta.path, total, exibidos: itens.length, itens });
	},
};

export const lerNota: Ferramenta = {
	name: "ler_nota",
	description:
		"Lê o conteúdo integral de uma nota pelo caminho (com ou sem .md). Devolve também frontmatter, tags, cabeçalhos e links quando pedido.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota relativo ao cofre, por exemplo \"Processos/0001234.md\"." },
			incluir_metadados: { type: "boolean", description: "Incluir frontmatter, tags, cabeçalhos e links (padrão verdadeiro).", default: true },
		},
		required: ["caminho"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const incluir = argBooleano(args, "incluir_metadados", true);
		if (!ehTextoLegivel(arquivo)) {
			throw new ErroFerramenta(`O arquivo "${arquivo.path}" não é texto (.${arquivo.extension}); só notas e arquivos de texto podem ser lidos.`);
		}
		const conteudo = await contexto.app.vault.cachedRead(arquivo);
		const meta = metadadosDaNota(arquivo, contexto.app, incluir);
		const cabecalho = incluir ? `${JSON.stringify(meta, null, 2)}\n\n---\n\n` : `Caminho: ${arquivo.path}\n\n---\n\n`;
		return texto(cabecalho + conteudo);
	},
};

export const lerVariasNotas: Ferramenta = {
	name: "ler_varias_notas",
	description: "Lê até 20 notas de uma vez. Devolve o conteúdo de cada uma, separado por cabeçalhos com o caminho.",
	inputSchema: {
		type: "object",
		properties: {
			caminhos: { type: "array", items: { type: "string" }, description: "Lista de caminhos de notas (máximo 20)." },
		},
		required: ["caminhos"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const caminhos = args.caminhos;
		if (!Array.isArray(caminhos) || caminhos.length === 0) throw new ErroFerramenta("Informe a lista \"caminhos\" com ao menos um item.");
		if (caminhos.length > 20) throw new ErroFerramenta("No máximo 20 notas por chamada.");
		const partes: string[] = [];
		for (const item of caminhos) {
			if (typeof item !== "string") continue;
			try {
				const arquivo = localizarNota(item, contexto);
				if (!ehTextoLegivel(arquivo)) {
					partes.push(`=== ${arquivo.path} ===\n[arquivo binário; não lido]`);
					continue;
				}
				const conteudo = await contexto.app.vault.cachedRead(arquivo);
				partes.push(`=== ${arquivo.path} ===\n${conteudo}`);
			} catch (erro) {
				partes.push(`=== ${item} ===\n[erro: ${erro instanceof Error ? erro.message : String(erro)}]`);
			}
		}
		return texto(partes.join("\n\n"));
	},
};

export const notasRecentes: Ferramenta = {
	name: "notas_recentes",
	description: "Lista as notas modificadas mais recentemente no cofre, da mais nova para a mais antiga.",
	inputSchema: {
		type: "object",
		properties: {
			limite: { type: "integer", description: "Quantidade de notas (padrão 20).", default: 20 },
			pasta: { type: "string", description: "Restringir a uma pasta (opcional)." },
		},
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const limite = argNumero(args, "limite", 20, 1, 500);
		const pasta = localizarPasta(argTexto(args, "pasta", false), contexto);
		const arquivos = listarArquivosDaPasta(pasta, true, contexto)
			.filter((a) => a.extension === "md")
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, limite)
			.map((a) => ({ caminho: a.path, modificadaEm: formatarData(a.stat.mtime), tamanho: a.stat.size }));
		return textoJson(arquivos);
	},
};

export const notaAtiva: Ferramenta = {
	name: "nota_ativa",
	description: "Devolve o conteúdo da nota aberta no momento no Obsidian, com seus metadados. Útil quando o usuário diz \"esta nota\" ou \"a nota aberta\".",
	inputSchema: { type: "object", properties: {}, additionalProperties: false },
	async executar(_args, contexto) {
		const arquivo = contexto.app.workspace.getActiveFile();
		if (!arquivo) throw new ErroFerramenta("Não há nota aberta no Obsidian neste momento.");
		if (estaExcluido(arquivo.path, contexto)) throw new ErroFerramenta("A nota ativa está em uma pasta excluída pelas configurações.");
		if (!ehTextoLegivel(arquivo)) throw new ErroFerramenta(`O arquivo ativo (${arquivo.path}) não é texto.`);
		const conteudo = await contexto.app.vault.cachedRead(arquivo);
		const meta = metadadosDaNota(arquivo, contexto.app, true);
		return texto(`${JSON.stringify(meta, null, 2)}\n\n---\n\n${conteudo}`);
	},
};

export const linksDaNota: Ferramenta = {
	name: "links_da_nota",
	description: "Mostra os links de saída de uma nota (resolvidos e não resolvidos) e as notas que apontam para ela (backlinks).",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota." },
		},
		required: ["caminho"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const { metadataCache } = contexto.app;
		const saida = Object.keys(metadataCache.resolvedLinks[arquivo.path] ?? {}).filter((c) => !estaExcluido(c, contexto));
		const naoResolvidos = Object.keys(metadataCache.unresolvedLinks[arquivo.path] ?? {});
		const backlinks: string[] = [];
		for (const [origem, destinos] of Object.entries(metadataCache.resolvedLinks)) {
			if (origem !== arquivo.path && destinos[arquivo.path] && !estaExcluido(origem, contexto)) backlinks.push(origem);
		}
		return textoJson({ nota: arquivo.path, linksDeSaida: saida, linksNaoResolvidos: naoResolvidos, backlinks });
	},
};

export const abrirNota: Ferramenta = {
	name: "abrir_nota",
	description: "Abre uma nota na janela do Obsidian para o usuário ver. Não altera o conteúdo.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota a abrir." },
		},
		required: ["caminho"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		await contexto.app.workspace.getLeaf(false).openFile(arquivo);
		return texto(`Nota aberta no Obsidian: ${arquivo.path}`);
	},
};

export const FERRAMENTAS_LEITURA: Ferramenta[] = [
	infoDoCofre,
	listarPastas,
	listarNotas,
	lerNota,
	lerVariasNotas,
	notasRecentes,
	notaAtiva,
	linksDaNota,
	abrirNota,
];
