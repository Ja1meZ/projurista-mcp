/**
 * Projurista Súmulas — servidor MCP avulso (stdio), sem Obsidian.
 * Um arquivo só, sem dependências e sem rede: a base de súmulas vai embutida.
 *
 *   node projurista-sumulas.mjs                         servidor MCP por stdio
 *   node projurista-sumulas.mjs verificar <arquivo> [--tribunal TJPE] [--json]
 *   node projurista-sumulas.mjs obter <STF|STJ|TJPE|SV> <número>
 *   node projurista-sumulas.mjs --versao
 *
 * "verificar" sai com código 1 quando o veredito é NAO_VERIFICADO (serve para ganchos e scripts).
 */
import { readFileSync } from "fs";
import { createInterface } from "readline";
import { CONFIGURACOES_PADRAO } from "../configuracoes";
import { Despachante } from "../mcp/despachante";
import type { ContextoFerramenta } from "../mcp/tipos";
import { Registro } from "../registro";
import { baseSumulas, resumoCobertura } from "../sumulas/base";
import { FERRAMENTAS_SUMULAS_NUCLEO, INSTRUCOES_SUMULAS, obterSumula, verificarCitacoesSumulas } from "../sumulas/ferramentas";

declare const __VERSAO_PROJURISTA__: string;

const registro = new Registro(50);
const contexto = { configuracoes: { ...CONFIGURACOES_PADRAO }, registro } as unknown as ContextoFerramenta;

function escrever(linha: string): void {
	process.stdout.write(linha + "\n");
}

async function linhaDeComando(args: string[]): Promise<number> {
	const comando = args[0];
	if (comando === "--versao" || comando === "--version") {
		const base = baseSumulas();
		escrever(`projurista-sumulas ${__VERSAO_PROJURISTA__} · base ${base.versao} (${resumoCobertura(base)})`);
		return 0;
	}
	if (comando === "verificar" && args[1]) {
		const posicaoTribunal = args.indexOf("--tribunal");
		const json = args.includes("--json");
		const resultado = await verificarCitacoesSumulas.executar(
			{
				texto: readFileSync(args[1], "utf8"),
				tribunal_padrao: posicaoTribunal > 0 ? args[posicaoTribunal + 1] : undefined,
				formato: json ? "json" : "texto",
			},
			contexto,
		);
		const saida = resultado.content[0].text;
		escrever(saida);
		const reprovado = json ? (JSON.parse(saida) as { veredito: string }).veredito === "NAO_VERIFICADO" : saida.includes("Veredito: NÃO VERIFICADO");
		return reprovado ? 1 : 0;
	}
	if (comando === "obter" && args[1] && args[2]) {
		const resultado = await obterSumula.executar({ tribunal: args[1], numero: args[2] }, contexto);
		escrever(resultado.content[0].text);
		return 0;
	}
	process.stderr.write("Uso: projurista-sumulas [verificar <arquivo> [--tribunal STF|STJ|TJPE] [--json] | obter <STF|STJ|TJPE|SV> <número> | --versao]\nSem argumentos, inicia o servidor MCP por stdio.\n");
	return 2;
}

function servidor(): void {
	const despachante = new Despachante({
		nomeServidor: "projurista-sumulas",
		versaoServidor: __VERSAO_PROJURISTA__,
		ferramentas: FERRAMENTAS_SUMULAS_NUCLEO,
		contexto: () => contexto,
		escritaPermitida: () => false,
		instrucoes: () => `Servidor de súmulas da Projurista (base embutida, sem rede). ${INSTRUCOES_SUMULAS}`,
	});
	const entrada = createInterface({ input: process.stdin, crlfDelay: Infinity });
	let fila: Promise<void> = Promise.resolve();
	entrada.on("line", (linha) => {
		if (!linha.trim()) return;
		fila = fila.then(async () => {
			const resposta = await despachante.tratarTexto(linha);
			if (resposta) escrever(JSON.stringify(resposta));
		});
	});
	entrada.on("close", () => {
		void fila.then(() => process.exit(0));
	});
}

const argumentos = process.argv.slice(2);
if (argumentos.length === 0) servidor();
else void linhaDeComando(argumentos).then((codigo) => process.exit(codigo), (erro: unknown) => {
	process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
	process.exit(2);
});
