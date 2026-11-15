import type { Base } from "./base";
import { nomeSumula } from "./base";
import { Referencia, detectar } from "./detector";
import { Diferenca, chaveForma, comparavel, diferencas, palavras, palavrasVisiveis, semelhanca } from "./normalizar";
import type { RegistroSumula, Tribunal } from "./tipos";

export type Resultado =
	| "CONFERE_LITERAL"
	| "CONFERE_TRECHO"
	| "CONFERE_VARIANTE_OFICIAL"
	| "CONFERE_COM_DIFERENCA_DE_FORMA"
	| "DIVERGENTE"
	| "SEM_TRANSCRICAO"
	| "AMBIGUA"
	| "NAO_ENCONTRADA_NA_BASE";

export type Veredito = "INTEGRALMENTE_VERIFICADO" | "VERIFICADO_COM_RESSALVAS" | "NAO_VERIFICADO" | "SEM_REFERENCIAS";

export interface Conferencia {
	linha: number;
	mencao: string;
	resultado: Resultado;
	/** Registro da base, quando identificado. */
	sumula?: RegistroSumula;
	transcricao?: string;
	diferencas?: Diferenca[];
	/** Explicações curtas: tribunal presumido, variante usada, trecho ignorado etc. */
	notas: string[];
	/** Súmula não vigente citada sem ressalva: impede o veredito de verificado. */
	alertaSituacao?: string;
	candidatas?: RegistroSumula[];
}

export interface Relatorio {
	veredito: Veredito;
	versaoBase: string;
	conferencias: Conferencia[];
	contagem: Record<string, number>;
	/** Súmulas de tribunais que a base não cobre: relacionadas, não conferidas. */
	foraDoEscopo: { linha: number; mencao: string }[];
}

export interface OpcoesVerificacao {
	/** Tribunal a presumir em "Súmula 7" sem tribunal e em "deste Tribunal". */
	tribunalPadrao?: Tribunal;
	/** Tribunal dito em outra referência do mesmo texto à mesma súmula (uso interno). */
	tribunalDoTexto?: Map<string, Tribunal | null>;
}

const RE_RETICENCIAS = /\s*(?:\(\s*(?:\.{3}|…)\s*\)|\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/g;
const RE_RESSALVA = /cancelad|revogad|superad|alterad|n[ãa]o (?:mais )?(?:vig|subsist)|ent[ãa]o vigente|j[áa] n[ãa]o/i;

function semPontoFinal(s: string): string {
	return s.replace(/[.\s]+$/, "");
}

function limparCitacao(s: string): string {
	return comparavel(s).replace(/^["'\s]+|["'\s]+$/g, "");
}

/** Citação embutida na frase costuma começar em minúscula ou com "[d]entro": não é diferença. */
function inicialNeutra(s: string): string {
	const t = s.replace(/^\[(\p{L})\]/u, "$1");
	return t.charAt(0).toLowerCase() + t.slice(1);
}

interface Cotejo {
	resultado: Resultado;
	diferencas?: Diferenca[];
	nota?: string;
	semelhanca: number;
}

function igualNaForma(a: string, b: string): boolean {
	return chaveForma(a) === chaveForma(b);
}

/** Compara um trecho citado com o enunciado oficial (e suas variantes oficiais). */
export function cotejar(citado: string, registro: RegistroSumula): Cotejo {
	const c = limparCitacao(citado);
	const o = comparavel(registro.enunciado);
	if (inicialNeutra(semPontoFinal(c)) === inicialNeutra(semPontoFinal(o))) return { resultado: "CONFERE_LITERAL", semelhanca: 1 };

	const oNeutro = inicialNeutra(o);
	const pedacos = c.split(RE_RETICENCIAS).map(semPontoFinal).filter((p) => p.length > 0);
	if (pedacos.length > 0) {
		let posicao = 0;
		let emOrdem = true;
		for (const pedaco of pedacos) {
			const achado = posicao === 0 && oNeutro.startsWith(inicialNeutra(pedaco)) ? 0 : o.indexOf(pedaco, posicao);
			if (achado < 0) {
				emOrdem = false;
				break;
			}
			posicao = achado + pedaco.length;
		}
		if (emOrdem) return { resultado: "CONFERE_TRECHO", nota: "Transcrição parcial: o trecho citado consta literalmente do enunciado.", semelhanca: 1 };
	}

	for (const variante of registro.variantes ?? []) {
		if (semPontoFinal(comparavel(variante.texto)) === semPontoFinal(c) || igualNaForma(variante.texto, c)) {
			return {
				resultado: "CONFERE_VARIANTE_OFICIAL",
				nota: `O texto citado confere com a redação de outra publicação oficial (${variante.fonte}), que diverge em palavras da redação adotada na base.`,
				diferencas: diferencas(palavrasVisiveis(c), palavrasVisiveis(o), igualNaForma),
				semelhanca: 1,
			};
		}
	}

	const chaveC = chaveForma(c.replace(RE_RETICENCIAS, " "));
	const chaveO = chaveForma(o);
	if (chaveC === chaveO) {
		return {
			resultado: "CONFERE_COM_DIFERENCA_DE_FORMA",
			nota: "Mesmas palavras, na mesma ordem; a diferença está só em pontuação, maiúsculas, acentos, hífen ou abreviação.",
			diferencas: diferencas(palavrasVisiveis(c), palavrasVisiveis(o)),
			semelhanca: 1,
		};
	}
	if (chaveC.length >= 24 && chaveO.includes(chaveC)) {
		return {
			resultado: "CONFERE_COM_DIFERENCA_DE_FORMA",
			nota: "Transcrição parcial com as mesmas palavras do enunciado; a diferença está só em pontuação, maiúsculas, acentos, hífen ou abreviação.",
			semelhanca: 1,
		};
	}

	return {
		resultado: "DIVERGENTE",
		diferencas: diferencas(palavrasVisiveis(c), palavrasVisiveis(o), igualNaForma),
		semelhanca: semelhanca(palavras(c), palavras(o)),
	};
}

function confere(resultado: Resultado): boolean {
	return resultado.startsWith("CONFERE");
}

/** Procura na base inteira a súmula cujo enunciado corresponde ao trecho citado. */
function localizarPeloTexto(citado: string, base: Base, exceto?: string): RegistroSumula | undefined {
	const c = limparCitacao(citado);
	const exata = base.porChaveForma(chaveForma(c)).find((r) => r.id !== exceto);
	if (exata) return exata;
	const p = palavras(c);
	if (p.length < 6) return undefined;
	let melhor: RegistroSumula | undefined;
	let nota = 0.85;
	for (const registro of base.todas) {
		if (registro.id === exceto) continue;
		const s = semelhanca(p, palavras(registro.enunciado));
		if (s > nota) {
			nota = s;
			melhor = registro;
		}
	}
	return melhor;
}

function avaliarSituacao(registro: RegistroSumula, texto: string, ref: Referencia): { alerta?: string; nota?: string } {
	const s = registro.situacao;
	if (s === "vigente") return {};
	const nome = nomeSumula(registro.tribunal, registro.tipo, registro.numero);
	const contexto = texto.slice(Math.max(0, ref.inicio - 140), Math.min(texto.length, ref.fim + 140));
	const complemento = registro.observacao ? ` Observação da fonte: ${registro.observacao}` : "";
	if (s === "cancelada" || s === "revogada" || s === "superada") {
		if (RE_RESSALVA.test(contexto)) return { nota: `A ${nome} está ${s}; o texto já faz a ressalva.${complemento}` };
		return { alerta: `A ${nome} está ${s} e foi citada sem ressalva. Não pode ser invocada como entendimento vigente.${complemento}` };
	}
	if (s === "alterada") return { nota: `A ${nome} foi alterada: confira na observação qual redação está em vigor antes de citar.${complemento}` };
	return { nota: `A ${nome} está com situação "${s}" na fonte oficial: confira antes de citar.${complemento}` };
}

function conferirReferencia(ref: Referencia, texto: string, base: Base, opcoes: OpcoesVerificacao): Conferencia {
	const conferencia: Conferencia = { linha: ref.linha, mencao: ref.mencao, resultado: "SEM_TRANSCRICAO", notas: [] };
	if (ref.transcricao) conferencia.transcricao = ref.transcricao.texto.replace(/\s+/g, " ").trim();

	let tribunal = ref.tribunal;
	if (!tribunal && !ref.tribunalLocal) {
		const doTexto = opcoes.tribunalDoTexto?.get(`${ref.tipo}:${ref.numero}`);
		if (doTexto) {
			tribunal = doTexto;
			conferencia.notas.push(`A referência não diz o tribunal; adotado o ${tribunal}, indicado em outra referência à mesma súmula neste texto.`);
		}
	}
	if (!tribunal && opcoes.tribunalPadrao && (ref.tribunalLocal || base.obter(opcoes.tribunalPadrao, ref.tipo, ref.numero))) {
		tribunal = opcoes.tribunalPadrao;
		conferencia.notas.push(
			ref.tribunalLocal
				? `"${ref.mencao}" foi lida como súmula do ${tribunal} (tribunal_padrao).`
				: `A referência não diz o tribunal; presumido o ${tribunal} (tribunal_padrao).`,
		);
	}

	let registro: RegistroSumula | undefined;
	if (tribunal) {
		registro = base.obter(tribunal, ref.tipo, ref.numero);
	} else {
		const candidatas = (["STF", "STJ", "TJPE"] as Tribunal[])
			.map((t) => base.obter(t, ref.tipo, ref.numero))
			.filter((r): r is RegistroSumula => r !== undefined);
		const compativeis = ref.transcricao ? candidatas.filter((r) => confere(cotejar(ref.transcricao!.texto, r).resultado)) : [];
		if (compativeis.length === 1) {
			registro = compativeis[0];
			conferencia.notas.push(`A referência não diz o tribunal; identificada como do ${registro.tribunal} pelo texto transcrito.`);
		} else if (candidatas.length === 1 && ref.tipo === "vinculante") {
			registro = candidatas[0];
		} else if (candidatas.length > 0) {
			conferencia.resultado = "AMBIGUA";
			conferencia.candidatas = candidatas;
			conferencia.notas.push(
				ref.tribunalLocal
					? `"${ref.mencao}" não identifica o tribunal. Informe tribunal_padrao ou escreva o tribunal por extenso.`
					: "A referência não diz de qual tribunal é a súmula e o texto não permite decidir.",
			);
			return conferencia;
		}
	}

	if (!registro) {
		conferencia.resultado = "NAO_ENCONTRADA_NA_BASE";
		const rotulo = tribunal ? `${tribunal}:${ref.tipo === "vinculante" ? "SV" : "SUM"}` : "";
		const cobertura = rotulo ? base.cobertura[rotulo] : undefined;
		conferencia.notas.push(
			cobertura
				? `A base cobre deste conjunto os números ${cobertura.de} a ${cobertura.ate} (fonte de ${cobertura.data_fonte}). Não constar da base não significa que a súmula não exista: confira no portal do tribunal.`
				: "Nenhum conjunto da base tem esse número. Não constar da base não significa que a súmula não exista.",
		);
		if (ref.transcricao?.comAspas) {
			const outra = localizarPeloTexto(ref.transcricao.texto, base);
			if (outra) conferencia.notas.push(`O texto transcrito corresponde à ${nomeSumula(outra.tribunal, outra.tipo, outra.numero)}.`);
		}
		return conferencia;
	}

	conferencia.sumula = registro;
	const situacao = avaliarSituacao(registro, texto, ref);
	if (situacao.alerta) conferencia.alertaSituacao = situacao.alerta;
	if (situacao.nota) conferencia.notas.push(situacao.nota);
	if (registro.consenso === "divergência entre fontes oficiais" && registro.observacao) {
		conferencia.notas.push(`As publicações oficiais desta súmula divergem entre si. ${registro.observacao}`);
	}

	if (!ref.transcricao) return conferencia;

	let citado = ref.transcricao.texto;
	if (!ref.transcricao.comAspas) {
		// sem aspas, o trecho pode continuar além do enunciado: compara só o mesmo número de palavras
		const limite = palavrasVisiveis(registro.enunciado).length;
		citado = palavrasVisiveis(citado).slice(0, limite).join(" ");
	}
	const cotejo = cotejar(citado, registro);
	if (confere(cotejo.resultado)) {
		conferencia.resultado = cotejo.resultado;
		if (cotejo.nota) conferencia.notas.push(cotejo.nota);
		if (cotejo.diferencas?.length) conferencia.diferencas = cotejo.diferencas;
		return conferencia;
	}
	if (!ref.transcricao.comAspas && cotejo.semelhanca < 0.6) {
		delete conferencia.transcricao;
		return conferencia;
	}
	if (cotejo.semelhanca >= 0.5) {
		conferencia.resultado = "DIVERGENTE";
		conferencia.diferencas = cotejo.diferencas;
		return conferencia;
	}
	const outra = localizarPeloTexto(citado, base, registro.id);
	if (outra) {
		conferencia.resultado = "DIVERGENTE";
		conferencia.notas.push(
			`O número não corresponde ao texto: o trecho transcrito é da ${nomeSumula(outra.tribunal, outra.tipo, outra.numero)}, não da ${nomeSumula(registro.tribunal, registro.tipo, registro.numero)}.`,
		);
		return conferencia;
	}
	conferencia.notas.push("O trecho entre aspas junto à referência não se parece com o enunciado e não foi tratado como transcrição da súmula.");
	delete conferencia.transcricao;
	return conferencia;
}

export function verificarTexto(texto: string, base: Base, opcoes: OpcoesVerificacao = {}): Relatorio {
	const normalizado = texto.normalize("NFC");
	const deteccao = detectar(normalizado);
	// "Súmula 314 do STJ ... a Súmula 314": a segunda herda o tribunal, se o texto só indicar um
	const tribunalDoTexto = new Map<string, Tribunal | null>();
	for (const ref of deteccao.referencias) {
		if (!ref.tribunal) continue;
		const chave = `${ref.tipo}:${ref.numero}`;
		const anterior = tribunalDoTexto.get(chave);
		tribunalDoTexto.set(chave, anterior === undefined || anterior === ref.tribunal ? ref.tribunal : null);
	}
	const conferencias = deteccao.referencias.map((ref) => conferirReferencia(ref, normalizado, base, { ...opcoes, tribunalDoTexto }));
	const contagem: Record<string, number> = {};
	for (const c of conferencias) contagem[c.resultado] = (contagem[c.resultado] ?? 0) + 1;
	const alertas = conferencias.filter((c) => c.alertaSituacao).length;
	if (alertas) contagem.ALERTA_DE_SITUACAO = alertas;

	let veredito: Veredito;
	if (conferencias.length === 0) veredito = "SEM_REFERENCIAS";
	else if (alertas > 0 || conferencias.some((c) => c.resultado === "DIVERGENTE" || c.resultado === "AMBIGUA" || c.resultado === "NAO_ENCONTRADA_NA_BASE")) veredito = "NAO_VERIFICADO";
	else if (conferencias.some((c) => c.resultado === "CONFERE_COM_DIFERENCA_DE_FORMA" || c.resultado === "CONFERE_VARIANTE_OFICIAL" || (c.sumula && c.sumula.situacao !== "vigente"))) veredito = "VERIFICADO_COM_RESSALVAS";
	else veredito = "INTEGRALMENTE_VERIFICADO";

	return { veredito, versaoBase: base.versao, conferencias, contagem, foraDoEscopo: deteccao.foraDoEscopo };
}
