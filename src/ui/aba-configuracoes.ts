import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ProjuristaMcpPlugin from "../main";
import { CONFIGURACOES_PADRAO } from "../configuracoes";
import { ModalRegistro } from "./modais";
import { descricaoEstadoSmart, estadoSmartConnections } from "../mcp/tools/semantica";

export class AbaConfiguracoes extends PluginSettingTab {
	constructor(app: App, private plugin: ProjuristaMcpPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.blocoStatus(containerEl);

		new Setting(containerEl).setName("Conectar ao Claude").setHeading();

		new Setting(containerEl)
			.setName("Claude Desktop")
			.setDesc("Grava a conexão no arquivo de configuração do Claude Desktop, com cópia de segurança. Depois, feche e abra o Claude Desktop.")
			.addButton((b) => b.setButtonText("Conectar ao Claude Desktop").setCta().onClick(() => this.plugin.conectarAoClaudeDesktop()))
			.addButton((b) => b.setButtonText("Desfazer").onClick(() => this.plugin.desconectarDoClaudeDesktop()));

		new Setting(containerEl)
			.setName("Extensão do Claude Desktop (.mcpb)")
			.setDesc("Alternativa à gravação automática: gera um pacote para instalar em Settings → Extensions → Advanced settings → Install Extension…")
			.addButton((b) => b.setButtonText("Exportar .mcpb").onClick(() => this.plugin.exportarMcpb()));

		new Setting(containerEl)
			.setName("Claude Code e outros clientes")
			.setDesc("Copia o comando do Claude Code ou a configuração JSON para colar à mão.")
			.addButton((b) => b.setButtonText("Copiar comando do Claude Code").onClick(() => this.plugin.copiarComandoClaudeCode()))
			.addButton((b) => b.setButtonText("Copiar JSON do Claude Desktop").onClick(() => this.plugin.copiarConfiguracaoJson()));

		new Setting(containerEl)
			.setName("Testar conexão")
			.setDesc("O plugin abre uma conexão contra o próprio servidor, nos dois transportes, e informa o resultado.")
			.addButton((b) => b.setButtonText("Testar").onClick(() => this.plugin.testarConexao()));

		new Setting(containerEl).setName("Permissões").setHeading();

		new Setting(containerEl)
			.setName("Permitir escrita")
			.setDesc("Desligado, o Claude só lê, lista e pesquisa. Ligado, ele também pode criar, alterar, mover e enviar notas para a lixeira.")
			.addToggle((t) =>
				t.setValue(this.plugin.configuracoes.permitirEscrita).onChange(async (valor) => {
					this.plugin.configuracoes.permitirEscrita = valor;
					await this.plugin.salvarConfiguracoes();
					this.plugin.avisarListaDeFerramentasMudou();
					new Notice(valor ? "Escrita habilitada. O Claude pode alterar o cofre." : "Modo somente leitura.");
				}),
			);

		new Setting(containerEl)
			.setName("Pastas ocultas")
			.setDesc("Uma por linha. Essas pastas ficam invisíveis para o Claude. As pastas .obsidian e .trash são sempre ocultas.")
			.addTextArea((t) =>
				t
					.setPlaceholder("Sigiloso\nPessoal/Financeiro")
					.setValue(this.plugin.configuracoes.pastasExcluidas.join("\n"))
					.onChange(async (valor) => {
						this.plugin.configuracoes.pastasExcluidas = valor
							.split("\n")
							.map((l) => l.trim())
							.filter((l) => l.length > 0);
						await this.plugin.salvarConfiguracoes();
					}),
			);

		new Setting(containerEl).setName("Servidor").setHeading();

		new Setting(containerEl)
			.setName("Iniciar com o Obsidian")
			.setDesc("Sobe o servidor automaticamente quando o cofre abre.")
			.addToggle((t) =>
				t.setValue(this.plugin.configuracoes.iniciarComObsidian).onChange(async (valor) => {
					this.plugin.configuracoes.iniciarComObsidian = valor;
					await this.plugin.salvarConfiguracoes();
				}),
			);

		new Setting(containerEl)
			.setName("Nome do servidor")
			.setDesc(`Como a conexão aparece no Claude. Vazio: "${this.plugin.nomeServidorPadrao()}" (derivado do nome do cofre).`)
			.addText((t) =>
				t
					.setPlaceholder(this.plugin.nomeServidorPadrao())
					.setValue(this.plugin.configuracoes.nomeServidor)
					.onChange(async (valor) => {
						this.plugin.configuracoes.nomeServidor = valor;
						await this.plugin.salvarConfiguracoes();
					}),
			);

		new Setting(containerEl)
			.setName("Porta TCP")
			.setDesc("Usada pela ponte do Claude Desktop. Se mudar, conecte de novo ao Claude Desktop.")
			.addText((t) =>
				t.setValue(String(this.plugin.configuracoes.portaTcp)).onChange(async (valor) => {
					const porta = Number(valor);
					if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) return;
					this.plugin.configuracoes.portaTcp = porta;
					await this.plugin.salvarConfiguracoes();
				}),
			);

		new Setting(containerEl)
			.setName("Transporte HTTP")
			.setDesc("Endpoint Streamable HTTP para Claude Code, Cursor e outros clientes. Pode ficar desligado se você só usa o Claude Desktop.")
			.addToggle((t) =>
				t.setValue(this.plugin.configuracoes.httpAtivo).onChange(async (valor) => {
					this.plugin.configuracoes.httpAtivo = valor;
					await this.plugin.salvarConfiguracoes();
					await this.plugin.reiniciarServidor();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName("Porta HTTP")
			.addText((t) =>
				t.setValue(String(this.plugin.configuracoes.portaHttp)).onChange(async (valor) => {
					const porta = Number(valor);
					if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) return;
					this.plugin.configuracoes.portaHttp = porta;
					await this.plugin.salvarConfiguracoes();
				}),
			);

		new Setting(containerEl)
			.setName("Token")
			.setDesc("Senha compartilhada exigida em toda conexão. Ao gerar um token novo, conecte de novo o Claude Desktop e os demais clientes.")
			.setClass("projurista-mcp-token")
			.addText((t) => {
				t.setValue(this.plugin.configuracoes.token);
				t.inputEl.readOnly = true;
			})
			.addButton((b) => b.setButtonText("Copiar").onClick(async () => {
				await navigator.clipboard.writeText(this.plugin.configuracoes.token);
				new Notice("Token copiado.");
			}))
			.addButton((b) => b.setButtonText("Gerar novo").setWarning().onClick(async () => {
				await this.plugin.gerarNovoToken();
				this.display();
			}));

		new Setting(containerEl)
			.setName("Limite de caracteres por resposta")
			.setDesc("Protege o Claude de respostas enormes. Padrão: 200.000.")
			.addText((t) =>
				t.setValue(String(this.plugin.configuracoes.limiteCaracteres)).onChange(async (valor) => {
					const n = Number(valor);
					if (!Number.isInteger(n) || n < 1000) return;
					this.plugin.configuracoes.limiteCaracteres = n;
					await this.plugin.salvarConfiguracoes();
				}),
			);

		new Setting(containerEl)
			.setName("Restaurar padrões")
			.setDesc("Volta portas, pastas ocultas e demais opções ao padrão. O token é mantido.")
			.addButton((b) => b.setButtonText("Restaurar").onClick(async () => {
				const token = this.plugin.configuracoes.token;
				Object.assign(this.plugin.configuracoes, CONFIGURACOES_PADRAO, { token, pastasExcluidas: [...CONFIGURACOES_PADRAO.pastasExcluidas] });
				await this.plugin.salvarConfiguracoes();
				await this.plugin.reiniciarServidor();
				this.display();
			}));
	}

	private blocoStatus(containerEl: HTMLElement): void {
		const estado = this.plugin.estadoServidor();
		const bloco = containerEl.createDiv({ cls: "projurista-mcp-status" });
		if (estado.ligado) bloco.addClass("ligado");
		bloco.createSpan({ cls: "projurista-mcp-luz" });
		bloco.createSpan({ text: estado.ligado ? "Servidor ligado" : "Servidor desligado" });
		if (estado.ligado) {
			const partes = [`TCP 127.0.0.1:${estado.portaTcp}`];
			if (estado.portaHttp) partes.push(`HTTP http://127.0.0.1:${estado.portaHttp}/mcp`);
			partes.push(`${estado.conexoes} ${estado.conexoes === 1 ? "sessão ativa" : "sessões ativas"}`);
			partes.push(this.plugin.configuracoes.permitirEscrita ? "leitura e escrita" : "somente leitura");
			bloco.createSpan({ cls: "projurista-mcp-detalhe", text: partes.join(" · ") });
		}
		bloco.createSpan({ cls: "projurista-mcp-detalhe", text: descricaoEstadoSmart(estadoSmartConnections()) });
		new Setting(containerEl)
			.setName("Servidor MCP")
			.setDesc(estado.ligado ? "O Claude pode se conectar a este cofre." : "Ligue o servidor para que o Claude possa se conectar.")
			.addButton((b) =>
				b.setButtonText(estado.ligado ? "Parar" : "Iniciar").onClick(async () => {
					if (estado.ligado) await this.plugin.pararServidor();
					else await this.plugin.iniciarServidor();
					this.display();
				}),
			)
			.addButton((b) => b.setButtonText("Registro de atividade").onClick(() => new ModalRegistro(this.app, this.plugin.registro).open()));
	}
}
