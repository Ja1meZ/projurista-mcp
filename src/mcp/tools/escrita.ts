import { normalizePath } from "obsidian";
import { Ferramenta, ErroFerramenta } from "../tipos";
import { argBooleano, argTexto, garantirNaoExcluido, localizarNota, normalizarCaminho, texto } from "./comum";

function garantirMarkdown(caminho: string): string {
	return /\.[a-z0-9]+$/i.test(caminho) ? caminho : caminho + ".md";
}

async function garantirPastaPai(caminho: string, contexto: Parameters<Ferramenta["executar"]>[1]): Promise<void> {
	const partes = caminho.split("/");
	partes.pop();
	if (partes.length === 0) return;
	const pasta = normalizePath(partes.join("/"));
	if (!contexto.app.vault.getFolderByPath(pasta)) {
		await contexto.app.vault.createFolder(pasta);
	}
}

export const criarNota: Ferramenta = {
	name: "criar_nota",
	escrita: true,
	description: "Cria uma nota nova no cofre com o conteúdo informado. Cria as pastas intermediárias se não existirem. Não sobrescreve nota existente, salvo se pedido.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nova nota, por exemplo \"Pareceres/Parecer 12.md\"." },
			conteudo: { type: "string", description: "Conteúdo em Markdown." },
			sobrescrever: { type: "boolean", description: "Substituir se já existir (padrão falso).", default: false },
		},
		required: ["caminho", "conteudo"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const caminho = garantirMarkdown(normalizarCaminho(argTexto(args, "caminho")));
		garantirNaoExcluido(caminho, contexto);
		const conteudo = argTexto(args, "conteudo", false);
		const sobrescrever = argBooleano(args, "sobrescrever", false);
		const existente = contexto.app.vault.getFileByPath(caminho);
		if (existente && !sobrescrever) {
			throw new ErroFerramenta(`Já existe uma nota em "${caminho}". Use sobrescrever=true ou escolha outro caminho.`);
		}
		if (existente) {
			await contexto.app.vault.process(existente, () => conteudo);
			return texto(`Nota substituída: ${caminho}`);
		}
		await garantirPastaPai(caminho, contexto);
		await contexto.app.vault.create(caminho, conteudo);
		return texto(`Nota criada: ${caminho}`);
	},
};

export const anexarANota: Ferramenta = {
	name: "anexar_a_nota",
	escrita: true,
	description: "Acrescenta texto ao final de uma nota existente, preservando o que já está escrito.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota." },
			conteudo: { type: "string", description: "Texto a acrescentar ao final." },
		},
		required: ["caminho", "conteudo"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const conteudo = argTexto(args, "conteudo");
		await contexto.app.vault.process(arquivo, (atual) => {
			const separador = atual.length === 0 || atual.endsWith("\n") ? "" : "\n";
			return atual + separador + conteudo;
		});
		return texto(`Texto acrescentado a ${arquivo.path}`);
	},
};

export const substituirNota: Ferramenta = {
	name: "substituir_nota",
	escrita: true,
	description: "Substitui todo o conteúdo de uma nota existente. Para trocar só um trecho, use substituir_trecho.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota." },
			conteudo: { type: "string", description: "Novo conteúdo integral." },
		},
		required: ["caminho", "conteudo"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const conteudo = argTexto(args, "conteudo", false);
		await contexto.app.vault.process(arquivo, () => conteudo);
		return texto(`Conteúdo de ${arquivo.path} substituído.`);
	},
};

export const substituirTrecho: Ferramenta = {
	name: "substituir_trecho",
	escrita: true,
	description: "Troca um trecho exato de uma nota por outro texto. O trecho precisa ocorrer exatamente uma vez, para evitar alterações indevidas.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota." },
			trecho_antigo: { type: "string", description: "Texto exato a ser substituído (deve ocorrer uma única vez)." },
			trecho_novo: { type: "string", description: "Texto que entra no lugar." },
		},
		required: ["caminho", "trecho_antigo", "trecho_novo"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const antigo = argTexto(args, "trecho_antigo");
		const novo = argTexto(args, "trecho_novo", false);
		let ocorrencias = 0;
		await contexto.app.vault.process(arquivo, (atual) => {
			ocorrencias = atual.split(antigo).length - 1;
			if (ocorrencias !== 1) return atual;
			return atual.replace(antigo, () => novo);
		});
		if (ocorrencias === 0) throw new ErroFerramenta("O trecho informado não foi encontrado na nota.");
		if (ocorrencias > 1) throw new ErroFerramenta(`O trecho ocorre ${ocorrencias} vezes; inclua mais contexto para torná-lo único.`);
		return texto(`Trecho substituído em ${arquivo.path}.`);
	},
};

export const editarFrontmatter: Ferramenta = {
	name: "editar_frontmatter",
	escrita: true,
	description: "Define ou remove campos do frontmatter (propriedades) de uma nota sem tocar no corpo do texto.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota." },
			definir: { type: "object", description: "Campos a definir, por exemplo {\"status\": \"revisado\", \"tags\": [\"civil\"]}.", additionalProperties: true },
			remover: { type: "array", items: { type: "string" }, description: "Nomes de campos a remover." },
		},
		required: ["caminho"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const definir = typeof args.definir === "object" && args.definir !== null && !Array.isArray(args.definir) ? (args.definir as Record<string, unknown>) : {};
		const remover = Array.isArray(args.remover) ? args.remover.filter((r): r is string => typeof r === "string") : [];
		if (Object.keys(definir).length === 0 && remover.length === 0) {
			throw new ErroFerramenta("Informe \"definir\" ou \"remover\".");
		}
		await contexto.app.fileManager.processFrontMatter(arquivo, (fm) => {
			for (const [chave, valor] of Object.entries(definir)) fm[chave] = valor;
			for (const chave of remover) delete fm[chave];
		});
		return texto(`Frontmatter de ${arquivo.path} atualizado.`);
	},
};

export const moverNota: Ferramenta = {
	name: "mover_nota",
	escrita: true,
	description: "Move ou renomeia uma nota, atualizando os links que apontam para ela em todo o cofre.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho atual da nota." },
			novo_caminho: { type: "string", description: "Novo caminho, incluindo o nome do arquivo." },
		},
		required: ["caminho", "novo_caminho"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const destino = garantirMarkdown(normalizarCaminho(argTexto(args, "novo_caminho")));
		garantirNaoExcluido(destino, contexto);
		if (contexto.app.vault.getAbstractFileByPath(destino)) {
			throw new ErroFerramenta(`Já existe um arquivo em "${destino}".`);
		}
		await garantirPastaPai(destino, contexto);
		const origem = arquivo.path;
		await contexto.app.fileManager.renameFile(arquivo, destino);
		return texto(`Nota movida de ${origem} para ${destino}.`);
	},
};

export const excluirNota: Ferramenta = {
	name: "excluir_nota",
	escrita: true,
	description: "Envia uma nota para a lixeira (conforme a configuração do Obsidian). Nunca apaga definitivamente.",
	inputSchema: {
		type: "object",
		properties: {
			caminho: { type: "string", description: "Caminho da nota a excluir." },
		},
		required: ["caminho"],
		additionalProperties: false,
	},
	async executar(args, contexto) {
		const arquivo = localizarNota(argTexto(args, "caminho"), contexto);
		const caminho = arquivo.path;
		await contexto.app.fileManager.trashFile(arquivo);
		return texto(`Nota enviada para a lixeira: ${caminho}`);
	},
};

export const FERRAMENTAS_ESCRITA: Ferramenta[] = [
	criarNota,
	anexarANota,
	substituirNota,
	substituirTrecho,
	editarFrontmatter,
	moverNota,
	excluirNota,
];
