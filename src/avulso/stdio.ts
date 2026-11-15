import { createInterface } from "readline";
import type { Despachante } from "../mcp/despachante";

/** Atende o protocolo MCP por stdio: uma mensagem JSON-RPC por linha, em fila. */
export function servirStdio(despachante: Despachante): void {
	const entrada = createInterface({ input: process.stdin, crlfDelay: Infinity });
	let fila: Promise<void> = Promise.resolve();
	entrada.on("line", (linha) => {
		if (!linha.trim()) return;
		fila = fila.then(async () => {
			const resposta = await despachante.tratarTexto(linha);
			if (resposta) process.stdout.write(JSON.stringify(resposta) + "\n");
		});
	});
	entrada.on("close", () => {
		void fila.then(() => process.exit(0));
	});
}
