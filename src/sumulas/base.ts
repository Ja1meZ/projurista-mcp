import { createHash } from "crypto";
import dados from "../../dados/sumulas.json";
import type { BaseSumulas, CoberturaConjunto, RegistroSumula, TipoSumula, Tribunal } from "./tipos";
import { chaveForma } from "./normalizar";

export interface Base {
	versao: string;
	geradoEm: string;
	aviso: string;
	cobertura: Record<string, CoberturaConjunto>;
	todas: RegistroSumula[];
	/** Registros descartados na carga porque o hash do enunciado não fechou. */
	adulterados: string[];
	obter(tribunal: Tribunal, tipo: TipoSumula, numero: number): RegistroSumula | undefined;
	/** Súmulas cujo enunciado tem exatamente estas palavras (qualquer tribunal). */
	porChaveForma(chave: string): RegistroSumula[];
}

export function rotuloConjunto(tribunal: Tribunal, tipo: TipoSumula): string {
	return `${tribunal}:${tipo === "vinculante" ? "SV" : "SUM"}`;
}

function sha256(texto: string): string {
	return createHash("sha256").update(texto.trim(), "utf8").digest("hex");
}

export function montarBase(bruta: BaseSumulas): Base {
	const porId = new Map<string, RegistroSumula>();
	const porForma = new Map<string, RegistroSumula[]>();
	const adulterados: string[] = [];
	const todas: RegistroSumula[] = [];
	for (const registro of bruta.sumulas) {
		if (sha256(registro.enunciado) !== registro.sha256_texto) {
			adulterados.push(registro.id);
			continue;
		}
		porId.set(registro.id, registro);
		todas.push(registro);
		const chave = chaveForma(registro.enunciado);
		const lista = porForma.get(chave);
		if (lista) lista.push(registro);
		else porForma.set(chave, [registro]);
	}
	return {
		versao: bruta.versao_base,
		geradoEm: bruta.gerado_em,
		aviso: bruta.aviso,
		cobertura: bruta.cobertura,
		todas,
		adulterados,
		obter: (tribunal, tipo, numero) => porId.get(`${rotuloConjunto(tribunal, tipo)}:${numero}`),
		porChaveForma: (chave) => porForma.get(chave) ?? [],
	};
}

let instancia: Base | null = null;

/** Base embutida, carregada e conferida no primeiro uso. */
export function baseSumulas(): Base {
	if (!instancia) instancia = montarBase(dados);
	return instancia;
}

/** "Súmula n. 7 do STJ", "Súmula Vinculante n. 10", "Súmula n. 130 do TJPE". */
export function nomeSumula(tribunal: Tribunal, tipo: TipoSumula, numero: number): string {
	return tipo === "vinculante" ? `Súmula Vinculante n. ${numero}` : `Súmula n. ${numero} do ${tribunal}`;
}

export function resumoCobertura(base: Base): string {
	const nomes: Record<string, string> = { "STF:SV": "Súmulas Vinculantes", "STF:SUM": "Súmulas do STF", "STJ:SUM": "Súmulas do STJ", "TJPE:SUM": "Súmulas do TJPE" };
	return Object.entries(base.cobertura)
		.map(([conjunto, c]) => `${nomes[conjunto] ?? conjunto} ${c.de} a ${c.ate}`)
		.join("; ");
}
