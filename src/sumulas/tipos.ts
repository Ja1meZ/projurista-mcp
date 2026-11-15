export type Tribunal = "STF" | "STJ" | "TJPE";
export type TipoSumula = "comum" | "vinculante";

export interface VarianteOficial {
	fonte: string;
	texto: string;
}

export interface RegistroSumula {
	/** Identificador estável: STJ:SUM:7, STF:SV:10, TJPE:SUM:130. */
	id: string;
	tribunal: Tribunal;
	tipo: TipoSumula;
	numero: number;
	/** Enunciado literal, como publicado pela fonte oficial. */
	enunciado: string;
	/** vigente, cancelada, revogada, superada, alterada, pendente-de-publicacao. */
	situacao: string;
	observacao?: string;
	data_aprovacao?: string;
	referencia_publicacao?: string;
	orgao_julgador?: string;
	referencia_oficial?: string;
	url_fonte?: string;
	data_fonte?: string;
	consenso?: string;
	sha256_texto: string;
	/** Redações do mesmo enunciado em outra publicação oficial, quando divergem em palavras. */
	variantes?: VarianteOficial[];
}

export interface CoberturaConjunto {
	de: number;
	ate: number;
	total: number;
	lacunas: number[];
	situacao: Record<string, number>;
	data_fonte: string;
	url_fonte: string;
}

export interface BaseSumulas {
	versao_base: string;
	gerado_em: string;
	aviso: string;
	cobertura: Record<string, CoberturaConjunto>;
	sumulas: RegistroSumula[];
}
