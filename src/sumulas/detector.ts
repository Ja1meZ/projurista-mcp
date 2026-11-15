import type { TipoSumula, Tribunal } from "./tipos";

export interface Transcricao {
	texto: string;
	/** true quando o trecho veio entre aspas; false quando só segue a referência após dois-pontos ou travessão. */
	comAspas: boolean;
}

export interface Deteccao {
	referencias: Referencia[];
	/** Menções a súmulas de tribunais que a base não cobre (TST, TCE, TFR etc.). */
	foraDoEscopo: { linha: number; mencao: string }[];
}

export interface Referencia {
	/** null quando o texto não diz de qual tribunal é a súmula. */
	tribunal: Tribunal | null;
	/** true quando o texto diz "deste Tribunal", "desta Corte". */
	tribunalLocal: boolean;
	tipo: TipoSumula;
	numero: number;
	inicio: number;
	fim: number;
	linha: number;
	mencao: string;
	transcricao?: Transcricao;
}

const NUM = "(?:n[.ºo°]{0,2}s?\\s*)?\\d{1,3}(?!\\d)";
const LISTA = `${NUM}(?:\\s*(?:,|e|\\/)\\s*${NUM})*`;
const TRIB =
	"(?:STF|STJ|TJ[-\\/ ]?PE|Supremo Tribunal Federal|Superior Tribunal de Justi[çc]a|Tribunal de Justi[çc]a (?:do Estado )?de Pernambuco|Pret[óo]rio Excelso|Excelso Pret[óo]rio|Suprema Corte)";

const RE_CABECA = new RegExp(
	[
		// "enunciado n. 7 da Súmula do STJ", "verbete sumular 7"
		`\\b(?:enunciados?|verbetes?)(?:\\s+sumular(?:es)?)?\\s+(?:de\\s+)?(?<l1>${LISTA})\\s+d[ae]s?\\s+s[úu]mulas?(?<v1>\\s+vinculantes?)?`,
		// "Súmula 7", "Súmula n. 7", "Súmulas 7 e 83", "Súmula Vinculante 10", "Súmula STJ 7", "Súmula do STJ n. 7"
		`\\bs[úu]mulas?(?<v2>\\s+vinculantes?)?(?:(?:\\s*\\/\\s*|\\s+(?:d[oa]\\s+)?)(?<t2>${TRIB}))?\\s*(?<l2>${LISTA})`,
		// "SV 10"
		`\\bSV\\s*(?<l3>${LISTA})`,
	].join("|"),
	"giu",
);

const RE_SUFIXO_TRIB = new RegExp(
	`^\\s*(?:[,\\/\\-–]\\s*|\\(\\s*)?(?:(?:d[oae]|pel[oa]|n[oa])\\s+)?(?:(?:e\\.|eg\\.|egr[ée]gio|colendo|c\\.|excelso)\\s+)?(${TRIB})(?![\\p{L}\\d])`,
	"iu",
);
/** Tribunais e órgãos cujas súmulas a base não cobre: a referência é só relacionada, não conferida. */
const OUTRO =
	"(?:extint[oa]\\s+)?(?:TCE(?:[-\\/ ]?[A-Z]{2})?|TCU|TST|TSE|STM|TFR|TNU|TRU|CARF|CNJ|AGU|TRF\\d?|TRT\\d*|TRE(?:[-\\/ ]?[A-Z]{2})?|TJ[-\\/ ]?(?!PE)[A-Z]{2}|Tribunal de Contas|Tribunal Federal de Recursos|Tribunal Superior|Tribunal Regional|Turma Nacional|Turma Estadual|Turma de Uniformiza[çc][ãa]o|Turma Recursal|Conselho|Advocacia|Tribunal de Justi[çc]a d[oea]s? (?!Pernambuco|Estado de Pernambuco))";
const RE_SUFIXO_OUTRO = new RegExp(`^\\s*(?:[,\\/\\-–]\\s*|\\(\\s*)?(?:(?:d[oae]|pel[oa]|n[oa])\\s+)?(?:(?:e\\.|eg\\.|egr[ée]gio|colendo|c\\.)\\s+)?(${OUTRO})`, "u");
const RE_PREFIXO_TRIB = new RegExp(`(?<![\\p{L}\\d])(${TRIB})\\s*[,:–-]\\s*$`, "iu");
const RE_PREFIXO_OUTRO = new RegExp(`(?<![\\p{L}\\d])(${OUTRO})\\s*[,:–-]\\s*$`, "u");
/** "Súmulas 7 do STJ e 279 e 280 do STF": a lista continua com outro tribunal. */
const RE_CONTINUACAO = new RegExp(`^\\s*(?:,|;|e)\\s*(?:(?:a|as|da|das|na|nas)\\s+)?(?:de\\s+)?(?:s[úu]mulas?\\s+)?(${LISTA})(?=\\s*(?:[,\\/\\-–]\\s*)?(?:(?:d[oae]|pel[oa]|n[oa])\\s+)?${TRIB})`, "iu");
const RE_SUFIXO_LOCAL = /^\s*,?\s*(?:dest[ea]|d[oa] noss[oa])\s+(?:(?:e\.|eg\.|egr[ée]gi[oa]|colend[oa])\s+)?(?:Tribunal|Corte|Sodal[íi]cio|TJ)(?![\p{L}\d])/iu;

const ABRE = "“\"«";
const FECHA: Record<string, string> = { "“": "”", '"': '"', "«": "»" };
const LIMITE_TRANSCRICAO = 2500;

function paraTribunal(texto: string): Tribunal {
	const t = texto.toLowerCase();
	if (/stf|suprem|pret[óo]rio/.test(t)) return "STF";
	if (/stj|superior/.test(t)) return "STJ";
	return "TJPE";
}

function transcricaoDepois(texto: string, de: number, limite: number): Transcricao | undefined {
	const janela = texto.slice(de, Math.min(limite, de + 140));
	const abre = janela.search(/[“"«]/u);
	if (abre >= 0) {
		const vao = janela.slice(0, abre);
		if (!/[.;!?]\s/.test(vao)) {
			const inicio = de + abre;
			const fecha = FECHA[texto[inicio]];
			const fim = texto.indexOf(fecha, inicio + 1);
			if (fim > inicio && fim - inicio <= LIMITE_TRANSCRICAO) {
				return { texto: texto.slice(inicio + 1, fim), comAspas: true };
			}
		}
	}
	const semAspas = /^\s*[:–—-]\s*/u.exec(janela);
	if (semAspas) {
		const inicio = de + semAspas[0].length;
		if (!ABRE.includes(texto[inicio] ?? "")) {
			let fim = texto.indexOf("\n", inicio);
			if (fim < 0) fim = texto.length;
			fim = Math.min(fim, limite, inicio + LIMITE_TRANSCRICAO);
			const trecho = texto.slice(inicio, fim).trim();
			if (trecho.split(/\s+/).length >= 4) return { texto: trecho, comAspas: false };
		}
	}
	return undefined;
}

function transcricaoAntes(texto: string, ate: number, piso: number): Transcricao | undefined {
	const cauda = /([”"»])[\s,.;]*[([–—-]?\s*$/u.exec(texto.slice(Math.max(piso, ate - 14), ate));
	if (!cauda) return undefined;
	const fim = Math.max(piso, ate - 14) + cauda.index;
	const abre = cauda[1] === "”" ? "“" : cauda[1] === "»" ? "«" : '"';
	const inicio = texto.lastIndexOf(abre, fim - 1);
	if (inicio < piso || fim - inicio > LIMITE_TRANSCRICAO) return undefined;
	return { texto: texto.slice(inicio + 1, fim), comAspas: true };
}

/** Localiza, por expressões regulares, as referências a súmulas do STF, do STJ e do TJPE. */
export function detectarReferencias(texto: string): Referencia[] {
	return detectar(texto).referencias;
}

export function detectar(texto: string): Deteccao {
	const cabecas: { inicio: number; fim: number; numeros: number[]; vinculante: boolean; tribunal: Tribunal | null; local: boolean }[] = [];
	const foraDoEscopo: Deteccao["foraDoEscopo"] = [];
	const linhaDe = (posicao: number) => texto.slice(0, posicao).split("\n").length;
	RE_CABECA.lastIndex = 0;
	for (let m = RE_CABECA.exec(texto); m; m = RE_CABECA.exec(texto)) {
		const g = m.groups ?? {};
		const lista = g.l1 ?? g.l2 ?? g.l3 ?? "";
		const numeros = (lista.match(/\d{1,3}/g) ?? []).map(Number);
		if (numeros.length === 0) continue;
		const vinculante = Boolean(g.v1 || g.v2 || g.l3 !== undefined);
		let fim = m.index + m[0].length;
		let tribunal: Tribunal | null = g.t2 ? paraTribunal(g.t2) : null;
		let local = false;
		const resto = texto.slice(fim, fim + 90);
		const antes = texto.slice(Math.max(0, m.index - 60), m.index);
		const sufixo = RE_SUFIXO_TRIB.exec(resto);
		if (!vinculante && !tribunal && !sufixo) {
			const outro = RE_SUFIXO_OUTRO.exec(resto);
			if (outro || RE_PREFIXO_OUTRO.test(antes)) {
				foraDoEscopo.push({ linha: linhaDe(m.index), mencao: texto.slice(m.index, fim + (outro ? outro[0].length : 0)).replace(/\s+/g, " ") });
				continue;
			}
		}
		if (sufixo) {
			if (!tribunal) tribunal = paraTribunal(sufixo[1]);
			fim += sufixo[0].length;
		} else {
			const sufixoLocal = RE_SUFIXO_LOCAL.exec(resto);
			if (sufixoLocal) {
				local = true;
				fim += sufixoLocal[0].length;
			}
		}
		if (!tribunal && !local) {
			const prefixo = RE_PREFIXO_TRIB.exec(antes);
			if (prefixo) tribunal = paraTribunal(prefixo[1]);
		}
		if (vinculante) tribunal = "STF";
		cabecas.push({ inicio: m.index, fim, numeros, vinculante, tribunal, local });
		// lista que prossegue com outro tribunal: "... do STJ e 279 e 280 do STF"
		while (sufixo && !vinculante) {
			const continuacao = RE_CONTINUACAO.exec(texto.slice(fim, fim + 120));
			if (!continuacao) break;
			const inicioC = fim + continuacao[0].length - continuacao[1].length;
			let fimC = fim + continuacao[0].length;
			const sufixoC = RE_SUFIXO_TRIB.exec(texto.slice(fimC, fimC + 90));
			if (!sufixoC) break;
			fimC += sufixoC[0].length;
			cabecas.push({ inicio: inicioC, fim: fimC, numeros: (continuacao[1].match(/\d{1,3}/g) ?? []).map(Number), vinculante: false, tribunal: paraTribunal(sufixoC[1]), local: false });
			fim = fimC;
		}
		RE_CABECA.lastIndex = Math.max(RE_CABECA.lastIndex, fim);
	}

	const referencias: Referencia[] = [];
	cabecas.forEach((c, i) => {
		const proxima = cabecas[i + 1]?.inicio ?? texto.length;
		const anterior = i > 0 ? cabecas[i - 1].fim : 0;
		let transcricao: Transcricao | undefined;
		if (c.numeros.length === 1) {
			transcricao = transcricaoDepois(texto, c.fim, proxima) ?? transcricaoAntes(texto, c.inicio, anterior);
		}
		const linha = linhaDe(c.inicio);
		for (const numero of c.numeros) {
			referencias.push({
				tribunal: c.tribunal,
				tribunalLocal: c.local,
				tipo: c.vinculante ? "vinculante" : "comum",
				numero,
				inicio: c.inicio,
				fim: c.fim,
				linha,
				mencao: texto.slice(c.inicio, c.fim).replace(/\s+/g, " "),
				transcricao,
			});
		}
	});
	return { referencias, foraDoEscopo };
}
