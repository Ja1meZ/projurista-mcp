import { Diferenca, chaveForma, comparavel, diferencas, palavras, palavrasVisiveis, semelhanca } from "../sumulas/normalizar";
import type { BasePrecedentes } from "./base";
import { dataBr, nomePrecedente, tribunalDaClasse } from "./base";
import { ReferenciaPrecedente, detectarPrecedentes } from "./detector";
import type { AlertaPrecedente, RegistroPrecedente, TribunalPrecedente } from "./tipos";

export type ResultadoPrecedente =
	| "CONFERE_LITERAL"
	| "CONFERE_TRECHO"
	| "CONFERE_COM_DIFERENCA_DE_FORMA"
	| "DIVERGENTE"
	| "SEM_TRANSCRICAO"
	| "AMBIGUA"
	| "NAO_ENCONTRADO_NA_BASE";

export type VereditoPrecedentes = "INTEGRALMENTE_VERIFICADO" | "VERIFICADO_COM_RESSALVAS" | "NAO_VERIFICADO" | "SEM_REFERENCIAS";

export interface ConferenciaPrecedente {
	linha: number;
	mencao: string;
	resultado: ResultadoPrecedente;
	precedente?: RegistroPrecedente;
	transcricao?: string;
	diferencas?: Diferenca[];
	notas: string[];
	/** Tema cancelado citado sem ressalva: impede o veredito de verificado. */
	alertaSituacao?: string;
	/** Há algo a conferir pelo usuário (sem trânsito, afetado, revisado, superação mencionada). */
	ressalva: boolean;
}

export interface RelatorioPrecedentes {
	veredito: VereditoPrecedentes;
	versaoBase: string;
	conferencias: ConferenciaPrecedente[];
	contagem: Record<string, number>;
	/** Temas de tribunais que a base não cobre: relacionados, não conferidos. */
	foraDoEscopo: { linha: number; mencao: string; tribunal: string }[];
	/** Processos citados no texto que são paradigma de algum precedente da base. */
	paradigmasCitados: { linha: number; mencao: string; precedentes: RegistroPrecedente[] }[];
}

const RE_RETICENCIAS = /\s*(?:\(\s*(?:\.{3}|…)\s*\)|\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/g;
const RE_RESSALVA = /cancelad|revogad|superad|revisad|revis[ãa]o|n[ãa]o (?:mais )?(?:vig|subsist)|ent[ãa]o vigente|j[áa] n[ãa]o/i;

export const TEXTO_ALERTA: Record<string, (detalhe?: string) => string> = {
	TESE_PENDENTE_DE_PUBLICACAO: (d) => `O STJ ainda não publicou a tese deste precedente (no campo da tese consta: "${d ?? ""}").`,
	SEM_TESE_NA_FONTE: () => "A fonte oficial não registra tese neste precedente.",
	TESE_COMPLETADA_PELO_PORTAL: (d) => `A planilha do STF corta a tese; o texto foi completado pela página do tema no portal do STF (${d ?? ""}).`,
	TESE_TRUNCADA_NA_FONTE: (d) => `TESE INCOMPLETA: as fontes oficiais usadas cortam o texto desta tese (${d ?? ""}). A base só tem o começo; para citar a tese inteira, use o acórdão ou a nota do cofre.`,
	CARACTERES_CORROMPIDOS_NA_FONTE: (d) => `A fonte oficial traz caracteres corrompidos na tese (${d ?? ""}); na citação pronta eles foram trocados por espaço.`,
	SUSPENSAO_NACIONAL_VIGENTE: (d) => `Suspensão nacional vigente${d ? `, determinada em ${dataBr(d)}` : ""}: verifique se o processo deve ser sobrestado.`,
	POSSIVEL_REVISAO_DE_TESE: () => "Tema afetado para possível revisão da tese.",
	MODULACAO_DE_EFEITOS: () => "A tese, a decisão de julgamento ou as anotações mencionam modulação de efeitos: confira o marco temporal antes de aplicar.",
	REFERE_TEMA_STF: (d) => `As anotações ou a tese remetem ao(s) Tema(s) ${d ?? ""} do STF: confira se a tese do STJ subsiste diante do que o STF decidiu.`,
	MENCIONA_REPERCUSSAO_GERAL: () => "As anotações mencionam repercussão geral no STF: confira o andamento.",
	MENCIONA_SUPERACAO_OU_REVISAO: () => "As anotações mencionam revisão, superação, revogação ou cancelamento de tese: leia as anotações antes de aplicar.",
	REDACAO_ALTERADA: () => "A redação da tese foi alterada depois do julgamento (ver anotações).",
	TESE_COM_MULTIPLAS_REDACOES: () => "O campo da tese reúne mais de uma redação (a original e a posterior): cite a que se aplica, identificando o julgamento.",
	VIDE: (d) => `Remissões do STJ: ${d ?? ""}.`,
};

export function textoAlerta(a: AlertaPrecedente): string {
	return (TEXTO_ALERTA[a.codigo] ?? (() => a.codigo))(a.detalhe);
}

/** Alertas que pedem leitura das anotações antes de aplicar a tese (os demais são informativos). */
const ALERTAS_DE_RESSALVA = new Set(["TESE_TRUNCADA_NA_FONTE", "SEM_TESE_NA_FONTE", "TESE_PENDENTE_DE_PUBLICACAO", "POSSIVEL_REVISAO_DE_TESE", "MENCIONA_SUPERACAO_OU_REVISAO"]);

function semPontoFinal(s: string): string {
	return s.replace(/[.\s]+$/, "");
}

/** Texto sem as aspas das pontas, com a tipografia unificada. O "¿" é espaço corrompido na base do STF. */
function nucleo(s: string): string {
	return comparavel(s.replace(/¿/g, " ")).replace(/^["'\s]+|["'\s]+$/g, "");
}

/**
 * Critério de "literal" para teses: mesmos caracteres, sem contar espaços e quebras de linha.
 * As teses do STJ têm itens e parágrafos; a minuta pode quebrar as linhas de outro modo.
 */
function semEspacos(s: string): string {
	return s.replace(/\s+/g, "");
}

function inicialNeutra(s: string): string {
	const t = s.replace(/^\[(\p{L})\]/u, "$1");
	return t.charAt(0).toLowerCase() + t.slice(1);
}

function igualNaForma(a: string, b: string): boolean {
	return chaveForma(a) === chaveForma(b);
}

export interface CotejoTese {
	resultado: ResultadoPrecedente;
	diferencas?: Diferenca[];
	nota?: string;
	semelhanca: number;
	/** Proporção das palavras citadas que constam da tese, na ordem (0 a 1). */
	contido: number;
}

/** Compara um trecho citado com a tese oficial. */
export function cotejarTese(citado: string, tese: string): CotejoTese {
	const c = nucleo(citado);
	const o = nucleo(tese);
	const cs = semEspacos(semPontoFinal(c));
	const os = semEspacos(semPontoFinal(o));
	if (inicialNeutra(cs) === inicialNeutra(os)) return { resultado: "CONFERE_LITERAL", semelhanca: 1, contido: 1 };

	const pedacos = c.split(RE_RETICENCIAS).map((p) => semEspacos(semPontoFinal(p))).filter((p) => p.length > 0);
	if (pedacos.reduce((n, p) => n + p.length, 0) >= 20) {
		let posicao = 0;
		let emOrdem = true;
		pedacos.forEach((pedaco, i) => {
			if (!emOrdem) return;
			let achado = os.indexOf(pedaco, posicao);
			if (achado < 0 && i === 0) achado = os.indexOf(pedaco.charAt(0).toUpperCase() + pedaco.slice(1), posicao);
			if (achado < 0) emOrdem = false;
			else posicao = achado + pedaco.length;
		});
		if (emOrdem) return { resultado: "CONFERE_TRECHO", nota: "Transcrição parcial: o trecho citado consta literalmente da tese.", semelhanca: 1, contido: 1 };
	}

	const chaveC = chaveForma(c.replace(RE_RETICENCIAS, " "));
	const chaveO = chaveForma(o);
	if (chaveC === chaveO) {
		return {
			resultado: "CONFERE_COM_DIFERENCA_DE_FORMA",
			nota: "Mesmas palavras, na mesma ordem; a diferença está só em pontuação, maiúsculas, acentos, hífen ou abreviação.",
			diferencas: diferencas(palavrasVisiveis(c), palavrasVisiveis(o)),
			semelhanca: 1,
			contido: 1,
		};
	}
	if (chaveC.length >= 24 && chaveO.includes(chaveC)) {
		return {
			resultado: "CONFERE_COM_DIFERENCA_DE_FORMA",
			nota: "Transcrição parcial com as mesmas palavras da tese; a diferença está só em pontuação, maiúsculas, acentos, hífen ou abreviação.",
			semelhanca: 1,
			contido: 1,
		};
	}

	const pc = palavras(c);
	const po = palavras(o);
	const s = semelhanca(pc, po);
	const contido = pc.length ? (s * (pc.length + po.length)) / 2 / pc.length : 0;
	const vc = visiveis(c);
	let vo = visiveis(o);
	// transcrição parcial: compara com o trecho da tese que mais se parece com o citado
	if (vc.length > 0 && vc.length < vo.length * 0.8) vo = melhorJanela(vc, vo);
	let difs = diferencas(vc, vo, igualNaForma);
	// o que falta antes e depois do trecho citado não é divergência
	if (difs.length && difs[0].citado === "") difs = difs.slice(1);
	if (difs.length && difs[difs.length - 1].citado === "") difs = difs.slice(0, -1);
	return { resultado: "DIVERGENTE", diferencas: difs, semelhanca: s, contido };
}

/** Palavras visíveis, separando os itens que o STJ publica colados ("programa;ii) a pretensão", "servidor.2. A inércia"). */
function visiveis(s: string): string[] {
	return palavrasVisiveis(s.replace(/([;:])(?=\S)/g, "$1 ").replace(/(?<=[\p{L})])\.(?=[\p{L}\d(])/gu, ". "));
}

/** Trecho de `oficial` (com folga) que tem mais palavras em comum, na ordem, com `citado`. */
function melhorJanela(citado: string[], oficial: string[]): string[] {
	const kc = citado.map(chaveForma);
	const ko = oficial.map(chaveForma);
	const largura = citado.length + Math.ceil(citado.length * 0.2) + 3;
	let melhor = 0;
	let nota = -1;
	for (let i = 0; i + Math.min(largura, ko.length) <= ko.length; i++) {
		if (!kc.includes(ko[i])) continue;
		const n = semelhanca(kc, ko.slice(i, i + largura));
		if (n > nota) {
			nota = n;
			melhor = i;
		}
	}
	return oficial.slice(melhor, melhor + largura);
}

function confere(resultado: ResultadoPrecedente): boolean {
	return resultado.startsWith("CONFERE");
}

/** Procura na base o precedente cuja tese contém o trecho citado. */
function localizarPeloTexto(citado: string, base: BasePrecedentes, exceto?: string): RegistroPrecedente | undefined {
	const c = nucleo(citado);
	const exata = base.porChaveForma(chaveForma(c)).find((r) => r.id !== exceto);
	if (exata) return exata;
	const p = palavras(c);
	if (p.length < 8) return undefined;
	let melhor: RegistroPrecedente | undefined;
	let nota = 0.85;
	for (const registro of base.todos) {
		if (!registro.tese || registro.id === exceto) continue;
		const q = palavras(registro.tese);
		if (q.length < p.length * 0.85) continue;
		const contido = (semelhanca(p, q) * (p.length + q.length)) / 2 / p.length;
		if (contido > nota) {
			nota = contido;
			melhor = registro;
		}
	}
	return melhor;
}

export function descricaoSituacao(r: RegistroPrecedente): string {
	return `${r.situacao_original || "sem situação"}${r.data_situacao ? `, ${dataBr(r.data_situacao)}` : ""}`;
}

export function teseTruncada(r: RegistroPrecedente): boolean {
	return r.alertas.some((a) => a.codigo === "TESE_TRUNCADA_NA_FONTE");
}

function avaliarSituacao(r: RegistroPrecedente, texto: string, ref: ReferenciaPrecedente): { alerta?: string; notas: string[]; ressalva: boolean } {
	const nome = nomePrecedente(r);
	const notas: string[] = [];
	let ressalva = false;
	let alerta: string | undefined;
	const suspensao = r.suspensao ? ` Suspensão: ${r.suspensao}.` : "";
	const onde = `situação no ${r.tribunal}: ${descricaoSituacao(r)}`;
	switch (r.situacao) {
		case "transitado":
			break;
		case "cancelado": {
			const contexto = texto.slice(Math.max(0, ref.inicio - 160), Math.min(texto.length, ref.fim + 160));
			if (RE_RESSALVA.test(contexto)) notas.push(`O ${nome} está cancelado; o texto já faz a ressalva.`);
			else alerta = `O ${nome} está cancelado (${descricaoSituacao(r)}) e foi citado sem ressalva. Não pode ser invocado como precedente em vigor.`;
			ressalva = true;
			break;
		}
		case "tese_sem_transito":
			notas.push(`O ${nome} ${r.tese ? "tem tese fixada, mas" : "foi julgado, mas"} ainda não transitou em julgado (${onde}). Diga isso ao citar.${suspensao}`);
			ressalva = true;
			break;
		case "afetado":
			notas.push(`O ${nome} está em tramitação (${onde})${r.tese ? "; a tese registrada pode ser revista" : "; não há tese firmada"}.${suspensao}`);
			ressalva = true;
			break;
		case "revisado":
			notas.push(`O ${nome} teve a tese revisada (${descricaoSituacao(r)}): a base traz a redação que o STJ mantém no registro; confira se é a que o texto cita.`);
			ressalva = true;
			break;
		case "rg_negada":
			notas.push(`O ${nome} teve a repercussão geral negada (${descricaoSituacao(r)}): não há tese de mérito do STF. O enunciado só diz que a questão não tem repercussão geral; não o cite como entendimento do STF sobre o mérito.`);
			ressalva = true;
			break;
		default:
			notas.push(`O ${nome} está com situação "${r.situacao_original}" no ${r.tribunal} e não é tese firmada.`);
			ressalva = true;
	}
	for (const a of r.alertas) {
		if (a.codigo === "VIDE" || a.codigo === "TESE_COMPLETADA_PELO_PORTAL" || a.codigo === "CARACTERES_CORROMPIDOS_NA_FONTE") continue;
		notas.push(textoAlerta(a));
		if (ALERTAS_DE_RESSALVA.has(a.codigo)) ressalva = true;
	}
	return { alerta, notas, ressalva };
}

function resumoCandidato(r: RegistroPrecedente): string {
	return `${nomePrecedente(r)} (${descricaoSituacao(r)}): ${(r.titulo || r.questao).replace(/\s+/g, " ").slice(0, 260)}`;
}

function conferirReferencia(ref: ReferenciaPrecedente, texto: string, base: BasePrecedentes, tribunalDoTexto: Map<string, string | null>, numerosCitados: Set<number>): ConferenciaPrecedente {
	const conferencia: ConferenciaPrecedente = { linha: ref.linha, mencao: ref.mencao, resultado: "SEM_TRANSCRICAO", notas: [], ressalva: false };
	if (ref.transcricao) conferencia.transcricao = ref.transcricao.texto.replace(/\s+/g, " ").trim();
	const rotulo = ref.tipo === "IAC" ? "IAC" : "tema";
	const noTribunal = (t: TribunalPrecedente) => (ref.tipo === "IAC" ? (t === "STJ" ? base.obter("IAC", ref.numero) : undefined) : base.obterTema(ref.numero, t));

	let tribunal: TribunalPrecedente | null = ref.tribunal === "STJ" || ref.tribunal === "STF" ? ref.tribunal : null;
	if (!tribunal) {
		const doTexto = tribunalDoTexto.get(`${ref.tipo}:${ref.numero}`);
		if (doTexto === "STJ" || doTexto === "STF") {
			tribunal = doTexto;
			conferencia.notas.push(`A referência não diz o tribunal; adotado o ${tribunal}, indicado em outra referência ao mesmo ${rotulo} neste texto.`);
		} else {
			const candidatos = (["STJ", "STF"] as TribunalPrecedente[]).map(noTribunal).filter((r): r is RegistroPrecedente => r !== undefined);
			const pelosTextos = ref.transcricao ? candidatos.filter((r) => r.tese && confere(cotejarTese(ref.transcricao!.texto, r.tese).resultado)) : [];
			if (pelosTextos.length === 1) {
				tribunal = pelosTextos[0].tribunal;
				conferencia.notas.push(`A referência não diz o tribunal; identificada como do ${tribunal} pelo texto transcrito.`);
			} else {
				conferencia.resultado = "AMBIGUA";
				conferencia.ressalva = true;
				delete conferencia.transcricao;
				conferencia.notas.push(
					candidatos.length
						? `A referência não diz de qual tribunal é o ${rotulo}. Com esse número a base tem: ${candidatos.map(resumoCandidato).join(" | ")}`
						: `A referência não diz de qual tribunal é o ${rotulo}, e a base não tem ${rotulo} com esse número no STJ nem no STF.`,
					"Escreva o tribunal por extenso (\"do STJ\", \"do STF\") para que a referência seja conferida.",
				);
				return conferencia;
			}
		}
	}

	const registro = noTribunal(tribunal);
	if (!registro) {
		conferencia.resultado = "NAO_ENCONTRADO_NA_BASE";
		const tipo = tribunal === "STF" ? "RG" : ref.tipo;
		const c = base.cobertura[tipo];
		const fonte = base.fontes[tribunal];
		const quais = tipo === "RG" ? "os temas de repercussão geral" : tipo === "IAC" ? "os IAC" : "os temas repetitivos";
		conferencia.notas.push(
			c && fonte
				? `A base cobre ${quais} ${c.de} a ${c.ate} do ${tribunal}, conforme a planilha oficial de ${dataBr(fonte.dataFonte)}. Não constar da base não significa que não exista: confira no portal do ${tribunal}.`
				: `A base não tem ${quais} do ${tribunal}.`,
		);
		if (ref.transcricao?.comAspas) {
			const outro = localizarPeloTexto(ref.transcricao.texto, base);
			if (outro) conferencia.notas.push(`O texto transcrito corresponde ao ${nomePrecedente(outro)}.`);
		}
		return conferencia;
	}

	conferencia.precedente = registro;
	const situacao = avaliarSituacao(registro, texto, ref);
	if (situacao.alerta) conferencia.alertaSituacao = situacao.alerta;
	conferencia.notas.push(...situacao.notas);
	conferencia.ressalva = situacao.ressalva;

	if (!ref.transcricao) return conferencia;
	if (!registro.tese) {
		if (ref.transcricao.comAspas) {
			conferencia.notas.push(`Há um trecho entre aspas junto à referência, mas o ${registro.tribunal} não registra tese neste precedente: o trecho não pôde ser conferido.`);
			conferencia.ressalva = true;
		}
		delete conferencia.transcricao;
		return conferencia;
	}

	let citado = ref.transcricao.texto;
	if (!ref.transcricao.comAspas) {
		// sem aspas, o trecho pode continuar além da tese: compara só o mesmo número de palavras
		citado = palavrasVisiveis(citado).slice(0, palavrasVisiveis(registro.tese).length).join(" ");
	}
	const truncada = teseTruncada(registro);
	if (truncada && ref.transcricao.comAspas) {
		// a base só tem o começo desta tese: a transcrição integral confere até onde a base alcança
		const c = inicialNeutra(semEspacos(nucleo(citado)));
		const o = inicialNeutra(semEspacos(nucleo(registro.tese))).slice(0, -4);
		if (c.length > o.length && c.startsWith(o)) {
			conferencia.resultado = "CONFERE_TRECHO";
			conferencia.ressalva = true;
			conferencia.notas.push(`A transcrição confere com os primeiros ${registro.tese.length} caracteres da tese, que é o que a base tem; o restante não foi conferido.`);
			return conferencia;
		}
	}
	const cotejo = cotejarTese(citado, registro.tese);
	if (confere(cotejo.resultado)) {
		conferencia.resultado = cotejo.resultado;
		if (cotejo.nota) conferencia.notas.push(cotejo.nota);
		if (cotejo.diferencas?.length) conferencia.diferencas = cotejo.diferencas;
		return conferencia;
	}
	// trecho curto demais, ou sem aspas e pouco parecido: não dá para dizer que é transcrição da tese
	if (palavras(citado).length < 12 || (!ref.transcricao.comAspas && cotejo.contido < 0.7)) {
		delete conferencia.transcricao;
		return conferencia;
	}
	// o trecho é a tese de outro tema que o texto também cita (teses que remetem umas às outras)
	const vizinho = localizarPeloTexto(citado, base, registro.id);
	if (vizinho && numerosCitados.has(vizinho.numero) && cotejo.semelhanca < 0.5) {
		conferencia.notas.push(`O trecho entre aspas junto à referência é do ${nomePrecedente(vizinho)}, também citado no texto; não foi tratado como transcrição deste tema.`);
		delete conferencia.transcricao;
		return conferencia;
	}
	if (cotejo.contido >= 0.6 || cotejo.semelhanca >= 0.5) {
		conferencia.resultado = "DIVERGENTE";
		let difs = cotejo.diferencas ?? [];
		// o que o texto cita além do ponto em que a base foi cortada não é divergência
		if (truncada && difs.length && difs[difs.length - 1].oficial === "") difs = difs.slice(0, -1);
		conferencia.diferencas = difs;
		return conferencia;
	}
	const outro = localizarPeloTexto(citado, base, registro.id);
	if (outro) {
		conferencia.resultado = "DIVERGENTE";
		conferencia.notas.push(`O número não corresponde ao texto: o trecho transcrito é do ${nomePrecedente(outro)}, não do ${nomePrecedente(registro)}.`);
		return conferencia;
	}
	conferencia.notas.push("O trecho entre aspas junto à referência não se parece com a tese e não foi tratado como transcrição dela.");
	delete conferencia.transcricao;
	return conferencia;
}

export function verificarPrecedentes(texto: string, base: BasePrecedentes): RelatorioPrecedentes {
	const normalizado = texto.normalize("NFC");
	const deteccao = detectarPrecedentes(normalizado);
	// "Tema 1.150 do STJ ... o Tema 1.150": a segunda herda o tribunal, se o texto só indicar um
	const tribunalDoTexto = new Map<string, string | null>();
	for (const ref of deteccao.referencias) {
		if (!ref.tribunal) continue;
		const chave = `${ref.tipo}:${ref.numero}`;
		const anterior = tribunalDoTexto.get(chave);
		tribunalDoTexto.set(chave, anterior === undefined || anterior === ref.tribunal ? ref.tribunal : null);
	}
	const numerosCitados = new Set(deteccao.referencias.map((r) => r.numero));
	const conferencias: ConferenciaPrecedente[] = [];
	const foraDoEscopo: RelatorioPrecedentes["foraDoEscopo"] = [];
	for (const ref of deteccao.referencias) {
		const herdado = ref.tribunal ?? tribunalDoTexto.get(`${ref.tipo}:${ref.numero}`) ?? null;
		// tribunais que a base não cobre, e IAC do STF (a base do STF só tem temas de repercussão geral)
		if (herdado === "OUTRO" || (herdado === "STF" && ref.tipo === "IAC")) {
			const tribunal = herdado === "STF" ? "STF" : "outro tribunal";
			if (!foraDoEscopo.some((f) => f.linha === ref.linha && f.mencao === ref.mencao)) foraDoEscopo.push({ linha: ref.linha, mencao: ref.mencao, tribunal });
			continue;
		}
		conferencias.push(conferirReferencia(ref, normalizado, base, tribunalDoTexto, numerosCitados));
	}

	const citados = new Set(conferencias.map((c) => c.precedente?.id));
	const paradigmasCitados: RelatorioPrecedentes["paradigmasCitados"] = [];
	const vistos = new Set<string>();
	for (const p of deteccao.processos) {
		const tribunal = tribunalDaClasse(p.classe);
		const chave = `${tribunal}:${p.digitos}`;
		if (vistos.has(chave)) continue;
		vistos.add(chave);
		const precedentes = base.porParadigma(p.digitos, tribunal).filter((r) => r.tipo !== "CONTROVERSIA" && r.tipo !== "SIRDR" && !citados.has(r.id));
		if (precedentes.length) paradigmasCitados.push({ linha: p.linha, mencao: p.mencao, precedentes });
	}

	const contagem: Record<string, number> = {};
	for (const c of conferencias) contagem[c.resultado] = (contagem[c.resultado] ?? 0) + 1;
	const alertas = conferencias.filter((c) => c.alertaSituacao).length;
	if (alertas) contagem.ALERTA_DE_SITUACAO = alertas;

	let veredito: VereditoPrecedentes;
	if (conferencias.length === 0) veredito = "SEM_REFERENCIAS";
	else if (alertas > 0 || conferencias.some((c) => c.resultado === "DIVERGENTE" || c.resultado === "NAO_ENCONTRADO_NA_BASE")) veredito = "NAO_VERIFICADO";
	else if (conferencias.some((c) => c.ressalva || c.resultado === "CONFERE_COM_DIFERENCA_DE_FORMA" || c.resultado === "AMBIGUA")) veredito = "VERIFICADO_COM_RESSALVAS";
	else veredito = "INTEGRALMENTE_VERIFICADO";

	return { veredito, versaoBase: base.versao, conferencias, contagem, foraDoEscopo, paradigmasCitados };
}
