import { createHash } from "crypto";
import dados from "../../dados/precedentes-stj.json";
import { chaveForma } from "../sumulas/normalizar";
import type { BasePrecedentesBruta, CoberturaPrecedentes, RegistroPrecedente, TipoPrecedente } from "./tipos";

export interface BasePrecedentes {
	versao: string;
	geradoEm: string;
	dataFonte: string;
	urlFonte: string;
	cobertura: Record<string, CoberturaPrecedentes>;
	todos: RegistroPrecedente[];
	/** Registros descartados na carga porque o hash da tese não fechou. */
	adulterados: string[];
	obter(tipo: TipoPrecedente, numero: number): RegistroPrecedente | undefined;
	/** "Tema 1270" pode ser tema repetitivo ou tema de relevância: a numeração é a mesma. */
	obterTema(numero: number): RegistroPrecedente | undefined;
	/** Precedentes que têm como paradigma o processo com este número (só os dígitos). */
	porParadigma(digitos: string): RegistroPrecedente[];
	porChaveForma(chave: string): RegistroPrecedente[];
}

function sha256(texto: string): string {
	return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function digitosDoParadigma(paradigma: string): string {
	return paradigma.replace(/\/.*$/, "").replace(/\D/g, "");
}

export function montarBase(bruta: BasePrecedentesBruta): BasePrecedentes {
	const porId = new Map<string, RegistroPrecedente>();
	const porProcesso = new Map<string, RegistroPrecedente[]>();
	const porForma = new Map<string, RegistroPrecedente[]>();
	const adulterados: string[] = [];
	const todos: RegistroPrecedente[] = [];
	const incluir = (mapa: Map<string, RegistroPrecedente[]>, chave: string, registro: RegistroPrecedente) => {
		const lista = mapa.get(chave);
		if (lista) lista.push(registro);
		else mapa.set(chave, [registro]);
	};
	for (const registro of bruta.precedentes) {
		if (registro.tese ? sha256(registro.tese) !== registro.sha256_tese : registro.sha256_tese !== "") {
			adulterados.push(registro.id);
			continue;
		}
		porId.set(registro.id, registro);
		todos.push(registro);
		for (const p of registro.paradigmas) {
			const d = digitosDoParadigma(p);
			if (d) incluir(porProcesso, d, registro);
		}
		if (registro.tese) incluir(porForma, chaveForma(registro.tese), registro);
	}
	const obter = (tipo: TipoPrecedente, numero: number) => porId.get(`STJ:${tipo}:${numero}`);
	return {
		versao: bruta.versao_base,
		geradoEm: bruta.gerado_em,
		dataFonte: bruta.fonte.data_fonte,
		urlFonte: bruta.fonte.url,
		cobertura: bruta.cobertura,
		todos,
		adulterados,
		obter,
		obterTema: (numero) => obter("TEMA", numero) ?? obter("RELEVANCIA", numero),
		porParadigma: (digitos) => porProcesso.get(digitos) ?? [],
		porChaveForma: (chave) => porForma.get(chave) ?? [],
	};
}

let instancia: BasePrecedentes | null = null;

/** Base embutida, carregada e conferida no primeiro uso. */
export function basePrecedentes(): BasePrecedentes {
	if (!instancia) instancia = montarBase(dados as unknown as BasePrecedentesBruta);
	return instancia;
}

function milhar(numero: number): string {
	return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "Tema Repetitivo n. 1.150 do STJ", "IAC n. 5 do STJ". */
export function nomePrecedente(r: Pick<RegistroPrecedente, "tipo" | "numero">): string {
	const n = milhar(r.numero);
	switch (r.tipo) {
		case "TEMA":
			return `Tema Repetitivo n. ${n} do STJ`;
		case "IAC":
			return `IAC n. ${n} do STJ`;
		case "RELEVANCIA":
			return `Tema de Relevância n. ${n} do STJ`;
		case "SIRDR":
			return `SIRDR n. ${n} do STJ`;
		default:
			return `Controvérsia n. ${n} do STJ`;
	}
}

export function resumoCobertura(base: BasePrecedentes): string {
	const nomes: Record<string, string> = { TEMA: "temas repetitivos", IAC: "IAC", RELEVANCIA: "temas de relevância", SIRDR: "SIRDR", CONTROVERSIA: "controvérsias" };
	const transitados = base.todos.filter((r) => r.situacao === "transitado").length;
	const partes = Object.entries(base.cobertura).map(([tipo, c]) => `${c.total} ${nomes[tipo] ?? tipo}`);
	return `${partes.join(", ")}; ${transitados} teses transitadas em julgado; fonte: STJ, ${base.dataFonte.split("-").reverse().join("/")}`;
}
