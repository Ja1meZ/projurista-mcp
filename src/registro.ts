export type NivelRegistro = "info" | "aviso" | "erro";

export interface EntradaRegistro {
	quando: Date;
	nivel: NivelRegistro;
	mensagem: string;
}

/**
 * Registro de atividade em memória. Nada sai da máquina do usuário:
 * os últimos eventos ficam disponíveis apenas no modal "Registro de atividade".
 */
export class Registro {
	private entradas: EntradaRegistro[] = [];
	private ouvintes = new Set<() => void>();

	constructor(private capacidade = 200) {}

	registrar(nivel: NivelRegistro, mensagem: string): void {
		this.entradas.push({ quando: new Date(), nivel, mensagem });
		if (this.entradas.length > this.capacidade) {
			this.entradas.splice(0, this.entradas.length - this.capacidade);
		}
		if (nivel === "erro") {
			console.error(`[Projurista MCP] ${mensagem}`);
		}
		for (const ouvinte of this.ouvintes) ouvinte();
	}

	info(mensagem: string): void {
		this.registrar("info", mensagem);
	}

	aviso(mensagem: string): void {
		this.registrar("aviso", mensagem);
	}

	erro(mensagem: string): void {
		this.registrar("erro", mensagem);
	}

	listar(): EntradaRegistro[] {
		return [...this.entradas];
	}

	limpar(): void {
		this.entradas = [];
		for (const ouvinte of this.ouvintes) ouvinte();
	}

	observar(ouvinte: () => void): () => void {
		this.ouvintes.add(ouvinte);
		return () => this.ouvintes.delete(ouvinte);
	}
}
