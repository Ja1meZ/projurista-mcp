import { ErroFerramenta, Ferramenta, ResultadoFerramenta } from "../mcp/tipos";
import { semAcento } from "../sumulas/normalizar";
import { BasePrecedentes, basePrecedentes, dataBr, nomePrecedente, resumoCobertura, tribunalDaClasse, tribunalDoTipo } from "./base";
import { ConferenciaPrecedente, RelatorioPrecedentes, ResultadoPrecedente, VereditoPrecedentes, descricaoSituacao, teseTruncada, textoAlerta, verificarPrecedentes } from "./comparador";
import type { RegistroPrecedente, SituacaoPrecedente, TipoPrecedente, TribunalPrecedente } from "./tipos";

const SOMENTE_LEITURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function texto(conteudo: string): ResultadoFerramenta {
	return { content: [{ type: "text", text: conteudo }] };
}

function rodape(base: BasePrecedentes): string {
	return `Base de precedentes qualificados Projurista (${resumoCobertura(base)}).`;
}

function lerTribunal(valor: unknown): TribunalPrecedente | undefined {
	if (valor === undefined || valor === null || valor === "") return undefined;
	const t = semAcento(typeof valor === "string" ? valor : "").replace(/[^a-z]/g, "");
	if (t === "stj" || t.startsWith("superior")) return "STJ";
	if (t === "stf" || t.startsWith("supremo")) return "STF";
	throw new ErroFerramenta('O parâmetro "tribunal" deve ser STJ ou STF.');
}

function lerTipo(valor: unknown, padrao: TipoPrecedente | undefined): TipoPrecedente | undefined {
	if (valor === undefined || valor === null || valor === "") return padrao;
	const t = semAcento(typeof valor === "string" ? valor : "");
	if (t === "rg" || t.startsWith("repercuss")) return "RG";
	if (t.startsWith("tema") || t.startsWith("repet")) return "TEMA";
	if (t === "iac" || t.startsWith("incidente")) return "IAC";
	if (t.startsWith("relev")) return "RELEVANCIA";
	if (t.startsWith("controv")) return "CONTROVERSIA";
	if (t === "sirdr") return "SIRDR";
	throw new ErroFerramenta('O parâmetro "tipo" deve ser tema, iac, relevancia, controversia, sirdr (STJ) ou rg (STF).');
}

function lerNumero(valor: unknown): number {
	const n = typeof valor === "number" ? valor : Number((typeof valor === "string" ? valor : "").replace(/\D/g, "") || NaN);
	if (!Number.isInteger(n) || n < 1) throw new ErroFerramenta('O parâmetro "numero" deve ser o número do precedente (inteiro positivo).');
	return n;
}

const SITUACOES: SituacaoPrecedente[] = ["transitado", "tese_sem_transito", "afetado", "revisado", "rg_negada", "cancelado", "outro"];

function lerSituacao(valor: unknown): SituacaoPrecedente | undefined {
	if (valor === undefined || valor === null || valor === "") return undefined;
	const t = semAcento(typeof valor === "string" ? valor : "").replace(/[\s-]+/g, "_");
	const achada =
		SITUACOES.find((s) => s === t) ??
		(t.startsWith("transit") ? "transitado" : t.startsWith("afet") ? "afetado" : t.startsWith("revis") ? "revisado" : t.startsWith("cancel") ? "cancelado" : t.includes("negad") ? "rg_negada" : undefined);
	if (!achada) throw new ErroFerramenta(`O parâmetro "situacao" deve ser um destes: ${SITUACOES.join(", ")}.`);
	return achada;
}

const ORGAOS = ["PRIMEIRA SEÇÃO", "SEGUNDA SEÇÃO", "TERCEIRA SEÇÃO", "CORTE ESPECIAL"];

function lerOrgao(valor: unknown): string | undefined {
	if (valor === undefined || valor === null || valor === "") return undefined;
	const t = semAcento(typeof valor === "string" ? valor : "");
	if (/corte|especial/.test(t)) return ORGAOS[3];
	if (/primeira|\b1/.test(t)) return ORGAOS[0];
	if (/segunda|\b2/.test(t)) return ORGAOS[1];
	if (/terceira|\b3/.test(t)) return ORGAOS[2];
	throw new ErroFerramenta('O parâmetro "orgao" deve ser PRIMEIRA SEÇÃO, SEGUNDA SEÇÃO, TERCEIRA SEÇÃO ou CORTE ESPECIAL.');
}

function avisoSituacao(r: RegistroPrecedente): string {
	const suspensao = r.suspensao ? ` Suspensão: ${r.suspensao}.` : "";
	const onde = `situação no ${r.tribunal}: ${r.situacao_original}`;
	switch (r.situacao) {
		case "transitado":
			return r.tese ? "" : `ATENÇÃO: o ${r.tribunal} não registra tese neste precedente.`;
		case "tese_sem_transito":
			return `ATENÇÃO: ${r.tese ? "tese fixada, ainda sem trânsito em julgado" : "julgado sem trânsito e sem tese registrada"} (${onde}). Ao citar, diga a situação; não trate como tese definitiva.${suspensao}`;
		case "afetado":
			return `ATENÇÃO: precedente em tramitação (${onde})${r.tese ? "; a tese registrada pode ser revista" : "; não há tese firmada"}.${suspensao}`;
		case "revisado":
			return "ATENÇÃO: tese revisada pelo STJ. O texto abaixo é o que o STJ mantém no registro; leia as anotações antes de citar.";
		case "rg_negada":
			return `ATENÇÃO: repercussão geral NEGADA (${onde}). Não há tese de mérito do STF: o enunciado abaixo só diz que a questão não tem repercussão geral. Não cite como entendimento do STF sobre o mérito.`;
		case "cancelado":
			return "ATENÇÃO: precedente cancelado. Não cite como precedente em vigor; só como histórico, dizendo a situação.";
		default:
			return `ATENÇÃO: situação "${r.situacao_original}" no ${r.tribunal}. Não é tese firmada.`;
	}
}

function linhasDeAlerta(r: RegistroPrecedente, recuo: string): string[] {
	return r.alertas.filter((a) => a.codigo !== "SEM_TESE_NA_FONTE").map((a) => `${recuo}${a.codigo === "VIDE" ? "" : "Atenção: "}${textoAlerta(a)}`);
}

/** Tese para citar: o "¿" (espaço corrompido na base do STF) vira espaço. */
function teseParaCitar(tese: string): string {
	return tese.replace(/[ \t]*¿+[ \t]*/g, " ").replace(/ +\n/g, "\n").trim();
}

function fichaPrecedente(r: RegistroPrecedente, base: BasePrecedentes): string[] {
	const nome = nomePrecedente(r);
	const stf = r.tribunal === "STF";
	const linhas: string[] = [];
	const aviso = avisoSituacao(r);
	if (aviso) linhas.push(aviso, "");
	linhas.push(`${nome} — situação no ${r.tribunal}: ${descricaoSituacao(r)}`);
	if (r.titulo) linhas.push(`Título: ${r.titulo}`);
	if (r.orgao_julgador) linhas.push(`Órgão julgador: ${r.orgao_julgador}`);
	if (r.relator_atual) linhas.push(`Relator: ${r.relator_atual}${r.primeiro_relator && r.primeiro_relator !== r.relator_atual ? ` (primeiro relator: ${r.primeiro_relator})` : ""}`);
	if (r.paradigmas.length) linhas.push(`Processo${r.paradigmas.length > 1 ? "s" : ""} paradigma: ${r.paradigmas.join(", ")}`);
	if (r.ramo_direito) linhas.push(`Ramo do direito: ${r.ramo_direito}${r.assunto ? ` — ${r.assunto}` : ""}`);
	if (r.suspensao) linhas.push(`Suspensão: ${r.suspensao}`);
	linhas.push("", `${stf ? "Descrição do tema" : "Questão submetida a julgamento"} (texto literal do ${r.tribunal}):`, r.questao || "(não informada)", "");
	if (r.tese) {
		const rotulo = r.situacao === "rg_negada" ? "Enunciado (texto literal do STF; não é tese de mérito)" : `Tese (texto literal do ${r.tribunal})`;
		linhas.push(`${rotulo}:`, r.tese, "");
		if (teseTruncada(r)) {
			linhas.push("Citação pronta: NÃO DISPONÍVEL. O texto acima está incompleto (as fontes oficiais usadas cortam esta tese). Não complete de memória: use o acórdão ou a nota do cofre.", "");
		} else if (r.situacao !== "rg_negada") {
			linhas.push("Citação pronta (copie sem alterar):", `${nome}: “${teseParaCitar(r.tese)}”`, "");
		}
	} else {
		linhas.push(`Tese: o ${r.tribunal} não registra tese neste precedente. Não escreva tese de memória.`, "");
	}
	const alertas = linhasDeAlerta(r, "");
	if (alertas.length) linhas.push(...alertas, "");
	if (r.decisao_julgamento) linhas.push("Decisão de julgamento (texto do STF):", r.decisao_julgamento, "");
	if (r.decisao_admissibilidade) linhas.push("Decisão de admissibilidade (texto do STF):", r.decisao_admissibilidade, "");
	if (r.anotacoes) linhas.push("Anotações do STJ (texto literal):", r.anotacoes, "");
	const fonte = base.fontes[r.tribunal];
	if (fonte) linhas.push(`Fonte: ${fonte.urlFonte} (planilha oficial de ${dataBr(fonte.dataFonte)})`);
	if (r.link_processo) linhas.push(`Processo no portal do STF: ${r.link_processo}`);
	linhas.push(`Identificador: ${r.id}${r.sha256_tese ? ` · sha256 da tese: ${r.sha256_tese}` : ""}`);
	return linhas;
}

export const obterPrecedente: Ferramenta = {
	name: "obter_precedente",
	description:
		"Devolve a tese LITERAL de um precedente qualificado: tema repetitivo, IAC ou tema de relevância do STJ, ou tema de repercussão geral do STF. O texto é copiado da planilha oficial do tribunal e vem com a questão julgada, a situação (trânsito em julgado, sem trânsito, afetado ou mérito pendente, revisado, repercussão geral negada, cancelado), a suspensão de processos, os paradigmas, os avisos e a citação pronta. Use SEMPRE antes de transcrever ou aplicar a tese de um tema: nunca escreva a tese de memória. Só precedente com trânsito em julgado é tese definitiva. Para tema do STF, passe tribunal=\"STF\".",
	annotations: SOMENTE_LEITURA,
	inputSchema: {
		type: "object",
		properties: {
			numero: { type: "integer", minimum: 1, description: "Número do precedente, ex.: 1150." },
			tribunal: { type: "string", enum: ["STJ", "STF"], description: "Tribunal do precedente. Padrão: STJ. Com STF, o número é o do tema de repercussão geral.", default: "STJ" },
			tipo: { type: "string", enum: ["tema", "iac", "relevancia", "controversia", "sirdr"], description: "Só para o STJ: tipo do precedente. Padrão: tema (tema repetitivo).", default: "tema" },
		},
		required: ["numero"],
		additionalProperties: false,
	},
	executar(args) {
		const base = basePrecedentes();
		let tipo = lerTipo(args.tipo, undefined);
		const tribunal = lerTribunal(args.tribunal) ?? (tipo === "RG" ? "STF" : "STJ");
		if (tribunal === "STF") {
			if (tipo && tipo !== "RG" && tipo !== "TEMA") throw new ErroFerramenta("No STF a base só tem temas de repercussão geral.");
			tipo = "RG";
		} else {
			tipo = tipo && tipo !== "RG" ? tipo : "TEMA";
		}
		const numero = lerNumero(args.numero);
		const registro = tipo === "TEMA" ? base.obterTema(numero, "STJ") : base.obter(tipo, numero);
		if (!registro) {
			const c = base.cobertura[tipo];
			const fonte = base.fontes[tribunal];
			const outro = tribunal === "STJ" ? base.obterTema(numero, "STF") : base.obterTema(numero, "STJ");
			return Promise.resolve(
				texto(
					[
						`NÃO ENCONTRADO NA BASE: ${nomePrecedente({ tipo, numero })}.`,
						c && fonte ? `A base cobre deste tipo os números ${c.de} a ${c.ate}, conforme a planilha oficial de ${dataBr(fonte.dataFonte)}.` : "",
						`Isso não significa que o precedente não exista: pode ser posterior à fonte usada. Não escreva a tese de memória; confira no portal do ${tribunal} e avise o usuário.`,
						outro ? `Com esse número existe, no outro tribunal, o ${nomePrecedente(outro)}.` : "",
						"",
						rodape(base),
					]
						.filter((l, i, todas) => l !== "" || i === todas.length - 2)
						.join("\n"),
				),
			);
		}
		return Promise.resolve(texto([...fichaPrecedente(registro, base), "", rodape(base)].join("\n")));
	},
};

// ---------------------------------------------------------------------------------------------
// Busca lexical determinística: mesmos termos, mesma base, mesmo resultado.

const VAZIAS = new Set(
	"a o as os um uma uns umas de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sob sobre entre ate apos ante que se e ou ao aos mas nem como quando onde qual quais cujo cuja seu sua seus suas este esta esse essa isto isso aquele aquela ser sido sendo foi sao era tem ter haver ha nao sim mais menos ja tambem ainda apenas so mesmo caso casos forma termos art arts lei n nº ii iii iv".split(" "),
);

/** Reduz plural e pouco mais: "medicamentos" e "medicamento", "prescrições" e "prescrição" casam. */
function radical(t: string): string {
	if (t.length < 4 || /^\d+$/.test(t)) return t;
	if (/(oes|aes)$/.test(t)) return t.slice(0, -3) + "ao";
	if (/ais$/.test(t)) return t.slice(0, -3) + "al";
	if (/eis$/.test(t)) return t.slice(0, -3) + "el";
	if (/ns$/.test(t)) return t.slice(0, -2) + "m";
	if (/[rzs]es$/.test(t)) return t.slice(0, -2);
	if (/s$/.test(t)) return t.slice(0, -1);
	return t;
}

function termosDe(s: string): string[] {
	return (semAcento(s.replace(/¿/g, " ")).match(/[0-9a-z]+/g) ?? []).filter((t) => (t.length >= 3 || /^\d{2,}$/.test(t)) && !VAZIAS.has(t)).map(radical);
}

interface Indexado {
	registro: RegistroPrecedente;
	questao: Set<string>;
	tese: Set<string>;
	anotacoes: Set<string>;
	corrido: string;
}

let indice: { itens: Indexado[]; frequencia: Map<string, number> } | null = null;

function indiceDaBase(base: BasePrecedentes): { itens: Indexado[]; frequencia: Map<string, number> } {
	if (indice) return indice;
	const frequencia = new Map<string, number>();
	const itens = base.todos.map((registro) => {
		// no STF o título do tema é o melhor resumo da questão
		const enunciadoDaQuestao = `${registro.titulo ?? ""} ${registro.questao}`;
		const questao = new Set(termosDe(enunciadoDaQuestao));
		const tese = new Set(termosDe(registro.tese));
		const anotacoes = new Set(termosDe(`${registro.anotacoes} ${registro.assunto ?? ""}`));
		for (const t of new Set([...questao, ...tese])) frequencia.set(t, (frequencia.get(t) ?? 0) + 1);
		return { registro, questao, tese, anotacoes, corrido: semAcento(`${enunciadoDaQuestao} ${registro.tese}`.replace(/¿/g, " ")) };
	});
	indice = { itens, frequencia };
	return indice;
}

interface Achado {
	registro: RegistroPrecedente;
	nota: number;
}

function pesquisar(base: BasePrecedentes, consulta: string, filtro: (r: RegistroPrecedente) => boolean): Achado[] {
	const { itens, frequencia } = indiceDaBase(base);
	const termos = [...new Set(termosDe(consulta))];
	if (termos.length === 0) throw new ErroFerramenta("Informe ao menos uma palavra significativa (três letras ou mais).");
	const peso = (t: string) => Math.log(1 + itens.length / (1 + (frequencia.get(t) ?? 0)));
	const total = termos.reduce((n, t) => n + peso(t), 0);
	const minimo = termos.length <= 2 ? 0.999 : 0.5;
	const frase = semAcento(consulta);
	const achados: Achado[] = [];
	for (const item of itens) {
		if (!filtro(item.registro)) continue;
		let coberto = 0;
		let pontos = 0;
		for (const t of termos) {
			const q = item.questao.has(t);
			const s = item.tese.has(t);
			if (q || s) {
				coberto += peso(t);
				pontos += peso(t) * (q && s ? 1.3 : 1);
			} else if (item.anotacoes.has(t)) {
				pontos += peso(t) * 0.3;
			}
		}
		if (coberto / total < minimo) continue;
		let nota = pontos / total;
		if (frase.length >= 8 && item.corrido.includes(frase)) nota += 1;
		achados.push({ registro: item.registro, nota });
	}
	// empate: STJ antes do STF, depois o número
	achados.sort((a, b) => b.nota - a.nota || (a.registro.tribunal === b.registro.tribunal ? a.registro.numero - b.registro.numero : a.registro.tribunal === "STJ" ? -1 : 1));
	return achados;
}

function itemDaBusca(r: RegistroPrecedente, indiceItem: number): string[] {
	const complemento = r.orgao_julgador || r.ramo_direito;
	const linhas = [`${indiceItem}. ${nomePrecedente(r)} — ${descricaoSituacao(r)}${complemento ? ` · ${complemento}` : ""} (${r.id})`];
	if (r.titulo) linhas.push(`   Tema: ${r.titulo}`);
	else if (r.questao) linhas.push(`   Questão: ${r.questao}`);
	if (!r.tese) linhas.push("   Tese: não há tese registrada.");
	else if (r.situacao === "rg_negada") linhas.push(`   Enunciado (literal; não é tese de mérito): ${r.tese}`);
	else linhas.push(`   Tese (literal${teseTruncada(r) ? ", INCOMPLETA na fonte" : ""}): ${r.tese}`);
	if (r.suspensao && r.situacao !== "transitado") linhas.push(`   Suspensão: ${r.suspensao}`);
	linhas.push(...linhasDeAlerta(r, "   ").filter((l) => l.includes("Atenção")));
	return linhas;
}

const ROTULO_SITUACAO: Record<SituacaoPrecedente, string> = {
	transitado: "transitados em julgado",
	tese_sem_transito: "com tese ainda sem trânsito em julgado",
	afetado: "afetados, em julgamento ou com mérito pendente",
	revisado: "com tese revisada",
	rg_negada: "com repercussão geral negada",
	cancelado: "cancelados",
	outro: "sem tese (controvérsias, SIRDR e pendentes)",
};

export const buscarPrecedentes: Ferramenta = {
	name: "buscar_precedentes",
	description:
		"Pesquisa os precedentes qualificados do STJ (temas repetitivos, IAC, temas de relevância) e do STF (temas de repercussão geral) pela questão jurídica, para saber se um caso tem precedente aplicável. A busca é por palavras da questão julgada e da tese, sem diferenciar acentos, maiúsculas e plural, e é determinística: a mesma consulta devolve sempre o mesmo resultado. Descreva a questão com os termos jurídicos do caso (ex.: \"prescrição PASEP saque\", \"medicamento não incorporado SUS\") e repita com outras formulações antes de concluir que não há precedente. Também aceita o número de um processo paradigma (ex.: \"REsp 1895936\", \"RE 1366243\"). O resultado separa: as teses TRANSITADAS EM JULGADO, que podem ser aplicadas; um bloco de ATENÇÃO com temas afetados ou de mérito pendente (com a suspensão de processos), teses ainda sem trânsito e teses revisadas; e os temas do STF com repercussão geral NEGADA, que não são tese de mérito. Os blocos de atenção devem ser informados ao usuário e não tratados como tese definitiva. Devolve o texto literal de cada tese.",
	annotations: SOMENTE_LEITURA,
	inputSchema: {
		type: "object",
		properties: {
			termo: { type: "string", description: "Palavras da questão jurídica, ou o número de um processo paradigma." },
			tribunal: { type: "string", enum: ["STJ", "STF"], description: "Restringe a um tribunal. Vazio: os dois." },
			orgao: { type: "string", enum: ORGAOS, description: "Só STJ. Restringe pelo órgão julgador: PRIMEIRA SEÇÃO (direito público), SEGUNDA SEÇÃO (direito privado), TERCEIRA SEÇÃO (penal), CORTE ESPECIAL." },
			ramo: { type: "string", description: 'Só STF. Restringe pelo ramo do direito, ex.: "tributário", "previdenciário", "penal".' },
			tipo: { type: "string", enum: ["tema", "iac", "relevancia", "controversia", "sirdr", "rg"], description: "Restringe pelo tipo. Vazio: temas repetitivos, IAC e temas de relevância do STJ e temas de repercussão geral do STF." },
			situacao: { type: "string", enum: SITUACOES, description: "Mostra só uma classe de situação (ex.: cancelado). Vazio: transitados, mais os blocos de atenção." },
			limite: { type: "integer", minimum: 1, maximum: 30, description: "Máximo de teses transitadas a devolver. Padrão: 8.", default: 8 },
		},
		required: ["termo"],
		additionalProperties: false,
	},
	executar(args) {
		const base = basePrecedentes();
		const termo = typeof args.termo === "string" ? args.termo.trim() : "";
		if (!termo) throw new ErroFerramenta('O parâmetro "termo" é obrigatório.');
		const orgao = lerOrgao(args.orgao);
		const ramo = typeof args.ramo === "string" ? semAcento(args.ramo) : "";
		const tipo = lerTipo(args.tipo, undefined);
		const tribunal = lerTribunal(args.tribunal) ?? (tipo ? tribunalDoTipo(tipo) : orgao ? "STJ" : ramo ? "STF" : undefined);
		const situacao = lerSituacao(args.situacao);
		const limiteBruto = Number(args.limite ?? 8);
		const limite = Math.min(30, Math.max(1, Number.isFinite(limiteBruto) ? Math.floor(limiteBruto) : 8));
		const doTipo = (r: RegistroPrecedente) => (tipo ? r.tipo === tipo : r.tipo === "TEMA" || r.tipo === "IAC" || r.tipo === "RELEVANCIA" || r.tipo === "RG" || situacao !== undefined);
		const filtro = (r: RegistroPrecedente) =>
			doTipo(r) && (!tribunal || r.tribunal === tribunal) && (!orgao || r.orgao_julgador === orgao) && (!ramo || semAcento(r.ramo_direito ?? "").includes(ramo));

		// número de processo paradigma
		const processo = /^([A-Za-zÀ-ú ]{0,24}?)\s*(?:n[.ºo°]{0,2}\s*)?(\d[\d.]{4,}\d)(?:\s*[/-]\s*[A-Za-z]{2})?$/.exec(termo);
		if (processo) {
			const achados = base.porParadigma(processo[2].replace(/\D/g, ""), tribunal ?? tribunalDaClasse(processo[1]));
			if (achados.length === 0) return Promise.resolve(texto(`Nenhum precedente da base tem como paradigma o processo "${termo}".\n\n${rodape(base)}`));
			const linhas = [`${achados.length} precedente(s) com o processo "${termo}" entre os paradigmas:`, ""];
			achados.forEach((r, i) => linhas.push(...itemDaBusca(r, i + 1), ""));
			linhas.push(rodape(base));
			return Promise.resolve(texto(linhas.join("\n")));
		}

		const achados = pesquisar(base, termo, filtro);
		const linhas: string[] = [];
		if (situacao) {
			const lista = achados.filter((a) => a.registro.situacao === situacao);
			linhas.push(`${lista.length} precedente(s) ${ROTULO_SITUACAO[situacao]} para "${termo}"${lista.length > limite ? `; mostrando ${limite}` : ""}:`, "");
			lista.slice(0, limite).forEach((a, i) => linhas.push(...itemDaBusca(a.registro, i + 1), ""));
		} else {
			const firmes = achados.filter((a) => a.registro.situacao === "transitado" && a.registro.tese);
			const atencao = achados.filter((a) => a.registro.situacao === "tese_sem_transito" || a.registro.situacao === "afetado" || a.registro.situacao === "revisado" || (a.registro.situacao === "transitado" && !a.registro.tese));
			const negadas = achados.filter((a) => a.registro.situacao === "rg_negada");
			const outros = achados.length - firmes.length - atencao.length - negadas.length;
			linhas.push(`TESES TRANSITADAS EM JULGADO para "${termo}": ${firmes.length}${firmes.length > limite ? `; mostrando as ${limite} mais próximas` : ""}`, "");
			if (firmes.length === 0) linhas.push("Nenhuma tese transitada em julgado casou com a consulta. Tente outra formulação (sinônimos, o instituto jurídico, o diploma legal) antes de concluir que não há precedente.", "");
			firmes.slice(0, limite).forEach((a, i) => linhas.push(...itemDaBusca(a.registro, i + 1), ""));
			const teto = Math.max(5, Math.ceil(limite / 2));
			if (atencao.length) {
				linhas.push(`ATENÇÃO — sem trânsito em julgado, afetados, de mérito pendente ou revisados: ${atencao.length}${atencao.length > teto ? `; mostrando ${teto}` : ""}. Informe ao usuário; não trate como tese definitiva.`, "");
				atencao.slice(0, teto).forEach((a, i) => linhas.push(...itemDaBusca(a.registro, i + 1), ""));
			}
			if (negadas.length) {
				linhas.push(`SEM REPERCUSSÃO GERAL (STF) — a repercussão geral foi negada; não há tese de mérito: ${negadas.length}${negadas.length > teto ? `; mostrando ${teto}` : ""}. Serve para saber que o STF considera a matéria infraconstitucional ou sem relevância.`, "");
				negadas.slice(0, teto).forEach((a, i) => linhas.push(...itemDaBusca(a.registro, i + 1), ""));
			}
			if (outros > 0) linhas.push(`Também casaram ${outros} registro(s) cancelado(s) ou sem tese; para vê-los, repita com situacao="cancelado" ou situacao="outro".`, "");
		}
		linhas.push(
			"A busca é por palavras: a aplicabilidade ao caso concreto depende de conferir a questão julgada e a tese com os fatos do processo. Ausência de resultado não prova que não exista precedente.",
			rodape(base),
		);
		return Promise.resolve(texto(linhas.join("\n")));
	},
};

// ---------------------------------------------------------------------------------------------

const ROTULO_RESULTADO: Record<ResultadoPrecedente, string> = {
	CONFERE_LITERAL: "CONFERE (literal)",
	CONFERE_TRECHO: "CONFERE (trecho literal)",
	CONFERE_COM_DIFERENCA_DE_FORMA: "CONFERE NAS PALAVRAS, DIFERE NA FORMA",
	DIVERGENTE: "DIVERGENTE",
	SEM_TRANSCRICAO: "SEM TRANSCRIÇÃO (só a referência)",
	AMBIGUA: "SEM TRIBUNAL (não conferida)",
	NAO_ENCONTRADO_NA_BASE: "NÃO ENCONTRADO NA BASE",
};

const TEXTO_VEREDITO: Record<VereditoPrecedentes, string> = {
	INTEGRALMENTE_VERIFICADO: "INTEGRALMENTE VERIFICADO — toda transcrição confere com a tese oficial e todos os precedentes citados transitaram em julgado, sem ressalva.",
	VERIFICADO_COM_RESSALVAS: "VERIFICADO COM RESSALVAS — nenhuma palavra diverge, mas há precedente sem trânsito em julgado, afetado, revisado, de repercussão geral negada ou com aviso de revisão, tese incompleta na fonte, referência sem tribunal ou diferença de forma. Veja os itens.",
	NAO_VERIFICADO: "NÃO VERIFICADO — há transcrição divergente, precedente ausente da base ou precedente cancelado citado sem ressalva. Corrija os itens antes de entregar o texto.",
	SEM_REFERENCIAS: "SEM REFERÊNCIAS — o detector não encontrou referência numerada a tema do STJ ou do STF nem a IAC do STJ.",
};

function itemRelatorio(c: ConferenciaPrecedente, indiceItem: number): string[] {
	const linhas = [`${indiceItem}. Linha ${c.linha} — "${c.mencao}" → ${ROTULO_RESULTADO[c.resultado]}`];
	const r = c.precedente;
	if (r) linhas.push(`   ${nomePrecedente(r)} — situação no ${r.tribunal}: ${descricaoSituacao(r)} (${r.id})`);
	if (c.alertaSituacao) linhas.push(`   ALERTA: ${c.alertaSituacao}`);
	if (c.transcricao && c.resultado !== "CONFERE_LITERAL") linhas.push(`   Citado:  “${c.transcricao}”`);
	if (r?.tese && c.resultado !== "CONFERE_LITERAL" && c.resultado !== "CONFERE_TRECHO") linhas.push(`   Oficial: “${r.tese}”`);
	if (c.diferencas?.length) {
		const lista = c.diferencas.slice(0, 12).map((d) => (d.citado && d.oficial ? `citado «${d.citado}» × oficial «${d.oficial}»` : d.citado ? `sobra no citado «${d.citado}»` : `falta no citado «${d.oficial}»`));
		linhas.push(`   Diferenças: ${lista.join("; ")}${c.diferencas.length > 12 ? "; …" : ""}`);
	}
	for (const nota of c.notas) linhas.push(`   Nota: ${nota}`);
	return linhas;
}

export function relatorioPrecedentesEmTexto(relatorio: RelatorioPrecedentes, base: BasePrecedentes): string {
	const linhas = ["VERIFICAÇÃO DE PRECEDENTES QUALIFICADOS (STJ E STF)", `Veredito: ${TEXTO_VEREDITO[relatorio.veredito]}`];
	if (relatorio.conferencias.length > 0) {
		const partes = Object.entries(relatorio.contagem).map(([k, v]) => `${v} ${k === "ALERTA_DE_SITUACAO" ? "alerta(s) de situação" : ROTULO_RESULTADO[k as ResultadoPrecedente].toLowerCase()}`);
		linhas.push(`Referências conferidas: ${relatorio.conferencias.length} (${partes.join("; ")}).`, "");
		relatorio.conferencias.forEach((c, i) => linhas.push(...itemRelatorio(c, i + 1), ""));
	} else {
		linhas.push("");
	}
	if (relatorio.paradigmasCitados.length) {
		linhas.push("Processos citados que são paradigma de precedente qualificado (confira se o texto deveria invocar o tema):");
		for (const p of relatorio.paradigmasCitados) {
			linhas.push(`   Linha ${p.linha} — "${p.mencao}": ${p.precedentes.map((r) => `${nomePrecedente(r)} [${r.situacao_original}]`).join("; ")}`);
		}
		linhas.push("");
	}
	if (relatorio.foraDoEscopo.length) {
		linhas.push("Referências que a base não cobre (não conferidas):", ...relatorio.foraDoEscopo.map((f) => `   Linha ${f.linha} — "${f.mencao}" (${f.tribunal})`), "");
	}
	linhas.push(
		"Alcance: a conferência é feita por código, sem modelo de linguagem, e cobre as referências numeradas a tema e a IAC que o detector reconheceu. Confere a existência, a situação e o texto transcrito; não avalia se a tese se aplica ao caso.",
		rodape(base),
	);
	if (base.adulterados.length) linhas.push(`Aviso: ${base.adulterados.length} registro(s) da base foram descartados por falha de integridade.`);
	return linhas.join("\n");
}

function relatorioEmJson(relatorio: RelatorioPrecedentes): string {
	return JSON.stringify(
		{
			veredito: relatorio.veredito,
			versao_base: relatorio.versaoBase,
			contagem: relatorio.contagem,
			fora_do_escopo: relatorio.foraDoEscopo,
			paradigmas_citados: relatorio.paradigmasCitados.map((p) => ({ linha: p.linha, mencao: p.mencao, precedentes: p.precedentes.map((r) => r.id) })),
			referencias: relatorio.conferencias.map((c) => ({
				linha: c.linha,
				mencao: c.mencao,
				resultado: c.resultado,
				id: c.precedente?.id,
				tribunal: c.precedente?.tribunal,
				situacao: c.precedente?.situacao,
				situacao_original: c.precedente?.situacao_original,
				alerta_situacao: c.alertaSituacao,
				ressalva: c.ressalva,
				citado: c.transcricao,
				oficial: c.precedente?.tese || undefined,
				diferencas: c.diferencas,
				notas: c.notas,
				sha256_tese: c.precedente?.sha256_tese || undefined,
			})),
		},
		null,
		2,
	);
}

export const verificarCitacoesPrecedentes: Ferramenta = {
	name: "verificar_citacoes_precedentes",
	description:
		"Confere, por código e sem modelo de linguagem, todas as referências a temas repetitivos e IAC do STJ e a temas de repercussão geral do STF em um texto jurídico (minuta, voto, decisão, petição). Para cada referência, diz se o precedente existe, qual a situação (trânsito em julgado, sem trânsito, afetado, revisado, repercussão geral negada, cancelado), se a tese transcrita confere palavra por palavra com a tese oficial, e mostra as diferenças. Aponta precedente cancelado citado sem ressalva, tema de repercussão geral negada citado como tese e número que não corresponde ao texto transcrito. Termina com um veredito do documento. Use ao analisar um documento recebido e SEMPRE antes de entregar um texto que cite tema do STJ ou do STF. A ferramenta não altera o texto: aplique você as correções e verifique de novo.",
	annotations: SOMENTE_LEITURA,
	inputSchema: {
		type: "object",
		properties: {
			texto: { type: "string", description: "Texto integral a conferir, exatamente como está (não resuma nem reescreva)." },
			formato: { type: "string", enum: ["texto", "json"], description: "Formato do relatório. Padrão: texto.", default: "texto" },
		},
		required: ["texto"],
		additionalProperties: false,
	},
	executar(args) {
		const base = basePrecedentes();
		if (typeof args.texto !== "string" || args.texto.trim() === "") throw new ErroFerramenta('O parâmetro "texto" é obrigatório.');
		const relatorio = verificarPrecedentes(args.texto, base);
		return Promise.resolve(texto(args.formato === "json" ? relatorioEmJson(relatorio) : relatorioPrecedentesEmTexto(relatorio, base)));
	},
};

export const FERRAMENTAS_PRECEDENTES_NUCLEO: Ferramenta[] = [obterPrecedente, buscarPrecedentes, verificarCitacoesPrecedentes];

export const INSTRUCOES_PRECEDENTES =
	"Precedentes qualificados (temas repetitivos e IAC do STJ; temas de repercussão geral do STF): nunca transcreva tese de memória. Ao analisar um processo, chame buscar_precedentes com a questão jurídica, em duas ou três formulações, para saber se há precedente aplicável; antes de citar, chame obter_precedente (tribunal=\"STF\" para tema do STF) e copie a tese devolvida. Só trate como tese definitiva o precedente com trânsito em julgado; tema afetado ou de mérito pendente (com a suspensão de processos), tese sem trânsito, tese revisada e os avisos devolvidos devem ser informados ao usuário. Tema do STF com repercussão geral negada não é tese de mérito. Tese marcada como incompleta na fonte não pode ser completada de memória. Antes de entregar um texto que cite tema do STJ ou do STF, chame verificar_citacoes_precedentes com o texto integral e corrija o que não conferir.";
