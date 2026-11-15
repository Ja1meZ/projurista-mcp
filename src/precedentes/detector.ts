import { Transcricao, transcricaoAntes, transcricaoDepois } from "../sumulas/detector";

/** STJ: conferido na base. STF e OUTRO: fora do escopo. null: o texto não diz o tribunal. */
export type TribunalDoTema = "STJ" | "STF" | "OUTRO" | null;

export interface ReferenciaPrecedente {
	tipo: "TEMA" | "IAC";
	numero: number;
	tribunal: TribunalDoTema;
	inicio: number;
	fim: number;
	linha: number;
	mencao: string;
	transcricao?: Transcricao;
}

export interface ProcessoCitado {
	linha: number;
	mencao: string;
	/** Só os dígitos do número do processo. */
	digitos: string;
}

export interface DeteccaoPrecedentes {
	referencias: ReferenciaPrecedente[];
	/** Processos citados pela classe e número ("REsp 1.895.936/TO"), para cruzar com os paradigmas. */
	processos: ProcessoCitado[];
}

const NUM = "(?:n[.ºo°]{0,2}s?\\s*)?(?:\\d{1,2}\\.\\d{3}|\\d{1,4})(?![\\d])";
const LISTA = `${NUM}(?:\\s*(?:,|e|\\/)\\s*${NUM})*`;
const SIGLA = "STJ|STF|TST|TSE|STM|TNU|TRU|TCU|CARF|TRF\\d?|TRT\\d*|TJ[-\\/ ]?[A-Z]{2}";
const TRIB =
	`(?:${SIGLA}|Superior Tribunal de Justi[çc]a|Supremo Tribunal Federal|Suprema Corte|Pret[óo]rio Excelso|Excelso Pret[óo]rio|repercuss[ãa]o geral|recursos? (?:especia(?:l|is) )?repetitivos?|(?:sistem[áa]tica|rito|regime) d[oe]s? (?:recursos? )?repetitivos?|Tribunal Superior do Trabalho|Turma Nacional|Tribunal de Justi[çc]a|Tribunal Regional)`;
const SUFIXO = `\\s*(?:[,\\/\\-–]\\s*|\\(\\s*)?(?:(?:d[oae]s?|pel[oa]s?|n[oa]s?|em)\\s+)?(?:(?:e\\.|eg\\.|egr[ée]gio|colendo|c\\.|excelso)\\s+)?(${TRIB})(?![\\p{L}\\d])`;

const RE_CABECA = new RegExp(
	[
		// "Tema 1.150", "Tema n. 1150", "Temas 1.150 e 1.387", "Tema Repetitivo 1150", "Tema STJ 1150", "Tema de Repercussão Geral 6"
		`\\btemas?(?<q>\\s+(?:repetitivos?|de\\s+repercuss[ãa]o\\s+geral|(?:de\\s+)?RG|de\\s+relev[âa]ncia))?(?:(?:\\s*\\/\\s*|\\s+(?:d[oa]\\s+)?)(?<t>${SIGLA})(?![\\p{L}\\d]))?\\s*(?<l>${LISTA})`,
		// "IAC 5", "IAC n. 5", "Incidente de Assunção de Competência n. 5"
		`\\b(?:IAC|incidente\\s+de\\s+assun[çc][ãa]o\\s+de\\s+compet[êe]ncia)\\s*(?<li>${LISTA})`,
	].join("|"),
	"giu",
);
const RE_SUFIXO = new RegExp(`^${SUFIXO}`, "iu");
const RE_PREFIXO = new RegExp(`(?<![\\p{L}\\d])(${SIGLA})\\s*[,:–-]\\s*$`, "iu");
/** "Temas 6 e 1.234 do STF e 106 do STJ": a lista continua com outro tribunal. */
const RE_CONTINUACAO = new RegExp(`^\\s*(?:,|;|e)\\s*(?:(?:o|os|do|dos|no|nos|ao|aos)\\s+)?(?:temas?\\s+)?(${LISTA})(?=${SUFIXO})`, "iu");
const RE_PROCESSO = /\b(REsp|EREsp|AREsp|RMS|Pet|CC|PUIL|Rcl|Recurso Especial)\s*(?:n[.ºo°]{0,2}\s*)?(\d[\d.]{4,}\d)(?:\s*[\/-]\s*[A-Z]{2})?/gu;

const LIMITE_TRANSCRICAO = 6000;

function paraTribunal(texto: string): TribunalDoTema {
	const t = texto.toLowerCase();
	if (/^stj$|superior tribunal de justi|repetitiv/.test(t)) return "STJ";
	if (/^stf$|suprem|pret[óo]rio|repercuss/.test(t)) return "STF";
	return "OUTRO";
}

function numeros(lista: string): number[] {
	return (lista.match(/\d{1,2}\.\d{3}|\d{1,4}/g) ?? []).map((n) => Number(n.replace(".", "")));
}

/** Localiza, por expressões regulares, as referências a temas e IAC e os processos citados. */
export function detectarPrecedentes(texto: string): DeteccaoPrecedentes {
	const cabecas: { inicio: number; fim: number; numeros: number[]; tipo: "TEMA" | "IAC"; tribunal: TribunalDoTema }[] = [];
	const linhaDe = (posicao: number) => texto.slice(0, posicao).split("\n").length;
	RE_CABECA.lastIndex = 0;
	for (let m = RE_CABECA.exec(texto); m; m = RE_CABECA.exec(texto)) {
		const g = m.groups ?? {};
		const tipo = g.li !== undefined ? "IAC" : "TEMA";
		const lista = numeros(g.l ?? g.li ?? "");
		if (lista.length === 0) continue;
		let fim = m.index + m[0].length;
		let tribunal: TribunalDoTema = g.t ? paraTribunal(g.t) : null;
		if (!tribunal && g.q) tribunal = /repercuss|RG/i.test(g.q) ? "STF" : "STJ";
		const sufixo = RE_SUFIXO.exec(texto.slice(fim, fim + 110));
		if (sufixo) {
			if (!tribunal) tribunal = paraTribunal(sufixo[1]);
			fim += sufixo[0].length;
		} else if (!tribunal) {
			const prefixo = RE_PREFIXO.exec(texto.slice(Math.max(0, m.index - 40), m.index));
			if (prefixo) tribunal = paraTribunal(prefixo[1]);
		}
		cabecas.push({ inicio: m.index, fim, numeros: lista, tipo, tribunal });
		while (sufixo && tipo === "TEMA") {
			const continuacao = RE_CONTINUACAO.exec(texto.slice(fim, fim + 140));
			if (!continuacao) break;
			const inicioC = fim + continuacao[0].length - continuacao[1].length;
			let fimC = fim + continuacao[0].length;
			const sufixoC = RE_SUFIXO.exec(texto.slice(fimC, fimC + 110));
			if (!sufixoC) break;
			fimC += sufixoC[0].length;
			cabecas.push({ inicio: inicioC, fim: fimC, numeros: numeros(continuacao[1]), tipo, tribunal: paraTribunal(sufixoC[1]) });
			fim = fimC;
		}
		RE_CABECA.lastIndex = Math.max(RE_CABECA.lastIndex, fim);
	}

	const referencias: ReferenciaPrecedente[] = [];
	cabecas.forEach((c, i) => {
		const proxima = cabecas[i + 1]?.inicio ?? texto.length;
		const anterior = i > 0 ? cabecas[i - 1].fim : 0;
		let transcricao: Transcricao | undefined;
		if (c.numeros.length === 1) {
			transcricao = transcricaoDepois(texto, c.fim, proxima, LIMITE_TRANSCRICAO) ?? transcricaoAntes(texto, c.inicio, anterior, LIMITE_TRANSCRICAO);
		}
		const linha = linhaDe(c.inicio);
		for (const numero of c.numeros) {
			referencias.push({ tipo: c.tipo, numero, tribunal: c.tribunal, inicio: c.inicio, fim: c.fim, linha, mencao: texto.slice(c.inicio, c.fim).replace(/\s+/g, " "), transcricao });
		}
	});

	const processos: ProcessoCitado[] = [];
	RE_PROCESSO.lastIndex = 0;
	for (let m = RE_PROCESSO.exec(texto); m; m = RE_PROCESSO.exec(texto)) {
		const digitos = m[2].replace(/\D/g, "");
		if (digitos.length >= 5) processos.push({ linha: linhaDe(m.index), mencao: m[0].replace(/\s+/g, " "), digitos });
	}
	return { referencias, processos };
}
