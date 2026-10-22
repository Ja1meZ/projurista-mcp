import { App, Notice, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import type ProjuristaMcpPlugin from "../main";
import { CONFIGURACOES_PADRAO, ConfiguracoesProjurista } from "../configuracoes";
import { ModalRegistro } from "./modais";
import { descricaoEstadoSmart, estadoSmartConnections } from "../mcp/tools/semantica";

/**
 * Aba de configurações na API declarativa do Obsidian (1.13+): as opções ficam
 * pesquisáveis na busca de configurações. Os valores vêm de plugin.configuracoes.
 */
export class AbaConfiguracoes extends PluginSettingTab {
	constructor(app: App, private plugin: ProjuristaMcpPlugin) {
		super(app, plugin);
	}

	getControlValue(chave: string): unknown {
		const c = this.plugin.configuracoes;
		if (chave === "pastasExcluidas") return c.pastasExcluidas.join("\n");
		return (c as unknown as Record<string, unknown>)[chave];
	}

	async setControlValue(chave: string, valor: unknown): Promise<void> {
		const c = this.plugin.configuracoes;
		switch (chave as keyof ConfiguracoesProjurista) {
			case "pastasExcluidas":
				c.pastasExcluidas = (typeof valor === "string" ? valor : "")
					.split("\n")
					.map((l) => l.trim())
					.filter((l) => l.length > 0);
				break;
			case "permitirEscrita":
				c.permitirEscrita = Boolean(valor);
				await this.plugin.salvarConfiguracoes();
				this.plugin.avisarListaDeFerramentasMudou();
				new Notice(c.permitirEscrita ? "Escrita habilitada. O Claude pode alterar o cofre." : "Modo somente leitura.");
				this.update();
				return;
			case "httpAtivo":
				c.httpAtivo = Boolean(valor);
				await this.plugin.salvarConfiguracoes();
				await this.plugin.reiniciarServidor();
				this.update();
				return;
			case "iniciarComObsidian":
				c.iniciarComObsidian = Boolean(valor);
				break;
			case "nomeServidor":
				c.nomeServidor = (typeof valor === "string" ? valor : "");
				break;
			case "portaTcp":
			case "portaHttp":
			case "limiteCaracteres": {
				const numero = Number(valor);
				if (!Number.isInteger(numero)) return;
				c[chave as "portaTcp" | "portaHttp" | "limiteCaracteres"] = numero;
				break;
			}
			default:
				return;
		}
		await this.plugin.salvarConfiguracoes();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const estado = this.plugin.estadoServidor();
		const detalhes: string[] = [];
		if (estado.ligado) {
			detalhes.push(`TCP 127.0.0.1:${estado.portaTcp}`);
			if (estado.portaHttp) detalhes.push(`HTTP http://127.0.0.1:${estado.portaHttp}/mcp`);
			detalhes.push(`${estado.conexoes} ${estado.conexoes === 1 ? "sessão ativa" : "sessões ativas"}`);
			detalhes.push(this.plugin.configuracoes.permitirEscrita ? "leitura e escrita" : "somente leitura");
		}
		const descricaoStatus = `${estado.ligado ? "Servidor ligado." : "Servidor desligado: ligue-o para que o Claude possa se conectar."} ${detalhes.join(" · ")} ${descricaoEstadoSmart(estadoSmartConnections())}`.trim();
		const validarPorta = (valor: number): string | void => {
			if (!Number.isInteger(valor) || valor < 1024 || valor > 65535) return "Informe uma porta entre 1024 e 65535.";
		};

		return [
			{
				name: "Servidor MCP",
				desc: descricaoStatus,
				searchable: false,
				render: (setting: Setting) => {
					setting.settingEl.addClass("projurista-mcp-status");
					if (estado.ligado) setting.settingEl.addClass("ligado");
					setting.addButton((b) =>
						b.setButtonText(estado.ligado ? "Parar" : "Iniciar").onClick(async () => {
							if (estado.ligado) await this.plugin.pararServidor();
							else await this.plugin.iniciarServidor();
							this.update();
						}),
					);
					setting.addButton((b) => b.setButtonText("Registro de atividade").onClick(() => new ModalRegistro(this.app, this.plugin.registro).open()));
				},
			},
			{
				type: "group",
				heading: "Conectar ao Claude",
				items: [
					{
						name: "Claude Desktop",
						desc: "Grava a conexão no arquivo de configuração do Claude Desktop, com cópia de segurança. Depois, feche e abra o Claude Desktop.",
						aliases: ["conectar", "claude_desktop_config"],
						render: (setting: Setting) => {
							setting.addButton((b) => b.setButtonText("Conectar ao Claude Desktop").setCta().onClick(() => this.plugin.conectarAoClaudeDesktop()));
							setting.addButton((b) => b.setButtonText("Desfazer").onClick(() => this.plugin.desconectarDoClaudeDesktop()));
						},
					},
					{
						name: "Extensão do Claude Desktop (.mcpb)",
						desc: "Alternativa à gravação automática: gera um pacote para instalar em Settings → Extensions → Advanced settings → Install Extension…",
						aliases: ["mcpb", "extensão"],
						render: (setting: Setting) => {
							setting.addButton((b) => b.setButtonText("Exportar .mcpb").onClick(() => this.plugin.exportarMcpb()));
						},
					},
					{
						name: "Claude Code e outros clientes",
						desc: "Copia o comando do Claude Code ou a configuração JSON para colar à mão.",
						aliases: ["claude code", "json", "cursor"],
						render: (setting: Setting) => {
							setting.addButton((b) => b.setButtonText("Copiar comando do Claude Code").onClick(() => this.plugin.copiarComandoClaudeCode()));
							setting.addButton((b) => b.setButtonText("Copiar JSON do Claude Desktop").onClick(() => this.plugin.copiarConfiguracaoJson()));
						},
					},
					{
						name: "Testar conexão",
						desc: "O plugin abre uma conexão contra o próprio servidor, nos dois transportes, e informa o resultado.",
						render: (setting: Setting) => {
							setting.addButton((b) => b.setButtonText("Testar").onClick(() => this.plugin.testarConexao()));
						},
					},
				],
			},
			{
				type: "group",
				heading: "Permissões",
				items: [
					{
						name: "Permitir escrita",
						desc: "Desligado, o Claude só lê, lista e pesquisa. Ligado, ele também pode criar, alterar, mover e enviar notas para a lixeira.",
						aliases: ["escrita", "somente leitura"],
						control: { type: "toggle", key: "permitirEscrita", defaultValue: CONFIGURACOES_PADRAO.permitirEscrita },
					},
					{
						name: "Pastas ocultas",
						desc: `Uma por linha. Essas pastas ficam invisíveis para o Claude. As pastas ${this.app.vault.configDir} e .trash são sempre ocultas.`,
						aliases: ["excluir", "sigilo", "privacidade"],
						control: { type: "textarea", key: "pastasExcluidas", placeholder: "Sigiloso\nPessoal/Financeiro", rows: 3 },
					},
				],
			},
			{
				type: "group",
				heading: "Servidor",
				items: [
					{
						name: "Iniciar com o Obsidian",
						desc: "Sobe o servidor automaticamente quando o cofre abre.",
						control: { type: "toggle", key: "iniciarComObsidian", defaultValue: CONFIGURACOES_PADRAO.iniciarComObsidian },
					},
					{
						name: "Nome do servidor",
						desc: `Como a conexão aparece no Claude. Vazio: "${this.plugin.nomeServidorPadrao()}" (derivado do nome do cofre).`,
						control: { type: "text", key: "nomeServidor", placeholder: this.plugin.nomeServidorPadrao() },
					},
					{
						name: "Porta TCP",
						desc: "Usada pela ponte do Claude Desktop. Se mudar, conecte de novo ao Claude Desktop.",
						control: { type: "number", key: "portaTcp", defaultValue: CONFIGURACOES_PADRAO.portaTcp, min: 1024, max: 65535, step: 1, validate: validarPorta },
					},
					{
						name: "Transporte HTTP",
						desc: "Endpoint Streamable HTTP para Claude Code, Cursor e outros clientes. Pode ficar desligado se você só usa o Claude Desktop.",
						control: { type: "toggle", key: "httpAtivo", defaultValue: CONFIGURACOES_PADRAO.httpAtivo },
					},
					{
						name: "Porta HTTP",
						control: { type: "number", key: "portaHttp", defaultValue: CONFIGURACOES_PADRAO.portaHttp, min: 1024, max: 65535, step: 1, validate: validarPorta },
					},
					{
						name: "Token",
						desc: "Senha compartilhada exigida em toda conexão. Ao gerar um token novo, conecte de novo o Claude Desktop e os demais clientes.",
						aliases: ["senha", "chave"],
						render: (setting: Setting) => {
							setting.settingEl.addClass("projurista-mcp-token");
							setting.addText((t) => {
								t.setValue(this.plugin.configuracoes.token);
								t.inputEl.readOnly = true;
							});
							setting.addButton((b) =>
								b.setButtonText("Copiar").onClick(() => {
									void navigator.clipboard.writeText(this.plugin.configuracoes.token).then(() => new Notice("Token copiado."));
								}),
							);
							setting.addButton((b) =>
								b.setButtonText("Gerar novo").setClass("mod-warning").onClick(async () => {
									await this.plugin.gerarNovoToken();
									this.update();
								}),
							);
						},
					},
					{
						name: "Limite de caracteres por resposta",
						desc: "Protege o Claude de respostas enormes. Padrão: 200.000.",
						control: { type: "number", key: "limiteCaracteres", defaultValue: CONFIGURACOES_PADRAO.limiteCaracteres, min: 1000, step: 1000 },
					},
					{
						name: "Restaurar padrões",
						desc: "Volta portas, pastas ocultas e demais opções ao padrão. O token é mantido.",
						render: (setting: Setting) => {
							setting.addButton((b) =>
								b.setButtonText("Restaurar").onClick(async () => {
									const token = this.plugin.configuracoes.token;
									Object.assign(this.plugin.configuracoes, CONFIGURACOES_PADRAO, { token, pastasExcluidas: [...CONFIGURACOES_PADRAO.pastasExcluidas] });
									await this.plugin.salvarConfiguracoes();
									await this.plugin.reiniciarServidor();
									this.update();
								}),
							);
						},
					},
				],
			},
		];
	}
}
