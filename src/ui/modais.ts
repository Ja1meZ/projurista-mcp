import { App, Modal, Notice, Setting } from "obsidian";
import type { Registro } from "../registro";

export interface OpcoesConfirmacao {
	titulo: string;
	paragrafos: string[];
	codigo?: string;
	rotuloConfirmar: string;
	rotuloCancelar?: string;
	perigoso?: boolean;
}

/** Modal de confirmação genérico; resolve true ao confirmar e false ao cancelar. */
export class ModalConfirmacao extends Modal {
	private decidido = false;

	constructor(app: App, private opcoes: OpcoesConfirmacao, private resolver: (valor: boolean) => void) {
		super(app);
	}

	static perguntar(app: App, opcoes: OpcoesConfirmacao): Promise<boolean> {
		return new Promise((resolver) => new ModalConfirmacao(app, opcoes, resolver).open());
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("projurista-mcp-modal");
		contentEl.createEl("h2", { text: this.opcoes.titulo });
		for (const paragrafo of this.opcoes.paragrafos) contentEl.createEl("p", { text: paragrafo });
		if (this.opcoes.codigo) contentEl.createEl("code", { text: this.opcoes.codigo, cls: "projurista-mcp-codigo" });
		const botoes = contentEl.createDiv({ cls: "projurista-mcp-botoes" });
		const cancelar = botoes.createEl("button", { text: this.opcoes.rotuloCancelar ?? "Cancelar" });
		cancelar.addEventListener("click", () => this.decidir(false));
		const confirmar = botoes.createEl("button", { text: this.opcoes.rotuloConfirmar, cls: this.opcoes.perigoso ? "mod-warning" : "mod-cta" });
		confirmar.addEventListener("click", () => this.decidir(true));
	}

	private decidir(valor: boolean): void {
		if (this.decidido) return;
		this.decidido = true;
		this.resolver(valor);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.decidido) {
			this.decidido = true;
			this.resolver(false);
		}
	}
}

export interface OpcoesPassos {
	titulo: string;
	introducao?: string;
	passos: string[];
	codigo?: string;
	rotuloCopiar?: string;
	textoParaCopiar?: string;
}

/** Modal informativo com passos numerados e, opcionalmente, um bloco copiável. */
export class ModalPassos extends Modal {
	constructor(app: App, private opcoes: OpcoesPassos) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("projurista-mcp-modal");
		contentEl.createEl("h2", { text: this.opcoes.titulo });
		if (this.opcoes.introducao) contentEl.createEl("p", { text: this.opcoes.introducao });
		const lista = contentEl.createEl("ol");
		for (const passo of this.opcoes.passos) lista.createEl("li", { text: passo });
		if (this.opcoes.codigo) contentEl.createEl("code", { text: this.opcoes.codigo, cls: "projurista-mcp-codigo" });
		const botoes = contentEl.createDiv({ cls: "projurista-mcp-botoes" });
		if (this.opcoes.textoParaCopiar) {
			const copiar = botoes.createEl("button", { text: this.opcoes.rotuloCopiar ?? "Copiar" });
			copiar.addEventListener("click", async () => {
				await navigator.clipboard.writeText(this.opcoes.textoParaCopiar ?? "");
				new Notice("Copiado para a área de transferência.");
			});
		}
		const fechar = botoes.createEl("button", { text: "Fechar", cls: "mod-cta" });
		fechar.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Modal com o registro de atividade do servidor, atualizado ao vivo. */
export class ModalRegistro extends Modal {
	private cancelarObservacao: (() => void) | null = null;
	private corpo: HTMLElement | null = null;

	constructor(app: App, private registro: Registro) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("projurista-mcp-modal");
		contentEl.createEl("h2", { text: "Registro de atividade" });
		contentEl.createEl("p", { text: "Últimos eventos do servidor MCP. Nada é enviado para fora deste computador." });
		this.corpo = contentEl.createDiv({ cls: "projurista-mcp-registro" });
		this.renderizar();
		this.cancelarObservacao = this.registro.observar(() => this.renderizar());
		new Setting(contentEl)
			.addButton((b) => b.setButtonText("Copiar").onClick(async () => {
				await navigator.clipboard.writeText(this.texto());
				new Notice("Registro copiado.");
			}))
			.addButton((b) => b.setButtonText("Limpar").onClick(() => this.registro.limpar()))
			.addButton((b) => b.setButtonText("Fechar").setCta().onClick(() => this.close()));
	}

	private texto(): string {
		return this.registro
			.listar()
			.map((e) => `${e.quando.toLocaleTimeString("pt-BR")} [${e.nivel}] ${e.mensagem}`)
			.join("\n");
	}

	private renderizar(): void {
		if (!this.corpo) return;
		this.corpo.empty();
		const entradas = this.registro.listar();
		if (entradas.length === 0) {
			this.corpo.createDiv({ text: "Nenhum evento registrado ainda." });
			return;
		}
		for (const entrada of entradas) {
			this.corpo.createDiv({
				text: `${entrada.quando.toLocaleTimeString("pt-BR")}  ${entrada.mensagem}`,
				cls: entrada.nivel === "erro" ? "erro" : entrada.nivel === "aviso" ? "aviso" : "",
			});
		}
		this.corpo.scrollTop = this.corpo.scrollHeight;
	}

	onClose(): void {
		this.cancelarObservacao?.();
		this.cancelarObservacao = null;
		this.contentEl.empty();
	}
}
