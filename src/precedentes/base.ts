import { createHash } from "crypto";
import dadosStf from "../../dados/precedentes-stf.json";
import dadosStj from "../../dados/precedentes-stj.json";
import { chaveForma } from "../sumulas/normalizar";
import type { BasePrecedentesBruta, CoberturaPrecedentes, RegistroPrecedente, TipoPrecedente, TribunalPrecedente } from "./tipos";

export interface FontePrecedentes {
	versao: string;
	dataFonte: string;
	urlFonte: string;
}

export interface BasePrecedentes {
	/** Versões das bases reunidas, ex.: "STJ 2026.11.14 · STF 2026.11.15". */
	versao: string;
	fontes: Partial<Record<TribunalPrecedente, FontePrecedentes>>;
	/** Cobertura por tipo de precedente (TEMA, IAC… do STJ; RG do STF). */
	cobertura: Record<string, CoberturaPrecedentes>;
	todos: RegistroPrecedente[];
	/** Registros descartados na carga porque o hash da tese não fechou. */
	adulterados: string[];
	/** O tribunal sai do tipo: RG é do STF; os demais, do STJ. */
	obter(tipo: TipoPrecedente, numero: number): RegistroPrecedente | undefined;
	/** "Tema N" em um tribunal. No STJ, tema repetitivo ou tema de relevância (a numeração é a mesma). */
	obterTema(numero: number, tribunal?: TribunalPrecedente): RegistroPrecedente | undefined;
	/** Precedentes que têm como paradigma o processo com este número (só os dígitos). */
	porParadigma(digitos: string, tribunal?: TribunalPrecedente): RegistroPrecedente[];
	porChaveForma(chave: string): RegistroPrecedente[];
}

function sha256(texto: string): string {
	return createHash("sha256").update(texto, "utf8").digest("hex");
}

export function tribunalDoTipo(tipo: TipoPrecedente): TribunalPrecedente {
	return tipo === "RG" ? "STF" : "STJ";
}

export function digitosDoParadigma(paradigma: string): string {
	return paradigma.replace(/\/.*$/, "").replace(/\D/g, "");
}

/** Classe processual de uma citação ("RE", "ARE", "AI" são do STF; "REsp", "EREsp"… do STJ). */
export function tribunalDaClasse(classe: string): TribunalPrecedente | undefined {
	const c = classe.trim().toLowerCase();
	if (!c) return undefined;
	if (c === "re" || c === "are" || c === "ai" || c.startsWith("recurso extraordin")) return "STF";
	return "STJ";
}

export function montarBase(...brutas: BasePrecedentesBruta[]): BasePrecedentes {
	const porId = new Map<string, RegistroPrecedente>();
	const porProcesso = new Map<string, RegistroPrecedente[]>();
	const porForma = new Map<string, RegistroPrecedente[]>();
	const adulterados: string[] = [];
	const todos: RegistroPrecedente[] = [];
	const fontes: BasePrecedentes["fontes"] = {};
	const cobertura: Record<string, CoberturaPrecedentes> = {};
	const incluir = (mapa: Map<string, RegistroPrecedente[]>, chave: string, registro: RegistroPrecedente) => {
		const lista = mapa.get(chave);
		if (lista) lista.push(registro);
		else mapa.set(chave, [registro]);
	};
	for (const bruta of brutas) {
		Object.assign(cobertura, bruta.cobertura);
		for (const lido of bruta.precedentes) {
			// bases geradas antes do campo "tribunal" são do STJ
			const registro = lido.tribunal ? lido : { ...lido, tribunal: tribunalDoTipo(lido.tipo) };
			if (registro.tese ? sha256(registro.tese) !== registro.sha256_tese : registro.sha256_tese !== "") {
				adulterados.push(registro.id);
				continue;
			}
			fontes[registro.tribunal] ??= { versao: bruta.versao_base, dataFonte: bruta.fonte.data_fonte, urlFonte: bruta.fonte.url };
			porId.set(registro.id, registro);
			todos.push(registro);
			for (const p of registro.paradigmas) {
				const d = digitosDoParadigma(p);
				if (d) incluir(porProcesso, `${registro.tribunal}:${d}`, registro);
			}
			if (registro.tese) incluir(porForma, chaveForma(registro.tese), registro);
		}
	}
	const obter = (tipo: TipoPrecedente, numero: number) => porId.get(`${tribunalDoTipo(tipo)}:${tipo}:${numero}`);
	return {
		versao: (Object.entries(fontes) as [TribunalPrecedente, FontePrecedentes][]).map(([t, f]) => `${t} ${f.versao}`).join(" · "),
		fontes,
		cobertura,
		todos,
		adulterados,
		obter,
		obterTema: (numero, tribunal = "STJ") => (tribunal === "STF" ? obter("RG", numero) : obter("TEMA", numero) ?? obter("RELEVANCIA", numero)),
		porParadigma: (digitos, tribunal) =>
			tribunal ? porProcesso.get(`${tribunal}:${digitos}`) ?? [] : [...(porProcesso.get(`STJ:${digitos}`) ?? []), ...(porProcesso.get(`STF:${digitos}`) ?? [])],
		porChaveForma: (chave) => porForma.get(chave) ?? [],
	};
}

let instancia: BasePrecedentes | null = null;

/** Bases embutidas (STJ e STF), carregadas e conferidas no primeiro uso. */
export function basePrecedentes(): BasePrecedentes {
	if (!instancia) instancia = montarBase(dadosStj as unknown as BasePrecedentesBruta, dadosStf as unknown as BasePrecedentesBruta);
	return instancia;
}

function milhar(numero: number): string {
	return String(numero).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "Tema Repetitivo n. 1.150 do STJ", "IAC n. 5 do STJ", "Tema n. 1.234 da Repercussão Geral do STF". */
export function nomePrecedente(r: Pick<RegistroPrecedente, "tipo" | "numero">): string {
	const n = milhar(r.numero);
	switch (r.tipo) {
		case "RG":
			return `Tema n. ${n} da Repercussão Geral do STF`;
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

export function dataBr(iso: string): string {
	return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso;
}

export function resumoCobertura(base: BasePrecedentes): string {
	const nomes: Record<string, string> = { TEMA: "temas repetitivos", IAC: "IAC", RELEVANCIA: "temas de relevância", SIRDR: "SIRDR", CONTROVERSIA: "controvérsias", RG: "temas de repercussão geral" };
	const partes: string[] = [];
	for (const tribunal of ["STJ", "STF"] as TribunalPrecedente[]) {
		const fonte = base.fontes[tribunal];
		if (!fonte) continue;
		const doTribunal = base.todos.filter((r) => r.tribunal === tribunal);
		const tipos = Object.entries(base.cobertura)
			.filter(([tipo]) => tribunalDoTipo(tipo as TipoPrecedente) === tribunal)
			.map(([tipo, c]) => `${c.total} ${nomes[tipo] ?? tipo}`);
		const firmes = doTribunal.filter((r) => r.situacao === "transitado" && r.tese).length;
		partes.push(`${tribunal}: ${tipos.join(", ")}; ${firmes} teses transitadas em julgado; fonte de ${dataBr(fonte.dataFonte)}`);
	}
	return partes.join(" · ");
}
