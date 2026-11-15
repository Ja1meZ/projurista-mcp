import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { baseSumulas, verificarTexto, detectarReferencias, cotejar, comparavel, obterSumula, buscarSumulas, verificarCitacoesSumulas } from "../dist/nucleo-sumulas.mjs";

const base = baseSumulas();
const stj7 = base.obter("STJ", "comum", 7);
const stj83 = base.obter("STJ", "comum", 83);
const sv10 = base.obter("STF", "vinculante", 10);
const tjpe130 = base.obter("TJPE", "comum", 130);
const verificar = (texto, opcoes) => verificarTexto(texto, base, opcoes);
const unica = (texto, opcoes) => {
	const r = verificar(texto, opcoes);
	assert.equal(r.conferencias.length, 1, JSON.stringify(r.conferencias.map((c) => c.mencao)));
	return { ...r.conferencias[0], veredito: r.veredito };
};

test("a base carrega íntegra e completa", () => {
	assert.equal(base.adulterados.length, 0);
	assert.equal(base.cobertura["STF:SV"].total, 63);
	assert.equal(base.cobertura["STF:SUM"].total, 736);
	assert.ok(base.cobertura["STJ:SUM"].total >= 676);
	assert.equal(base.cobertura["TJPE:SUM"].total, 200);
	for (const c of Object.values(base.cobertura)) assert.deepEqual(c.lacunas, []);
	assert.ok(stj7 && stj83 && sv10 && tjpe130);
});

test("citação literal confere", () => {
	const c = unica(`Incide a Súmula n. 7 do STJ: “${stj7.enunciado}”`);
	assert.equal(c.resultado, "CONFERE_LITERAL");
	assert.equal(c.sumula.id, "STJ:SUM:7");
	assert.equal(c.veredito, "INTEGRALMENTE_VERIFICADO");
});

test("aspas retas, ponto fora das aspas e citação antes da referência", () => {
	const semPonto = stj7.enunciado.replace(/\.$/, "");
	assert.equal(unica(`Nos termos da Súmula 7/STJ, "${semPonto}".`).resultado, "CONFERE_LITERAL");
	assert.equal(unica(`“${stj7.enunciado}” (Súmula 7/STJ).`).resultado, "CONFERE_LITERAL");
});

test("uma palavra trocada é divergência, com a diferença apontada", () => {
	const errado = stj7.enunciado.replace("recurso especial", "recurso extraordinário");
	assert.notEqual(errado, stj7.enunciado);
	const c = unica(`Súmula 7 do STJ: “${errado}”`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.equal(c.veredito, "NAO_VERIFICADO");
	assert.ok(c.diferencas.some((d) => /extraordin/.test(d.citado) && /especial/.test(d.oficial)));
});

test("palavra omitida é divergência", () => {
	const errado = stj7.enunciado.replace("simples ", "");
	assert.notEqual(errado, stj7.enunciado);
	const c = unica(`Súmula 7 do STJ: “${errado}”`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.ok(c.diferencas.some((d) => d.citado === "" && /simples/.test(d.oficial)));
});

test("número errado para o texto transcrito", () => {
	const c = unica(`Conforme a Súmula 83 do STJ, “${stj7.enunciado}”`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.ok(c.notas.some((n) => n.includes("Súmula n. 7 do STJ")), c.notas.join(" | "));
});

test("referência sem tribunal: ambígua, resolvida pelo texto ou pelo tribunal_padrao", () => {
	assert.equal(unica("Aplica-se a Súmula 7.").resultado, "AMBIGUA");
	assert.equal(verificar("Aplica-se a Súmula 7.").veredito, "NAO_VERIFICADO");
	const peloTexto = unica(`Aplica-se a Súmula 7: “${stj7.enunciado}”`);
	assert.equal(peloTexto.resultado, "CONFERE_LITERAL");
	assert.equal(peloTexto.sumula.id, "STJ:SUM:7");
	const peloPadrao = unica("Aplica-se a Súmula 130 deste Tribunal.", { tribunalPadrao: "TJPE" });
	assert.equal(peloPadrao.sumula.id, "TJPE:SUM:130");
	assert.equal(peloPadrao.resultado, "SEM_TRANSCRICAO");
});

test("só a referência, sem transcrição", () => {
	const c = unica("O recurso esbarra na Súmula n. 7 do Superior Tribunal de Justiça.");
	assert.equal(c.resultado, "SEM_TRANSCRICAO");
	assert.equal(c.sumula.id, "STJ:SUM:7");
	assert.equal(c.veredito, "INTEGRALMENTE_VERIFICADO");
});

test("súmula cancelada citada como vigente gera alerta; com ressalva, não", () => {
	const cancelada = base.todas.find((r) => r.tribunal === "STJ" && r.situacao === "cancelada");
	const c = unica(`Incide a Súmula ${cancelada.numero} do STJ.`);
	assert.ok(c.alertaSituacao);
	assert.equal(c.veredito, "NAO_VERIFICADO");
	const r = unica(`A Súmula ${cancelada.numero} do STJ, hoje cancelada, dispunha em outro sentido.`);
	assert.equal(r.alertaSituacao, undefined);
	assert.equal(r.veredito, "VERIFICADO_COM_RESSALVAS");
});

test("súmula ausente da base não é dada como inexistente", () => {
	const c = unica("Súmula 999 do STJ.");
	assert.equal(c.resultado, "NAO_ENCONTRADA_NA_BASE");
	assert.ok(c.notas.some((n) => n.includes("não significa")));
	assert.equal(c.veredito, "NAO_VERIFICADO");
});

test("formas de referência", () => {
	const ids = (t, o) => verificar(t, o).conferencias.map((c) => c.sumula?.id ?? c.resultado);
	assert.deepEqual(ids("Súmulas 7 e 83 do STJ"), ["STJ:SUM:7", "STJ:SUM:83"]);
	assert.deepEqual(ids("Súmulas n. 282 e 356 do STF"), ["STF:SUM:282", "STF:SUM:356"]);
	assert.deepEqual(ids("Súmulas 5, 7 e 83/STJ"), ["STJ:SUM:5", "STJ:SUM:7", "STJ:SUM:83"]);
	assert.deepEqual(ids("Súmula Vinculante n. 10"), ["STF:SV:10"]);
	assert.deepEqual(ids("SV 10"), ["STF:SV:10"]);
	assert.deepEqual(ids("SV 10/STF"), ["STF:SV:10"]);
	assert.deepEqual(ids("enunciado n. 7 da Súmula do STJ"), ["STJ:SUM:7"]);
	assert.deepEqual(ids("Súmula nº 7 do Superior Tribunal de Justiça"), ["STJ:SUM:7"]);
	assert.deepEqual(ids("Súmula STJ n. 7"), ["STJ:SUM:7"]);
	assert.deepEqual(ids("Súmula 279 do Supremo Tribunal Federal"), ["STF:SUM:279"]);
	assert.deepEqual(ids("Súmula 130 do TJPE"), ["TJPE:SUM:130"]);
	assert.deepEqual(ids("Súmula n. 130 do Tribunal de Justiça de Pernambuco"), ["TJPE:SUM:130"]);
	assert.deepEqual(ids("Súmula 130 do TJ-PE"), ["TJPE:SUM:130"]);
	assert.deepEqual(ids("súmula deste tribunal sobre o tema"), []);
	assert.deepEqual(ids("a jurisprudência sumulada do STJ e o Tema 1234"), []);
});

test("formas das minutas reais: prefixo, lista mista, outro tribunal, anáfora, minúscula inicial", () => {
	const ids = (t, o) => verificar(t, o).conferencias.map((c) => c.sumula?.id ?? c.resultado);
	assert.deepEqual(ids("STF, Súmula n. 20; STF, Súmula Vinculante n. 5; STJ, Súmulas n. 105, 592 e 665; TJPE, Súmula nº 130"), ["STF:SUM:20", "STF:SV:5", "STJ:SUM:105", "STJ:SUM:592", "STJ:SUM:665", "TJPE:SUM:130"]);
	assert.deepEqual(ids("Súmulas n. 7 e 83 do STJ e n. 279 do STF."), ["STJ:SUM:7", "STJ:SUM:83", "STF:SUM:279"]);
	assert.deepEqual(ids("Súmulas 7 do Superior Tribunal de Justiça e 279 e 280 do STF"), ["STJ:SUM:7", "STF:SUM:279", "STF:SUM:280"]);
	const fora = verificar("Súmula nº 15 do Tribunal de Contas do Estado de Pernambuco, Súmula 111 do extinto Tribunal Federal de Recursos e TST, Súmula n. 331.", { tribunalPadrao: "TJPE" });
	assert.equal(fora.conferencias.length, 0);
	assert.equal(fora.foraDoEscopo.length, 3);
	const anafora = verificar("A Súmula 314 do Superior Tribunal de Justiça trata do tema. Afirma que a Súmula 314 não se aplica.", { tribunalPadrao: "TJPE" });
	assert.deepEqual(anafora.conferencias.map((c) => c.sumula?.id), ["STJ:SUM:314", "STJ:SUM:314"]);
	assert.equal(unica("Súmula 314.", { tribunalPadrao: "TJPE" }).resultado, "AMBIGUA");
	const minuscula = stj7.enunciado.charAt(0).toLowerCase() + stj7.enunciado.slice(1).replace(/\.$/, "");
	assert.equal(unica(`É o que diz a Súmula n. 7 do STJ, segundo a qual “${minuscula}”.`).resultado, "CONFERE_LITERAL");
	assert.equal(unica(`Súmula n. 7 do STJ: “[${stj7.enunciado.charAt(0).toLowerCase()}]${stj7.enunciado.slice(1)}”`).resultado, "CONFERE_LITERAL");
});

test("diferença só de forma não é divergência de palavras", () => {
	const forma = tjpe130.enunciado.replace(/,/g, "").toUpperCase();
	const c = unica(`Súmula 130 do TJPE: “${forma}”`);
	assert.equal(c.resultado, "CONFERE_COM_DIFERENCA_DE_FORMA");
	assert.equal(c.veredito, "VERIFICADO_COM_RESSALVAS");
});

test("trecho literal e trecho com reticências", () => {
	const p = stj7.enunciado.split(" ");
	const trecho = p.slice(0, 5).join(" ");
	assert.equal(unica(`Súmula 7 do STJ: “${trecho}”`).resultado, "CONFERE_TRECHO");
	const comCorte = `${p.slice(0, 3).join(" ")} (...) ${p.slice(-3).join(" ")}`;
	assert.equal(unica(`Súmula 7 do STJ: “${comCorte}”`).resultado, "CONFERE_TRECHO");
});

test("transcrição sem aspas após dois-pontos, seguida de outro texto", () => {
	const c = unica(`Súmula 7 do STJ: ${stj7.enunciado} Por isso o recurso não merece trânsito.`);
	assert.equal(c.resultado, "CONFERE_LITERAL");
	const prosa = unica("Súmula 7 do STJ - óbice que impede o conhecimento do recurso neste caso concreto.");
	assert.equal(prosa.resultado, "SEM_TRANSCRICAO");
});

test("aspas vizinhas que não são a súmula não viram divergência", () => {
	const c = unica("Súmula 7 do STJ. O apelante sustenta que “o contrato jamais foi assinado pela parte autora”.");
	assert.equal(c.resultado, "SEM_TRANSCRICAO");
});

test("TJPE: redação de outra publicação oficial é reconhecida", () => {
	const comVariante = base.todas.find((r) => r.tribunal === "TJPE" && r.variantes?.length && r.situacao === "vigente");
	assert.ok(comVariante, "esperava ao menos uma súmula do TJPE com variante oficial");
	const c = unica(`Súmula ${comVariante.numero} do TJPE: “${comVariante.variantes[0].texto}”`);
	assert.equal(c.resultado, "CONFERE_VARIANTE_OFICIAL");
	const revogada = base.obter("TJPE", "comum", 2);
	assert.equal(revogada.situacao, "revogada");
	assert.ok(revogada.enunciado.length > 20);
});

test("o texto de cada súmula da base confere consigo mesmo (1.675 casos)", () => {
	for (const r of base.todas) {
		assert.equal(cotejar(r.enunciado, r).resultado, "CONFERE_LITERAL", r.id);
		assert.equal(comparavel(r.enunciado).length > 0, true);
	}
	const ref = detectarReferencias("Súmula 7 do STJ");
	assert.equal(ref.length, 1);
});

test("ferramentas: obter, buscar e verificar", async () => {
	const ctx = {};
	const obtida = (await obterSumula.executar({ tribunal: "STJ", numero: 7 }, ctx)).content[0].text;
	assert.ok(obtida.includes(stj7.enunciado));
	assert.ok(obtida.includes("Súmula n. 7 do STJ: “"));
	const sv = (await obterSumula.executar({ tribunal: "STF", numero: 10, tipo: "vinculante" }, ctx)).content[0].text;
	assert.ok(sv.includes(sv10.enunciado) && sv.includes("Súmula Vinculante n. 10"));
	const ausente = (await obterSumula.executar({ tribunal: "STJ", numero: 999 }, ctx)).content[0].text;
	assert.ok(ausente.startsWith("NÃO ENCONTRADA NA BASE"));
	await assert.rejects(async () => obterSumula.executar({ tribunal: "TST", numero: 1 }, ctx));
	const busca = (await buscarSumulas.executar({ termo: "reexame de prova", tribunal: "STJ" }, ctx)).content[0].text;
	assert.ok(busca.includes("STJ:SUM:7"));
	const acentos = (await buscarSumulas.executar({ termo: "FORNECIMENTO medicamentos", tribunal: "TJPE" }, ctx)).content[0].text;
	assert.ok(acentos.includes("TJPE:SUM:130"));
	const json = JSON.parse((await verificarCitacoesSumulas.executar({ texto: "Súmula 7 do STJ", formato: "json" }, ctx)).content[0].text);
	assert.equal(json.veredito, "INTEGRALMENTE_VERIFICADO");
	assert.equal(json.referencias[0].id, "STJ:SUM:7");
});

test("servidor avulso: protocolo MCP por stdio", () => {
	const entrada = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "teste" } } },
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		{ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "obter_sumula", arguments: { tribunal: "TJPE", numero: 130 } } },
	].map((m) => JSON.stringify(m)).join("\n") + "\n";
	const p = spawnSync(process.execPath, ["dist/projurista-sumulas.mjs"], { input: entrada, encoding: "utf8" });
	assert.equal(p.status, 0, p.stderr);
	const respostas = p.stdout.trim().split("\n").map((l) => JSON.parse(l));
	assert.equal(respostas.length, 3);
	assert.equal(respostas[0].result.serverInfo.name, "projurista-sumulas");
	const nomes = respostas[1].result.tools.map((t) => t.name);
	assert.deepEqual(nomes, ["obter_sumula", "buscar_sumulas", "verificar_citacoes_sumulas"]);
	assert.equal(respostas[1].result.tools[0].annotations.readOnlyHint, true);
	assert.ok(respostas[2].result.content[0].text.includes(tjpe130.enunciado));
});
