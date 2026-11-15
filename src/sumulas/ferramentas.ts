import { ErroFerramenta, Ferramenta, ResultadoFerramenta } from "../mcp/tipos";
import { Base, baseSumulas, nomeSumula, resumoCobertura, rotuloConjunto } from "./base";
import { Conferencia, Relatorio, Resultado, Veredito, verificarTexto } from "./comparador";
import { semAcento } from "./normalizar";
import type { RegistroSumula, TipoSumula, Tribunal } from "./tipos";

const SOMENTE_LEITURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

function texto(conteudo: string): ResultadoFerramenta {
	return { content: [{ type: "text", text: conteudo }] };
}

function lerTribunal(valor: unknown, obrigatorio: boolean): { tribunal?: Tribunal; vinculante: boolean } {
	if (valor === undefined || valor === null || valor === "") {
		if (obrigatorio) throw new ErroFerramenta('O parâmetro "tribunal" é obrigatório: STF, STJ ou TJPE.');
		return { vinculante: false };
	}
	const t = (typeof valor === "string" ? valor : "").trim().toUpperCase().replace(/[-/ ]/g, "");
	if (t === "SV") return { tribunal: "STF", vinculante: true };
	if (t === "STF" || t === "STJ" || t === "TJPE") return { tribunal: t, vinculante: false };
	throw new ErroFerramenta('O parâmetro "tribunal" deve ser STF, STJ ou TJPE (ou SV para súmula vinculante).');
}

function lerTipo(valor: unknown, vinculante: boolean): TipoSumula {
	if (valor === undefined || valor === null || valor === "") return vinculante ? "vinculante" : "comum";
	const t = semAcento(typeof valor === "string" ? valor : "");
	if (t.startsWith("vinc") || t === "sv") return "vinculante";
	if (t.startsWith("com") || t === "sum" || t === "sumula") return "comum";
	throw new ErroFerramenta('O parâmetro "tipo" deve ser "comum" ou "vinculante".');
}

function lerNumero(valor: unknown): number {
	const n = typeof valor === "number" ? valor : Number((typeof valor === "string" ? valor : "").replace(/\D/g, "") || NaN);
	if (!Number.isInteger(n) || n < 1) throw new ErroFerramenta('O parâmetro "numero" deve ser o número da súmula (inteiro positivo).');
	return n;
}

function rodape(base: Base): string {
	return `Base de súmulas Projurista ${base.versao} (${resumoCobertura(base)}).`;
}

function avisoSituacao(r: RegistroSumula): string {
	switch (r.situacao) {
		case "vigente":
			return "";
		case "cancelada":
		case "revogada":
		case "superada":
			return `ATENÇÃO: súmula ${r.situacao}. Não cite como entendimento vigente; só como histórico, dizendo a situação.`;
		case "alterada":
			return "ATENÇÃO: súmula alterada. Confira na observação qual redação está em vigor antes de citar.";
		case "pendente-de-publicacao":
			return "ATENÇÃO: súmula pendente de publicação. Não há enunciado publicado para citar.";
		default:
			return `ATENÇÃO: situação "${r.situacao}" na fonte oficial. Confira antes de citar.`;
	}
}

function fichaSumula(r: RegistroSumula): string[] {
	const nome = nomeSumula(r.tribunal, r.tipo, r.numero);
	const linhas: string[] = [];
	const aviso = avisoSituacao(r);
	if (aviso) linhas.push(aviso, "");
	linhas.push(`${nome} — situação: ${r.situacao}`, "", "Enunciado (texto literal da fonte oficial):", r.enunciado, "");
	if (r.situacao !== "pendente-de-publicacao") linhas.push("Citação pronta (copie sem alterar):", `${nome}: “${r.enunciado}”`, "");
	if (r.observacao) linhas.push(`Observação: ${r.observacao}`);
	for (const v of r.variantes ?? []) linhas.push(`Redação em outra publicação oficial (${v.fonte}): ${v.texto}`);
	if (r.orgao_julgador) linhas.push(`Órgão julgador: ${r.orgao_julgador}`);
	if (r.data_aprovacao) linhas.push(`Aprovação: ${r.data_aprovacao}`);
	if (r.referencia_publicacao) linhas.push(`Publicação: ${r.referencia_publicacao}`);
	if (r.referencia_oficial) linhas.push(`Referência: ${r.referencia_oficial}`);
	if (r.url_fonte) linhas.push(`Fonte: ${r.url_fonte}${r.data_fonte ? ` (conferida em ${r.data_fonte})` : ""}`);
	linhas.push(`Identificador: ${r.id} · sha256 do enunciado: ${r.sha256_texto}`);
	return linhas;
}

export const obterSumula: Ferramenta = {
	name: "obter_sumula",
	description:
		"Devolve o enunciado LITERAL de uma súmula do STF (comum ou vinculante), do STJ ou do TJPE, copiado da fonte oficial, com a situação (vigente, cancelada, revogada, superada, alterada), a fonte e a citação pronta. Use SEMPRE antes de transcrever uma súmula em qualquer texto: nunca escreva o enunciado de memória. Se a súmula não estiver na base, a ferramenta diz isso; não reconstrua o texto.",
	annotations: SOMENTE_LEITURA,
	inputSchema: {
		type: "object",
		properties: {
			tribunal: { type: "string", enum: ["STF", "STJ", "TJPE"], description: "Tribunal da súmula." },
			numero: { type: "integer", minimum: 1, description: "Número da súmula." },
			tipo: { type: "string", enum: ["comum", "vinculante"], description: 'Use "vinculante" para Súmula Vinculante do STF. Padrão: comum.', default: "comum" },
		},
		required: ["tribunal", "numero"],
		additionalProperties: false,
	},
	executar(args) {
		const base = baseSumulas();
		const { tribunal, vinculante } = lerTribunal(args.tribunal, true);
		const tipo = lerTipo(args.tipo, vinculante);
		const numero = lerNumero(args.numero);
		if (tipo === "vinculante" && tribunal !== "STF") throw new ErroFerramenta("Súmula vinculante só existe no STF.");
		const registro = base.obter(tribunal!, tipo, numero);
		if (!registro) {
			const c = base.cobertura[rotuloConjunto(tribunal!, tipo)];
			return Promise.resolve(
				texto(
					[
						`NÃO ENCONTRADA NA BASE: ${nomeSumula(tribunal!, tipo, numero)}.`,
						c ? `A base cobre deste conjunto os números ${c.de} a ${c.ate}, conforme a fonte oficial de ${c.data_fonte}.` : "",
						"Isso não significa que a súmula não exista: pode ser posterior à fonte usada. Não escreva o enunciado de memória; confira no portal do tribunal e avise o usuário.",
						"",
						rodape(base),
					]
						.filter((l, i) => l !== "" || i === 3)
						.join("\n"),
				),
			);
		}
		return Promise.resolve(texto([...fichaSumula(registro), "", rodape(base)].join("\n")));
	},
};

export const buscarSumulas: Ferramenta = {
	name: "buscar_sumulas",
	description:
		"Pesquisa súmulas do STF, do STJ e do TJPE por palavras do enunciado (sem diferenciar acentos nem maiúsculas). Todas as palavras do termo precisam constar do enunciado. Devolve o texto literal e a situação de cada resultado. Para citar, use o texto devolvido ou chame obter_sumula.",
	annotations: SOMENTE_LEITURA,
	inputSchema: {
		type: "object",
		properties: {
			termo: { type: "string", description: 'Palavras ou expressão a procurar, ex.: "reexame de prova" ou "fornecimento medicamentos".' },
			tribunal: { type: "string", enum: ["STF", "STJ", "TJPE"], description: "Restringe a um tribunal. Vazio: todos." },
			situacao: { type: "string", description: 'Restringe pela situação, ex.: "vigente". Vazio: todas.' },
			limite: { type: "integer", minimum: 1, maximum: 50, description: "Máximo de resultados. Padrão: 10.", default: 10 },
		},
		required: ["termo"],
		additionalProperties: false,
	},
	executar(args) {
		const base = baseSumulas();
		const termoBruto = typeof args.termo === "string" ? args.termo.trim() : "";
		if (!termoBruto) throw new ErroFerramenta('O parâmetro "termo" é obrigatório.');
		const { tribunal } = lerTribunal(args.tribunal, false);
		const situacao = typeof args.situacao === "string" ? semAcento(args.situacao) : "";
		const limiteBruto = Number(args.limite ?? 10);
		const limite = Math.min(50, Math.max(1, Number.isFinite(limiteBruto) ? Math.floor(limiteBruto) : 10));
		const frase = semAcento(termoBruto);
		const termos = frase.split(/[^0-9a-z]+/).filter((t) => t.length > 1);
		if (termos.length === 0) throw new ErroFerramenta("Informe ao menos uma palavra com duas letras ou mais.");

		const achados: { registro: RegistroSumula; nota: number }[] = [];
		for (const registro of base.todas) {
			if (tribunal && registro.tribunal !== tribunal) continue;
			if (situacao && semAcento(registro.situacao) !== situacao) continue;
			const alvo = semAcento(registro.enunciado);
			if (!termos.every((t) => alvo.includes(t))) continue;
			let nota = 0;
			if (alvo.includes(frase)) nota += 10;
			for (const t of termos) if (new RegExp(`(^|[^0-9a-z])${t}([^0-9a-z]|$)`).test(alvo)) nota += 1;
			if (registro.situacao === "vigente") nota += 0.5;
			achados.push({ registro, nota });
		}
		achados.sort((a, b) => b.nota - a.nota || a.registro.numero - b.registro.numero);
		if (achados.length === 0) {
			return Promise.resolve(texto(`Nenhuma súmula da base contém todas as palavras de "${termoBruto}". Tente menos palavras ou um sinônimo.\n\n${rodape(base)}`));
		}
		const linhas = [`${achados.length} súmula(s) com "${termoBruto}"${achados.length > limite ? `; mostrando ${limite}` : ""}:`, ""];
		for (const { registro: r } of achados.slice(0, limite)) {
			linhas.push(`${nomeSumula(r.tribunal, r.tipo, r.numero)} [${r.situacao}] (${r.id})`, r.enunciado, "");
		}
		linhas.push(rodape(base));
		return Promise.resolve(texto(linhas.join("\n")));
	},
};

const ROTULO_RESULTADO: Record<Resultado, string> = {
	CONFERE_LITERAL: "CONFERE (literal)",
	CONFERE_TRECHO: "CONFERE (trecho literal)",
	CONFERE_VARIANTE_OFICIAL: "CONFERE COM OUTRA PUBLICAÇÃO OFICIAL",
	CONFERE_COM_DIFERENCA_DE_FORMA: "CONFERE NAS PALAVRAS, DIFERE NA FORMA",
	DIVERGENTE: "DIVERGENTE",
	SEM_TRANSCRICAO: "SEM TRANSCRIÇÃO (só a referência)",
	AMBIGUA: "AMBÍGUA",
	NAO_ENCONTRADA_NA_BASE: "NÃO ENCONTRADA NA BASE",
};

const TEXTO_VEREDITO: Record<Veredito, string> = {
	INTEGRALMENTE_VERIFICADO: "INTEGRALMENTE VERIFICADO — toda transcrição confere com o texto oficial e nenhuma súmula citada está fora de vigor.",
	VERIFICADO_COM_RESSALVAS: "VERIFICADO COM RESSALVAS — nenhuma palavra diverge, mas há diferença de forma, redação de outra publicação oficial ou súmula não vigente citada com ressalva. Veja os itens.",
	NAO_VERIFICADO: "NÃO VERIFICADO — há transcrição divergente, referência ambígua, súmula ausente da base ou súmula fora de vigor citada sem ressalva. Corrija os itens antes de entregar o texto.",
	SEM_REFERENCIAS: "SEM REFERÊNCIAS — o detector não encontrou referência numerada a súmula do STF, do STJ ou do TJPE.",
};

function itemRelatorio(c: Conferencia, indice: number): string[] {
	const linhas = [`${indice}. Linha ${c.linha} — "${c.mencao}" → ${ROTULO_RESULTADO[c.resultado]}`];
	const r = c.sumula;
	if (r) linhas.push(`   ${nomeSumula(r.tribunal, r.tipo, r.numero)} — situação: ${r.situacao} (${r.id})`);
	if (c.alertaSituacao) linhas.push(`   ALERTA: ${c.alertaSituacao}`);
	if (c.transcricao && c.resultado !== "CONFERE_LITERAL") linhas.push(`   Citado:  “${c.transcricao}”`);
	if (r && c.resultado !== "CONFERE_LITERAL" && c.resultado !== "CONFERE_TRECHO") linhas.push(`   Oficial: “${r.enunciado}”`);
	if (c.diferencas?.length) {
		const lista = c.diferencas.slice(0, 12).map((d) => (d.citado && d.oficial ? `citado «${d.citado}» × oficial «${d.oficial}»` : d.citado ? `sobra no citado «${d.citado}»` : `falta no citado «${d.oficial}»`));
		linhas.push(`   Diferenças: ${lista.join("; ")}${c.diferencas.length > 12 ? "; …" : ""}`);
	}
	for (const cand of c.candidatas ?? []) linhas.push(`   Candidata: ${nomeSumula(cand.tribunal, cand.tipo, cand.numero)} [${cand.situacao}] — “${cand.enunciado}”`);
	for (const nota of c.notas) linhas.push(`   Nota: ${nota}`);
	if (r?.url_fonte && c.resultado !== "CONFERE_LITERAL") linhas.push(`   Fonte: ${r.url_fonte}`);
	return linhas;
}

export function relatorioEmTexto(relatorio: Relatorio, base: Base): string {
	const linhas = ["VERIFICAÇÃO DE SÚMULAS", `Veredito: ${TEXTO_VEREDITO[relatorio.veredito]}`];
	if (relatorio.conferencias.length > 0) {
		const partes = Object.entries(relatorio.contagem).map(([k, v]) => `${v} ${k === "ALERTA_DE_SITUACAO" ? "alerta(s) de situação" : ROTULO_RESULTADO[k as Resultado].toLowerCase()}`);
		linhas.push(`Referências encontradas: ${relatorio.conferencias.length} (${partes.join("; ")}).`, "");
		relatorio.conferencias.forEach((c, i) => linhas.push(...itemRelatorio(c, i + 1), ""));
	} else {
		linhas.push("");
	}
	if (relatorio.foraDoEscopo.length) {
		linhas.push(
			"Súmulas de outros tribunais, que a base não cobre (não conferidas):",
			...relatorio.foraDoEscopo.map((f) => `   Linha ${f.linha} — "${f.mencao}"`),
			"",
		);
	}
	linhas.push(
		"Alcance: a conferência é feita por código, sem modelo de linguagem, e cobre as referências numeradas que o detector reconheceu. Súmula mencionada só pelo assunto, sem número, não é alcançada.",
		rodape(base),
	);
	if (base.adulterados.length) linhas.push(`Aviso: ${base.adulterados.length} registro(s) da base foram descartados por falha de integridade.`);
	return linhas.join("\n");
}

function relatorioEmJson(relatorio: Relatorio): string {
	return JSON.stringify(
		{
			veredito: relatorio.veredito,
			versao_base: relatorio.versaoBase,
			contagem: relatorio.contagem,
			fora_do_escopo: relatorio.foraDoEscopo,
			referencias: relatorio.conferencias.map((c) => ({
				linha: c.linha,
				mencao: c.mencao,
				resultado: c.resultado,
				id: c.sumula?.id,
				situacao: c.sumula?.situacao,
				alerta_situacao: c.alertaSituacao,
				citado: c.transcricao,
				oficial: c.sumula?.enunciado,
				diferencas: c.diferencas,
				candidatas: c.candidatas?.map((r) => r.id),
				notas: c.notas,
				fonte: c.sumula?.url_fonte,
				sha256_texto: c.sumula?.sha256_texto,
			})),
		},
		null,
		2,
	);
}

export const verificarCitacoesSumulas: Ferramenta = {
	name: "verificar_citacoes_sumulas",
	description:
		"Confere, por código e sem modelo de linguagem, todas as referências a súmulas do STF, do STJ e do TJPE em um texto jurídico (minuta, voto, petição, parecer). Para cada referência, diz se a transcrição confere palavra por palavra com o enunciado oficial, mostra as diferenças, devolve o texto literal e alerta para súmula cancelada, revogada ou superada. Termina com um veredito do documento. Use ao analisar um documento recebido e SEMPRE antes de entregar um texto que cite súmulas. A ferramenta não altera o texto: aplique você as correções e verifique de novo.",
	annotations: SOMENTE_LEITURA,
	inputSchema: {
		type: "object",
		properties: {
			texto: { type: "string", description: "Texto integral a conferir, exatamente como está (não resuma nem reescreva)." },
			tribunal_padrao: {
				type: "string",
				enum: ["STF", "STJ", "TJPE"],
				description: 'Tribunal a presumir quando o texto diz só "Súmula 7" ou "súmula deste Tribunal". Sem ele, essas referências saem como ambíguas.',
			},
			formato: { type: "string", enum: ["texto", "json"], description: "Formato do relatório. Padrão: texto.", default: "texto" },
		},
		required: ["texto"],
		additionalProperties: false,
	},
	executar(args) {
		const base = baseSumulas();
		if (typeof args.texto !== "string" || args.texto.trim() === "") throw new ErroFerramenta('O parâmetro "texto" é obrigatório.');
		const { tribunal } = lerTribunal(args.tribunal_padrao, false);
		const relatorio = verificarTexto(args.texto, base, { tribunalPadrao: tribunal });
		return Promise.resolve(texto(args.formato === "json" ? relatorioEmJson(relatorio) : relatorioEmTexto(relatorio, base)));
	},
};

export const FERRAMENTAS_SUMULAS_NUCLEO: Ferramenta[] = [obterSumula, buscarSumulas, verificarCitacoesSumulas];

export const INSTRUCOES_SUMULAS =
	"Súmulas do STF, do STJ e do TJPE: nunca transcreva enunciado de memória. Antes de citar, chame obter_sumula e copie o texto devolvido; para achar a súmula pelo assunto, use buscar_sumulas. Ao analisar um documento ou antes de entregar um texto que cite súmulas, chame verificar_citacoes_sumulas com o texto integral e corrija o que não conferir.";
