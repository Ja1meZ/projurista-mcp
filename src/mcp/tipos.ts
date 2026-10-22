import type { App } from "obsidian";
import type { Registro } from "../registro";
import type { ConfiguracoesProjurista } from "../configuracoes";

export type JsonRpcId = string | number | null;

export interface JsonRpcRequisicao {
	jsonrpc: "2.0";
	id?: JsonRpcId;
	method: string;
	params?: unknown;
}

export interface JsonRpcErro {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcResposta {
	jsonrpc: "2.0";
	id: JsonRpcId;
	result?: unknown;
	error?: JsonRpcErro;
}

export interface JsonRpcNotificacao {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

export const CODIGOS = {
	PARSE: -32700,
	REQUISICAO_INVALIDA: -32600,
	METODO_NAO_ENCONTRADO: -32601,
	PARAMETROS_INVALIDOS: -32602,
	INTERNO: -32603,
} as const;

export interface ConteudoTexto {
	type: "text";
	text: string;
}

export interface ResultadoFerramenta {
	content: ConteudoTexto[];
	isError?: boolean;
}

export interface EsquemaJson {
	type: "object";
	properties: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean;
}

export interface ContextoFerramenta {
	app: App;
	configuracoes: ConfiguracoesProjurista;
	registro: Registro;
}

export interface Ferramenta {
	name: string;
	description: string;
	inputSchema: EsquemaJson;
	escrita?: boolean;
	executar(argumentos: Record<string, unknown>, contexto: ContextoFerramenta): Promise<ResultadoFerramenta>;
}

export class ErroFerramenta extends Error {
	constructor(mensagem: string) {
		super(mensagem);
		this.name = "ErroFerramenta";
	}
}
