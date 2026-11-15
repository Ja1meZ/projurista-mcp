export type TipoPrecedente = "TEMA" | "IAC" | "RELEVANCIA" | "SIRDR" | "CONTROVERSIA";

/**
 * Classe derivada da situação do STJ. Só "transitado" é tese firme.
 *  - tese_sem_transito: acórdão publicado, mérito julgado, RE pendente, sobrestado
 *  - afetado: afetado, admitido, em julgamento (em regra sem tese)
 *  - revisado: a tese do registro é a redação revista
 *  - outro: controvérsias vinculadas, SIRDR e situações sem tese
 */
export type SituacaoPrecedente = "transitado" | "tese_sem_transito" | "afetado" | "revisado" | "cancelado" | "outro";

export interface AlertaPrecedente {
	codigo: string;
	detalhe?: string;
}

export interface RegistroPrecedente {
	/** Identificador estável: STJ:TEMA:1150, STJ:IAC:5, STJ:CONTROVERSIA:484. */
	id: string;
	tipo: TipoPrecedente;
	numero: number;
	situacao: SituacaoPrecedente;
	/** Situação como escrita pelo STJ ("Trânsito em Julgado", "Acórdão Publicado - RE Pendente"…). */
	situacao_original: string;
	data_situacao: string;
	orgao_julgador: string;
	primeiro_relator: string;
	relator_atual: string;
	/** Questão submetida a julgamento, literal. */
	questao: string;
	/** Tese firmada, literal como publicada pelo STJ. Vazia quando não há tese. */
	tese: string;
	sha256_tese: string;
	/** Aviso que o STJ põe no lugar da tese enquanto ela não é publicada ("*Aguardando a publicação…"). */
	observacao_tese?: string;
	/** Anotações do STJ (NUGEPNAC), literais. */
	anotacoes: string;
	paradigmas: string[];
	suspensao: string;
	numeros_unicos: string[];
	registros: string[];
	/** Derivados por regra a partir das anotações e da tese; nunca redigidos. */
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
