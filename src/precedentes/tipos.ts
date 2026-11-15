export type TribunalPrecedente = "STJ" | "STF";

/** STJ: TEMA (repetitivo), IAC, RELEVANCIA, SIRDR, CONTROVERSIA. STF: RG (tema de repercussão geral). */
export type TipoPrecedente = "TEMA" | "IAC" | "RELEVANCIA" | "SIRDR" | "CONTROVERSIA" | "RG";

/**
 * Classe derivada da situação informada pelo tribunal. Só "transitado" é tese firme.
 *  - tese_sem_transito: acórdão publicado, mérito julgado, RE pendente, sobrestado
 *  - afetado: afetado, admitido, em julgamento, mérito pendente (em regra sem tese)
 *  - revisado: a tese do registro é a redação revista (STJ)
 *  - rg_negada: o STF negou a repercussão geral; o enunciado não é tese de mérito
 *  - outro: controvérsias vinculadas, SIRDR e situações sem tese
 */
export type SituacaoPrecedente = "transitado" | "tese_sem_transito" | "afetado" | "revisado" | "rg_negada" | "cancelado" | "outro";

export interface AlertaPrecedente {
	codigo: string;
	detalhe?: string;
}

export interface RegistroPrecedente {
	/** Identificador estável: STJ:TEMA:1150, STJ:IAC:5, STF:RG:1234. */
	id: string;
	tribunal: TribunalPrecedente;
	tipo: TipoPrecedente;
	numero: number;
	situacao: SituacaoPrecedente;
	/** Situação como escrita pelo tribunal ("Trânsito em Julgado", "RG reconhecida - mérito julgado; processo paradigma: …"). */
	situacao_original: string;
	data_situacao: string;
	orgao_julgador: string;
	primeiro_relator: string;
	relator_atual: string;
	/** STF: título do tema, literal. */
	titulo?: string;
	/** Questão submetida a julgamento (STJ) ou descrição do tema (STF), literal. */
	questao: string;
	/** Tese firmada, literal como publicada pelo tribunal. Vazia quando não há tese. */
	tese: string;
	sha256_tese: string;
	/** Aviso que o STJ põe no lugar da tese enquanto ela não é publicada ("*Aguardando a publicação…"). */
	observacao_tese?: string;
	/** Anotações do STJ (NUGEPNAC), literais. */
	anotacoes: string;
	paradigmas: string[];
	suspensao: string;
	numeros_unicos?: string[];
	registros?: string[];
	/** STF. */
	link_processo?: string;
	ramo_direito?: string;
	assunto?: string;
	decisao_julgamento?: string;
	decisao_admissibilidade?: string;
	/** Derivados por regra; nunca redigidos. */
	alertas: AlertaPrecedente[];
}

export interface CoberturaPrecedentes {
	de: number;
	ate: number;
	total: number;
	com_tese: number;
	situacao: Record<string, number>;
}

export interface BasePrecedentesBruta {
	versao_base: string;
	gerado_em: string;
	aviso: string;
	fonte: { orgao: string; url: string; data_fonte: string; arquivo: string; sha256_arquivo: string };
	cobertura: Record<string, CoberturaPrecedentes>;
	precedentes: RegistroPrecedente[];
}
