/**
 * Projurista Precedentes — servidor MCP avulso (stdio), sem Obsidian.
 * Um arquivo só, sem dependências e sem rede: a base de precedentes qualificados do STJ vai embutida.
 *
 *   node projurista-precedentes.mjs                          servidor MCP por stdio
 *   node projurista-precedentes.mjs obter <tema|iac> <número>
 *   node projurista-precedentes.mjs buscar "<questão jurídica>" [--limite N]
 *   node projurista-precedentes.mjs verificar <arquivo> [--json]
 *   node projurista-precedentes.mjs --versao
 *
 * "verificar" sai com código 1 quando o veredito é NAO_VERIFICADO (serve para ganchos e scripts).
 */
import { readFileSync } from "fs";
import { CONFIGURACOES_PADRAO } from "../configuracoes";
import { Despachante } from "../mcp/despachante";
import type { ContextoFerramenta } from "../mcp/tipos";
import { basePrecedentes, resumoCobertura } from "../precedentes/base";
import { FERRAMENTAS_PRECEDENTES_NUCLEO, INSTRUCOES_PRECEDENTES, buscarPrecedentes, obterPrecedente, verificarCitacoesPrecedentes } from "../precedentes/ferramentas";
import { Registro } from "../registro";
import { servirStdio } from "./stdio";

declare const __VERSAO_PROJURISTA__: string;

const registro = new Registro(50);
const contexto = { configuracoes: { ...CONFIGURACOES_PADRAO }, registro } as unknown as ContextoFerramenta;

function escrever(linha: string): void {
	process.stdout.write(linha + "\n");
}

async function linhaDeComando(args: string[]): Promise<number> {
	const comando = args[0];
	if (comando === "--versao" || comando === "--version") {
		const base = basePrecedentes();
		escrever(`projurista-precedentes ${__VERSAO_PROJURISTA__} · base ${base.versao} (${resumoCobertura(base)})`);
		return 0;
	}
	if (comando === "verificar" && args[1]) {
		const json = args.includes("--json");
		const resultado = await verificarCitacoesPrecedentes.executar({ texto: readFileSync(args[1], "utf8"), formato: json ? "json" : "texto" }, contexto);
		const saida = resultado.content[0].text;
		escrever(saida);
		const reprovado = json ? (JSON.parse(saida) as { veredito: string }).veredito === "NAO_VERIFICADO" : saida.includes("Veredito: NÃO VERIFICADO");
		return reprovado ? 1 : 0;
	}
	if (comando === "obter" && args[1]) {
		const argumentos = args[2] ? { tipo: args[1], numero: args[2] } : { numero: args[1] };
		const resultado = await obterPrecedente.executar(argumentos, contexto);
		escrever(resultado.content[0].text);
		return 0;
	}
	if (comando === "buscar" && args[1]) {
		const posicaoLimite = args.indexOf("--limite");
		const resultado = await buscarPrecedentes.executar({ termo: args[1], limite: posicaoLimite > 0 ? Number(args[posicaoLimite + 1]) : undefined }, contexto);
		escrever(resultado.content[0].text);
		return 0;
	}
	process.stderr.write(
		'Uso: projurista-precedentes [obter <tema|iac> <número> | buscar "<questão jurídica>" [--limite N] | verificar <arquivo> [--json] | --versao]\nSem argumentos, inicia o servidor MCP por stdio.\n',
	);
	return 2;
}

function servidor(): void {
	servirStdio(
		new Despachante({
			nomeServidor: "projurista-precedentes",
			versaoServidor: __VERSAO_PROJURISTA__,
			ferramentas: FERRAMENTAS_PRECEDENTES_NUCLEO,
			contexto: () => contexto,
			escritaPermitida: () => false,
			instrucoes: () => `Servidor de precedentes qualificados do STJ da Projurista (base embutida, sem rede). ${INSTRUCOES_PRECEDENTES}`,
		}),
	);
}

const argumentos = process.argv.slice(2);
if (argumentos.length === 0) servidor();
else
	void linhaDeComando(argumentos).then(
		(codigo) => process.exit(codigo),
		(erro: unknown) => {
			process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
			process.exit(2);
		},
	);
