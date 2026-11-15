import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basePrecedentes, verificarPrecedentes, detectarPrecedentes, cotejarTese, nomePrecedente, obterPrecedente, buscarPrecedentes, verificarCitacoesPrecedentes } from "../dist/nucleo-precedentes.mjs";

const base = basePrecedentes();
const tema = (n) => base.obterTema(n);
const verificar = (texto) => verificarPrecedentes(texto, base);
const unica = (texto) => {
	const r = verificar(texto);
	assert.equal(r.conferencias.length, 1, JSON.stringify(r.conferencias.map((c) => c.mencao)));
	return { ...r.conferencias[0], veredito: r.veredito };
};
const saida = async (ferramenta, args) => (await ferramenta.executar(args, {})).content[0].text;

test("a base carrega íntegra e com as contagens da planilha de 14/11/2026", () => {
	assert.equal(base.adulterados.length, 0);
	assert.equal(base.versao, "2026.11.14");
	assert.equal(base.todos.length, 2348);
	assert.equal(base.cobertura.TEMA.total, 1473);
	assert.equal(base.cobertura.IAC.total, 22);
	assert.equal(base.cobertura.CONTROVERSIA.total, 830);
	assert.equal(base.todos.filter((r) => r.situacao === "transitado").length, 1038);
	assert.equal(base.todos.filter((r) => r.tese).length, 1182);
	assert.equal(new Set(base.todos.map((r) => r.id)).size, 2348);
});

test("registro adulterado é descartado na carga", async () => {
	const { montarBase } = await import("../dist/nucleo-precedentes.mjs");
	const r = { ...tema(1150), tese: tema(1150).tese.replace("decenal", "quinquenal") };
	const b = montarBase({ versao_base: "x", gerado_em: "", aviso: "", fonte: { data_fonte: "2026-11-14", url: "" }, cobertura: {}, precedentes: [r, tema(1387)] });
	assert.deepEqual(b.adulterados, ["STJ:TEMA:1150"]);
	assert.equal(b.todos.length, 1);
});

test("toda tese da base, transcrita entre aspas, confere consigo mesma", () => {
	const falhas = [];
	for (const r of base.todos) {
		if (!r.tese || (r.tipo !== "TEMA" && r.tipo !== "IAC")) continue;
		assert.equal(cotejarTese(r.tese, r.tese).resultado, "CONFERE_LITERAL", r.id);
		const nome = r.tipo === "IAC" ? `IAC n. ${r.numero} do STJ` : `Tema n. ${r.numero} do STJ`;
		const rel = verificar(`Aplica-se o ${nome}: “${r.tese}”\n`);
		const c = rel.conferencias[0];
		if (!c || c.precedente?.id !== r.id || !c.resultado.startsWith("CONFERE")) falhas.push(`${r.id}:${c?.resultado}`);
	}
	assert.deepEqual(falhas, []);
});

test("tese literal de tema transitado: integralmente verificado", () => {
	const t = tema(1387);
	const c = unica(`Incide o Tema Repetitivo n. 1.387 do STJ: “${t.tese}”`);
	assert.equal(c.resultado, "CONFERE_LITERAL");
	assert.equal(c.precedente.id, "STJ:TEMA:1387");
	assert.equal(c.veredito, "INTEGRALMENTE_VERIFICADO");
});

test("quebras de linha e espaços diferentes não são divergência", () => {
	const t = tema(1150);
	const reformatada = t.tese.replace(/;(?=i)/g, ";\n").replace(/; e(?=iii)/, "; e\n");
	assert.notEqual(reformatada, t.tese);
	assert.equal(unica(`Tema 1.150/STJ: “${reformatada}”`).resultado, "CONFERE_LITERAL");
});

test("palavra trocada: divergente, com a diferença apontada", () => {
	const t = tema(1150);
	const c = unica(`Conforme o Tema 1150 do STJ: "${t.tese.replace("decenal", "quinquenal")}"`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.equal(c.veredito, "NAO_VERIFICADO");
	assert.ok(c.diferencas.some((d) => d.citado.includes("quinquenal") && d.oficial.includes("decenal")), JSON.stringify(c.diferencas));
});

test("transcrição de um item da tese: trecho literal; com palavra trocada: divergente", () => {
	const item = "a pretensão ao ressarcimento dos danos havidos em razão dos desfalques em conta individual vinculada ao Pasep se submete ao prazo prescricional decenal previsto pelo artigo 205 do Código Civil";
	assert.ok(tema(1150).tese.includes(item));
	assert.equal(unica(`Nos termos do Tema 1.150 do STJ, “${item}”.`).resultado, "CONFERE_TRECHO");
	const c = unica(`Nos termos do Tema 1.150 do STJ, “${item.replace("decenal", "trienal")}”.`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.equal(c.diferencas.length, 1, JSON.stringify(c.diferencas));
});

test("itens que o STJ publica colados: o espaço da minuta não é divergência nem ruído", () => {
	const t = tema(1410);
	assert.ok(t.tese.includes("servidor.2. A inércia"));
	const espacada = t.tese.replace("servidor.2.", "servidor. 2.");
	assert.equal(unica(`Tema 1.410 do STJ: "${espacada}"`).resultado, "CONFERE_LITERAL");
	const c = unica(`Tema 1.410 do STJ: "${espacada.replace("Estreito", "Estreito-MA")}"`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.deepEqual(c.diferencas, [{ citado: "Estreito-MA", oficial: "Estreito" }]);
});

test("diferença só de forma: ressalva, não divergência", () => {
	const t = tema(1387);
	const c = unica(`Tema 1387 do STJ: “${t.tese.replace("PASEP", "Pasep").replace(/,/g, "")}”`);
	assert.equal(c.resultado, "CONFERE_COM_DIFERENCA_DE_FORMA");
	assert.equal(c.veredito, "VERIFICADO_COM_RESSALVAS");
});

test("número que não corresponde ao texto transcrito", () => {
	const c = unica(`Tema 483 do STJ: “${tema(1387).tese}”`);
	assert.equal(c.resultado, "DIVERGENTE");
	assert.ok(c.notas.some((n) => n.includes("1.387")), c.notas.join(" | "));
});

test("formas de referência", () => {
	const numeros = (t) => detectarPrecedentes(t).referencias.map((r) => `${r.tipo}:${r.numero}:${r.tribunal}`);
	assert.deepEqual(numeros("Temas 1.150 e 1.387 do STJ"), ["TEMA:1150:STJ", "TEMA:1387:STJ"]);
	assert.deepEqual(numeros("Tema n. 1150/STJ"), ["TEMA:1150:STJ"]);
	assert.deepEqual(numeros("Tema Repetitivo nº 106"), ["TEMA:106:STJ"]);
	assert.deepEqual(numeros("Tema 106 do Superior Tribunal de Justiça"), ["TEMA:106:STJ"]);
	assert.deepEqual(numeros("Tema 1.059 dos recursos repetitivos"), ["TEMA:1059:STJ"]);
	assert.deepEqual(numeros("(STJ, Tema 1076)"), ["TEMA:1076:STJ"]);
	assert.deepEqual(numeros("Tema 793 da repercussão geral"), ["TEMA:793:STF"]);
	assert.deepEqual(numeros("Tema 6 do STF"), ["TEMA:6:STF"]);
	assert.deepEqual(numeros("Temas 6 e 1.234 do STF e 106 do STJ"), ["TEMA:6:STF", "TEMA:1234:STF", "TEMA:106:STJ"]);
	assert.deepEqual(numeros("IAC n. 5 do STJ"), ["IAC:5:STJ"]);
	assert.deepEqual(numeros("Incidente de Assunção de Competência n. 14/STJ"), ["IAC:14:STJ"]);
	assert.deepEqual(numeros("Tema 1150"), ["TEMA:1150:null"]);
	assert.deepEqual(numeros("o tema central do recurso e o art. 85 do CPC"), []);
});

test("tema do STF fica fora do escopo e não reprova o texto", () => {
	const r = verificar("Aplicam-se os Temas 6 e 1.234 do STF e o Tema 793 da repercussão geral.");
	assert.equal(r.conferencias.length, 0);
	assert.equal(r.foraDoEscopo.length, 2);
	assert.equal(r.veredito, "SEM_REFERENCIAS");
});

test("tema sem tribunal: herda de outra referência; sozinho, fica como ressalva", () => {
	const r = verificar("O Tema 1.150 do STJ fixou o prazo decenal. Mais adiante, o Tema 1.150 foi reafirmado.");
	assert.deepEqual(r.conferencias.map((c) => c.resultado), ["SEM_TRANSCRICAO", "SEM_TRANSCRICAO"]);
	assert.equal(r.veredito, "INTEGRALMENTE_VERIFICADO");
	const c = unica("Aplica-se o Tema 1150.");
	assert.equal(c.resultado, "AMBIGUA");
	assert.equal(c.veredito, "VERIFICADO_COM_RESSALVAS");
});

test("situação: cancelado sem ressalva reprova; afetado e sem trânsito são ressalva", () => {
	const cancelado = base.todos.find((r) => r.tipo === "TEMA" && r.situacao === "cancelado");
	const c1 = unica(`Incide o Tema ${cancelado.numero} do STJ.`);
	assert.ok(c1.alertaSituacao);
	assert.equal(c1.veredito, "NAO_VERIFICADO");
	assert.equal(unica(`O Tema ${cancelado.numero} do STJ, hoje cancelado, tratava do assunto.`).veredito, "VERIFICADO_COM_RESSALVAS");
	assert.equal(unica("O IAC 14 do STJ dispõe sobre a matéria.").veredito, "NAO_VERIFICADO");
	const afetado = base.todos.find((r) => r.tipo === "TEMA" && r.situacao_original === "Afetado" && r.suspensao);
	const c2 = unica(`A matéria está afetada no Tema ${afetado.numero} do STJ.`);
	assert.equal(c2.veredito, "VERIFICADO_COM_RESSALVAS");
	assert.ok(c2.notas.some((n) => n.includes("Suspensão determinada")), c2.notas.join(" | "));
	const pendente = base.todos.find((r) => r.tipo === "TEMA" && r.situacao_original === "Acórdão Publicado - RE Pendente");
	const c3 = unica(`Tema ${pendente.numero} do STJ: “${pendente.tese}”`);
	assert.ok(c3.resultado.startsWith("CONFERE"));
	assert.equal(c3.veredito, "VERIFICADO_COM_RESSALVAS");
});

test("tema fora da base", () => {
	const c = unica("Tema 9999 do STJ");
	assert.equal(c.resultado, "NAO_ENCONTRADO_NA_BASE");
	assert.equal(c.veredito, "NAO_VERIFICADO");
});

test("processo paradigma citado sem o tema é relacionado", () => {
	const r = verificar("Conforme decidido no REsp 2.214.864/PE, o saque inicia o prazo.");
	assert.equal(r.paradigmasCitados.length, 1);
	assert.equal(r.paradigmasCitados[0].precedentes[0].id, "STJ:TEMA:1387");
});

test("obter_precedente: ficha, tema sem tese, cancelado, ausente e tema de relevância", async () => {
	const t = await saida(obterPrecedente, { numero: 1150 });
	assert.ok(t.includes(tema(1150).tese));
	assert.ok(t.startsWith("Tema Repetitivo n. 1.150 do STJ — situação no STJ: Trânsito em Julgado"));
	assert.ok((await saida(obterPrecedente, { numero: "1.071" })).includes("não registra tese"));
	assert.ok((await saida(obterPrecedente, { tipo: "iac", numero: 14 })).startsWith("ATENÇÃO: precedente cancelado"));
	assert.ok((await saida(obterPrecedente, { numero: 9999 })).startsWith("NÃO ENCONTRADO NA BASE"));
	assert.ok((await saida(obterPrecedente, { numero: 1475 })).includes("Tema de Relevância n. 1.475 do STJ"));
	assert.equal(nomePrecedente({ tipo: "IAC", numero: 5 }), "IAC n. 5 do STJ");
});

test("buscar_precedentes: acha pelo assunto, separa o bloco de atenção e é determinística", async () => {
	const pasep = await saida(buscarPrecedentes, { termo: "prescrição PASEP saques desfalques" });
	assert.ok(pasep.indexOf("STJ:TEMA:1150") > 0 && pasep.indexOf("STJ:TEMA:1387") > 0);
	assert.equal(pasep, await saida(buscarPrecedentes, { termo: "prescrição PASEP saques desfalques" }));
	const farm = await saida(buscarPrecedentes, { termo: "farmacêutico dispensário de medicamentos" });
	assert.ok(farm.indexOf("STJ:TEMA:483") > 0 && farm.indexOf("STJ:TEMA:483") < 400, farm.slice(0, 500));
	// plural e acento não importam
	assert.ok((await saida(buscarPrecedentes, { termo: "farmaceuticos dispensarios medicamento" })).includes("STJ:TEMA:483"));
	const afetado = base.todos.find((r) => r.tipo === "TEMA" && r.situacao_original === "Afetado" && r.suspensao);
	const res = await saida(buscarPrecedentes, { termo: afetado.questao.slice(0, 160) });
	const bloco = res.indexOf("ATENÇÃO — sem trânsito");
	assert.ok(bloco > 0 && res.indexOf(afetado.id) > bloco, res.slice(0, 300));
	assert.ok((await saida(buscarPrecedentes, { termo: "REsp 2214864/PE" })).includes("STJ:TEMA:1387"));
	assert.ok((await saida(buscarPrecedentes, { termo: "xyzzy inexistente" })).includes("Nenhuma tese transitada"));
	const penal = await saida(buscarPrecedentes, { termo: "prescrição", orgao: "TERCEIRA SEÇÃO", limite: 30 });
	assert.ok(!penal.includes("PRIMEIRA SEÇÃO") && penal.includes("TERCEIRA SEÇÃO"));
});

test("verificar_citacoes_precedentes: relatório em texto e em JSON", async () => {
	const texto = `Aplica-se o Tema 1.387 do STJ: “${tema(1387).tese}”`;
	assert.ok((await saida(verificarCitacoesPrecedentes, { texto })).includes("Veredito: INTEGRALMENTE VERIFICADO"));
	const json = JSON.parse(await saida(verificarCitacoesPrecedentes, { texto, formato: "json" }));
	assert.equal(json.veredito, "INTEGRALMENTE_VERIFICADO");
	assert.equal(json.referencias[0].id, "STJ:TEMA:1387");
});

test("servidor avulso: protocolo MCP por stdio e linha de comando", () => {
	const entrada = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", clientInfo: { name: "teste" } } },
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		{ jsonrpc: "2.0", id: 2, method: "tools/list" },
		{ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "obter_precedente", arguments: { numero: 1387 } } },
	].map((m) => JSON.stringify(m)).join("\n") + "\n";
	const p = spawnSync(process.execPath, ["dist/projurista-precedentes.mjs"], { input: entrada, encoding: "utf8" });
	assert.equal(p.status, 0, p.stderr);
	const respostas = p.stdout.trim().split("\n").map((l) => JSON.parse(l));
	assert.equal(respostas.length, 3);
	assert.equal(respostas[0].result.serverInfo.name, "projurista-precedentes");
	assert.ok(respostas[0].result.instructions.includes("buscar_precedentes"));
	assert.deepEqual(respostas[1].result.tools.map((t) => t.name), ["obter_precedente", "buscar_precedentes", "verificar_citacoes_precedentes"]);
	assert.equal(respostas[1].result.tools[0].annotations.readOnlyHint, true);
	assert.ok(respostas[2].result.content[0].text.includes(tema(1387).tese));
	const cli = spawnSync(process.execPath, ["dist/projurista-precedentes.mjs", "obter", "tema", "483"], { encoding: "utf8" });
	assert.equal(cli.status, 0);
	assert.ok(cli.stdout.includes("Não é obrigatória a presença de farmacêutico em dispensário de medicamentos."));
});
