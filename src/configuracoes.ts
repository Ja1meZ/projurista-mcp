export interface ConfiguracoesProjurista {
	/** Porta do transporte TCP (ponte stdio do Claude Desktop). */
	portaTcp: number;
	/** Porta do transporte Streamable HTTP (Claude Code, Cursor e outros). */
	portaHttp: number;
	/** Liga ou desliga o transporte HTTP. */
	httpAtivo: boolean;
	/** Token compartilhado exigido em todos os transportes. */
	token: string;
	/** Habilita as ferramentas que criam, alteram, movem ou excluem notas. */
	permitirEscrita: boolean;
	/** Sobe o servidor assim que o Obsidian termina de carregar. */
	iniciarComObsidian: boolean;
	/** Pastas invisíveis a todas as ferramentas (prefixos de caminho). */
	pastasExcluidas: string[];
	/** Nome do servidor como aparece no Claude. Vazio: derivado do nome do cofre. */
	nomeServidor: string;
	/** Tamanho máximo, em caracteres, do texto devolvido por uma ferramenta. */
	limiteCaracteres: number;
}

export const CONFIGURACOES_PADRAO: ConfiguracoesProjurista = {
	portaTcp: 27180,
	portaHttp: 27181,
	httpAtivo: true,
	token: "",
	permitirEscrita: false,
	iniciarComObsidian: true,
	pastasExcluidas: [],
	nomeServidor: "",
	limiteCaracteres: 200_000,
};

/** Pastas sempre invisíveis: a pasta de configuração do Obsidian (que o usuário pode renomear) e a lixeira. */
export function pastasSempreExcluidas(configDir: string): string[] {
	return [configDir, ".trash"];
}

/** Converte o nome do cofre em um identificador seguro para o Claude Desktop. */
export function gerarSlug(nome: string): string {
	const semAcentos = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");
	const slug = semAcentos
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "cofre";
}

export function nomeServidorEfetivo(configuracoes: ConfiguracoesProjurista, nomeCofre: string): string {
	const personalizado = configuracoes.nomeServidor.trim();
	if (personalizado) return gerarSlug(personalizado);
	return `obsidian-${gerarSlug(nomeCofre)}`;
}
