import * as net from "net";
import { timingSafeEqual } from "crypto";
import type { Despachante } from "../mcp/despachante";
import type { Registro } from "../registro";

export const PREFIXO_TOKEN = "PROJURISTA-TOKEN ";

export interface OpcoesTcp {
	despachante: Despachante;
	registro: Registro;
	token: () => string;
}

/**
 * Transporte TCP com JSON-RPC delimitado por linha, o mesmo enquadramento do
 * stdio do MCP. A primeira linha de cada conexão deve trazer o token.
 * Isso permite que a ponte do Claude Desktop seja o netcat do macOS ou um
 * script PowerShell no Windows, sem instalar nada.
 */
export class TransporteTcp {
	private servidor: net.Server | null = null;
	private conexoes = new Set<net.Socket>();
	private porta = 0;

	constructor(private opcoes: OpcoesTcp) {}

	get ativo(): boolean {
		return this.servidor !== null;
	}

	get portaAtual(): number {
		return this.porta;
	}

	get conexoesAtivas(): number {
		return this.conexoes.size;
	}

	/** Tenta a porta pedida e, se ocupada, as seguintes (até 20). Devolve a porta usada. */
	async iniciar(portaDesejada: number): Promise<number> {
		if (this.servidor) return this.porta;
		let ultimoErro: Error | null = null;
		for (let tentativa = 0; tentativa < 20; tentativa++) {
			const porta = portaDesejada + tentativa;
			try {
				await this.escutar(porta);
				this.porta = porta;
				return porta;
			} catch (erro) {
				ultimoErro = erro instanceof Error ? erro : new Error(String(erro));
				if ((erro as NodeJS.ErrnoException).code !== "EADDRINUSE") break;
			}
		}
		throw ultimoErro ?? new Error("Não foi possível abrir o servidor TCP.");
	}

	private escutar(porta: number): Promise<void> {
		return new Promise((resolver, rejeitar) => {
			const servidor = net.createServer((socket) => this.aoConectar(socket));
			servidor.once("error", (erro) => {
				servidor.close();
				rejeitar(erro);
			});
			servidor.listen(porta, "127.0.0.1", () => {
				servidor.removeAllListeners("error");
				servidor.on("error", (erro) => this.opcoes.registro.erro(`Servidor TCP: ${erro.message}`));
				this.servidor = servidor;
				resolver();
			});
		});
	}

	async parar(): Promise<void> {
		for (const socket of this.conexoes) socket.destroy();
		this.conexoes.clear();
		const servidor = this.servidor;
		this.servidor = null;
		this.porta = 0;
		if (!servidor) return;
		await new Promise<void>((resolver) => servidor.close(() => resolver()));
	}

	/** Envia uma notificação a todas as sessões autenticadas. */
	notificarTodos(mensagem: unknown): void {
		const linha = JSON.stringify(mensagem) + "\n";
		for (const socket of this.conexoes) {
			if ((socket as SocketComEstado).autenticado) socket.write(linha);
		}
	}

	private aoConectar(socketBruto: net.Socket): void {
		const socket = socketBruto as SocketComEstado;
		socket.autenticado = false;
		socket.setEncoding("utf8");
		socket.setNoDelay(true);
		this.conexoes.add(socket);
		this.opcoes.registro.info("Conexão TCP recebida; aguardando token.");

		let buffer = "";
		let fila: Promise<void> = Promise.resolve();
		const temporizador = setTimeout(() => {
			if (!socket.autenticado) {
				this.opcoes.registro.aviso("Conexão TCP encerrada: token não enviado em 10 segundos.");
				socket.destroy();
			}
		}, 10_000);

		socket.on("data", (pedaco: string) => {
			buffer += pedaco;
			if (buffer.length > 20 * 1024 * 1024) {
				this.opcoes.registro.erro("Conexão TCP encerrada: mensagem maior que 20 MB.");
				socket.destroy();
				return;
			}
			let indice: number;
			while ((indice = buffer.indexOf("\n")) >= 0) {
				const linha = buffer.slice(0, indice).replace(/\r$/, "");
				buffer = buffer.slice(indice + 1);
				if (linha.trim() === "") continue;
				fila = fila.then(() => this.tratarLinha(socket, linha));
			}
		});
		socket.on("end", () => socket.end());
		socket.on("error", (erro) => {
			if ((erro as NodeJS.ErrnoException).code !== "ECONNRESET") {
				this.opcoes.registro.aviso(`Conexão TCP: ${erro.message}`);
			}
		});
		socket.on("close", () => {
			clearTimeout(temporizador);
			this.conexoes.delete(socket);
			if (socket.autenticado) this.opcoes.registro.info("Sessão TCP encerrada.");
		});
	}

	private async tratarLinha(socket: SocketComEstado, linha: string): Promise<void> {
		if (socket.destroyed) return;
		if (!socket.autenticado) {
			if (linha.startsWith(PREFIXO_TOKEN) && tokensIguais(linha.slice(PREFIXO_TOKEN.length).trim(), this.opcoes.token())) {
				socket.autenticado = true;
				this.opcoes.registro.info("Sessão TCP autenticada.");
				return;
			}
			this.opcoes.registro.aviso("Conexão TCP recusada: token ausente ou inválido.");
			socket.destroy();
			return;
		}
		const resposta = await this.opcoes.despachante.tratarTexto(linha);
		if (resposta && !socket.destroyed) {
			socket.write(JSON.stringify(resposta) + "\n");
		}
	}
}

interface SocketComEstado extends net.Socket {
	autenticado: boolean;
}

export function tokensIguais(recebido: string, esperado: string): boolean {
	if (!esperado || recebido.length !== esperado.length) return false;
	return timingSafeEqual(Buffer.from(recebido, "utf8"), Buffer.from(esperado, "utf8"));
}
