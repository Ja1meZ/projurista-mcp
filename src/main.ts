import { FileSystemAdapter, Notice, Plugin, normalizePath } from "obsidian";
import { randomBytes } from "crypto";
import * as net from "net";
import * as http from "http";
import * as path from "path";
import { CONFIGURACOES_PADRAO, ConfiguracoesProjurista, nomeServidorEfetivo } from "./configuracoes";
import { Registro } from "./registro";
import { Despachante } from "./mcp/despachante";
import { TODAS_AS_FERRAMENTAS } from "./mcp/tools";
import { TransporteTcp, PREFIXO_TOKEN } from "./transports/tcp";
import { TransporteHttp } from "./transports/http";
import {
	ParametrosConexao,
	caminhoConfigClaude,
	claudeDesktopInstalado,
	comandoClaudeCode,
	configuracaoCompleta,
	entradaServidor,
	estadoNoClaudeDesktop,
	gravarNoClaudeDesktop,
	plataformaAtual,
	removerDoClaudeDesktop,
} from "./claude/config-desktop";
import { PONTE_POWERSHELL } from "./claude/pontes";
import { montarMcpb, nomeArquivoMcpb, salvarMcpb } from "./claude/mcpb";
import { AbaConfiguracoes } from "./ui/aba-configuracoes";
import { ModalConfirmacao, ModalPassos, ModalRegistro } from "./ui/modais";

export interface EstadoServidor {
	ligado: boolean;
	portaTcp: number;
	portaHttp: number;
	conexoes: number;
}

export default class ProjuristaMcpPlugin extends Plugin {
	configuracoes: ConfiguracoesProjurista = { ...CONFIGURACOES_PADRAO };
	registro = new Registro(200);
	private despachante!: Despachante;
	private tcp!: TransporteTcp;
	private http!: TransporteHttp;
	private itemBarraStatus: HTMLElement | null = null;
	private iniciando: Promise<void> | null = null;

	async onload(): Promise<void> {
		await this.carregarConfiguracoes();

		this.despachante = new Despachante({
			nomeServidor: "projurista-mcp",
			versaoServidor: this.manifest.version,
			ferramentas: TODAS_AS_FERRAMENTAS,
			contexto: () => ({ app: this.app, configuracoes: this.configuracoes, registro: this.registro }),
			escritaPermitida: () => this.configuracoes.permitirEscrita,
		});
		this.tcp = new TransporteTcp({ despachante: this.despachante, registro: this.registro, token: () => this.configuracoes.token });
		this.http = new TransporteHttp({ despachante: this.despachante, registro: this.registro, token: () => this.configuracoes.token });

		this.itemBarraStatus = this.addStatusBarItem();
		this.atualizarBarraStatus();
		this.addSettingTab(new AbaConfiguracoes(this.app, this));

		this.addCommand({ id: "iniciar-servidor", name: "Iniciar servidor MCP", callback: () => void this.iniciarServidor() });
		this.addCommand({ id: "parar-servidor", name: "Parar servidor MCP", callback: () => void this.pararServidor() });
		this.addCommand({ id: "conectar-claude-desktop", name: "Conectar ao Claude Desktop", callback: () => void this.conectarAoClaudeDesktop() });
		this.addCommand({ id: "copiar-comando-claude-code", name: "Copiar comando do Claude Code", callback: () => void this.copiarComandoClaudeCode() });
		this.addCommand({ id: "exportar-mcpb", name: "Exportar extensão do Claude Desktop (.mcpb)", callback: () => void this.exportarMcpb() });
		this.addCommand({ id: "registro-atividade", name: "Mostrar registro de atividade", callback: () => new ModalRegistro(this.app, this.registro).open() });

		this.app.workspace.onLayoutReady(() => {
			void this.gravarPontePowerShell();
			if (this.configuracoes.iniciarComObsidian) void this.iniciarServidor();
		});
	}

	onunload(): void {
		void this.pararServidor(true);
	}

	// ---------------------------------------------------------------- configurações

	private async carregarConfiguracoes(): Promise<void> {
		const salvas = ((await this.loadData()) ?? {}) as Partial<ConfiguracoesProjurista>;
		this.configuracoes = { ...CONFIGURACOES_PADRAO, ...salvas, pastasExcluidas: salvas.pastasExcluidas ?? [...CONFIGURACOES_PADRAO.pastasExcluidas] };
		if (!this.configuracoes.token) {
			this.configuracoes.token = gerarToken();
			await this.salvarConfiguracoes();
		}
	}

	async salvarConfiguracoes(): Promise<void> {
		await this.saveData(this.configuracoes);
		this.atualizarBarraStatus();
	}

	async gerarNovoToken(): Promise<void> {
		this.configuracoes.token = gerarToken();
		await this.salvarConfiguracoes();
		this.registro.aviso("Token regenerado. As conexões existentes deixam de valer.");
		new Notice("Token novo gerado. Conecte de novo o Claude Desktop e os demais clientes.");
	}

	nomeServidorPadrao(): string {
		return nomeServidorEfetivo({ ...this.configuracoes, nomeServidor: "" }, this.app.vault.getName());
	}

	nomeServidor(): string {
		return nomeServidorEfetivo(this.configuracoes, this.app.vault.getName());
	}

	// ---------------------------------------------------------------- servidor

	estadoServidor(): EstadoServidor {
		return {
			ligado: this.tcp.ativo,
			portaTcp: this.tcp.portaAtual,
			portaHttp: this.http.ativo ? this.http.portaAtual : 0,
			conexoes: this.tcp.conexoesAtivas,
		};
	}

	async iniciarServidor(): Promise<void> {
		if (this.iniciando) return this.iniciando;
		if (this.tcp.ativo) return;
		this.iniciando = (async () => {
			try {
				const portaTcp = await this.tcp.iniciar(this.configuracoes.portaTcp);
				if (portaTcp !== this.configuracoes.portaTcp) {
					this.registro.aviso(`Porta TCP ${this.configuracoes.portaTcp} ocupada; usando ${portaTcp}. Conecte de novo ao Claude Desktop.`);
					new Notice(`Projurista MCP: a porta ${this.configuracoes.portaTcp} estava ocupada; o servidor usa a ${portaTcp}. Conecte de novo ao Claude Desktop.`, 10_000);
					this.configuracoes.portaTcp = portaTcp;
					await this.salvarConfiguracoes();
				}
				if (this.configuracoes.httpAtivo) {
					const portaHttp = await this.http.iniciar(this.configuracoes.portaHttp);
					if (portaHttp !== this.configuracoes.portaHttp) {
						this.registro.aviso(`Porta HTTP ${this.configuracoes.portaHttp} ocupada; usando ${portaHttp}.`);
						this.configuracoes.portaHttp = portaHttp;
						await this.salvarConfiguracoes();
					}
				}
				this.registro.info(`Servidor ligado: TCP ${portaTcp}${this.http.ativo ? `, HTTP ${this.http.portaAtual}` : ""}.`);
			} catch (erro) {
				const mensagem = erro instanceof Error ? erro.message : String(erro);
				this.registro.erro(`Não foi possível iniciar o servidor: ${mensagem}`);
				new Notice(`Projurista MCP: não foi possível iniciar o servidor. ${mensagem}`, 10_000);
				await this.tcp.parar();
				await this.http.parar();
			} finally {
				this.iniciando = null;
				this.atualizarBarraStatus();
			}
		})();
		return this.iniciando;
	}

	async pararServidor(silencioso = false): Promise<void> {
		const estavaLigado = this.tcp.ativo || this.http.ativo;
		await this.tcp.parar();
		await this.http.parar();
		if (estavaLigado && !silencioso) this.registro.info("Servidor desligado.");
		this.atualizarBarraStatus();
	}

	async reiniciarServidor(): Promise<void> {
		await this.pararServidor(true);
		await this.iniciarServidor();
	}

	avisarListaDeFerramentasMudou(): void {
		this.tcp.notificarTodos({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
	}

	private atualizarBarraStatus(): void {
		if (!this.itemBarraStatus) return;
		const estado = this.estadoServidor();
		this.itemBarraStatus.setText(estado.ligado ? `MCP ● ${estado.portaTcp}` : "MCP ○");
		this.itemBarraStatus.setAttr("aria-label", estado.ligado ? `Projurista MCP ligado na porta ${estado.portaTcp}` : "Projurista MCP desligado");
	}

	// ---------------------------------------------------------------- Claude Desktop

	private caminhoAbsolutoDoPlugin(): string | null {
		const adaptador = this.app.vault.adapter;
		if (!(adaptador instanceof FileSystemAdapter) || !this.manifest.dir) return null;
		return path.join(adaptador.getBasePath(), ...this.manifest.dir.split("/"));
	}

	private async gravarPontePowerShell(): Promise<void> {
		if (!this.manifest.dir) return;
		try {
			const caminho = normalizePath(`${this.manifest.dir}/ponte.ps1`);
			await this.app.vault.adapter.write(caminho, "﻿" + PONTE_POWERSHELL);
		} catch (erro) {
			this.registro.erro(`Não foi possível gravar ponte.ps1: ${erro instanceof Error ? erro.message : String(erro)}`);
		}
	}

	parametrosConexao(): ParametrosConexao {
		const base = this.caminhoAbsolutoDoPlugin() ?? "";
		return {
			nomeServidor: this.nomeServidor(),
			portaTcp: this.configuracoes.portaTcp,
			portaHttp: this.configuracoes.portaHttp,
			httpAtivo: this.configuracoes.httpAtivo,
			token: this.configuracoes.token,
			caminhoPontePowerShell: path.join(base, "ponte.ps1"),
		};
	}

	async conectarAoClaudeDesktop(): Promise<void> {
		const plataforma = plataformaAtual();
		const caminho = caminhoConfigClaude(plataforma);
		if (!caminho) {
			new Notice("Sistema operacional não suportado para a configuração automática. Use \"Copiar JSON do Claude Desktop\".");
			return;
		}
		await this.gravarPontePowerShell();
		const parametros = this.parametrosConexao();
		const instalado = claudeDesktopInstalado(plataforma);
		const entrada = entradaServidor(parametros, plataforma);
		const paragrafos = [
			`O plugin vai gravar a conexão "${parametros.nomeServidor}" no arquivo de configuração do Claude Desktop, fora do cofre:`,
			caminho,
			"Se o arquivo já existir, uma cópia de segurança será feita antes. Outras conexões já configuradas são preservadas.",
		];
		if (!instalado) {
			paragrafos.push("Atenção: a pasta do Claude Desktop não foi encontrada. Ele parece não estar instalado, ou nunca foi aberto. Você pode criar a pasta mesmo assim ou instalar o Claude Desktop antes.");
		}
		const confirmado = await ModalConfirmacao.perguntar(this.app, {
			titulo: "Conectar ao Claude Desktop",
			paragrafos,
			codigo: JSON.stringify({ [parametros.nomeServidor]: entrada }, null, 2),
			rotuloConfirmar: instalado ? "Gravar" : "Criar pasta e gravar",
		});
		if (!confirmado) return;

		try {
			const resultado = gravarNoClaudeDesktop(parametros, { criarPastaSeAusente: true }, plataforma);
			this.registro.info(`Conexão gravada em ${resultado.caminho}${resultado.copiaDeSeguranca ? ` (cópia em ${resultado.copiaDeSeguranca})` : ""}.`);
			if (!this.tcp.ativo) await this.iniciarServidor();
			const passos = [
				"Feche o Claude Desktop por completo: no macOS, menu Claude → Quit (⌘Q); no Windows, clique com o botão direito no ícone da bandeja e saia.",
				"Abra o Claude Desktop de novo.",
				`Em uma conversa, clique no botão de ferramentas (ou em “+” → Connectors) e confira se "${parametros.nomeServidor}" aparece.`,
				"Peça algo como: \"Liste as pastas do meu cofre do Obsidian\".",
				"Mantenha o Obsidian aberto enquanto usa o Claude: o servidor roda dentro dele.",
			];
			if (resultado.arquivoEstavaCorrompido) {
				passos.unshift(`O arquivo anterior do Claude Desktop estava com erro de sintaxe e foi substituído. A cópia está em ${resultado.copiaDeSeguranca}.`);
			}
			new ModalPassos(this.app, {
				titulo: "Conexão gravada",
				introducao: resultado.copiaDeSeguranca ? `Cópia de segurança do arquivo anterior: ${resultado.copiaDeSeguranca}` : "O arquivo de configuração foi criado.",
				passos,
			}).open();
		} catch (erro) {
			const mensagem = erro instanceof Error ? erro.message : String(erro);
			this.registro.erro(`Falha ao gravar no Claude Desktop: ${mensagem}`);
			new Notice(`Não foi possível gravar a configuração: ${mensagem}`, 10_000);
		}
	}

	async desconectarDoClaudeDesktop(): Promise<void> {
		const nome = this.nomeServidor();
		const confirmado = await ModalConfirmacao.perguntar(this.app, {
			titulo: "Desfazer conexão",
			paragrafos: [`Remover a conexão "${nome}" do arquivo de configuração do Claude Desktop? Uma cópia de segurança será feita antes.`],
			rotuloConfirmar: "Remover",
			perigoso: true,
		});
		if (!confirmado) return;
		try {
			const removido = removerDoClaudeDesktop(nome);
			new Notice(removido ? "Conexão removida. Reinicie o Claude Desktop." : "A conexão não estava configurada.");
			if (removido) this.registro.info(`Conexão "${nome}" removida do Claude Desktop.`);
		} catch (erro) {
			new Notice(`Não foi possível alterar o arquivo: ${erro instanceof Error ? erro.message : String(erro)}`);
		}
	}

	async copiarConfiguracaoJson(): Promise<void> {
		const parametros = this.parametrosConexao();
		const json = JSON.stringify(configuracaoCompleta(parametros), null, 2);
		await navigator.clipboard.writeText(json);
		const caminho = caminhoConfigClaude() ?? "claude_desktop_config.json";
		new ModalPassos(this.app, {
			titulo: "Configuração copiada",
			introducao: "Cole o trecho abaixo no arquivo de configuração do Claude Desktop. Se já houver uma chave mcpServers, acrescente só a entrada interna.",
			passos: [
				"No Claude Desktop, abra Settings → Developer → Edit Config.",
				`O arquivo é ${caminho}.`,
				"Cole o trecho, salve e reinicie o Claude Desktop por completo.",
			],
			codigo: json,
			textoParaCopiar: json,
			rotuloCopiar: "Copiar de novo",
		}).open();
	}

	async copiarComandoClaudeCode(): Promise<void> {
		if (!this.configuracoes.httpAtivo) {
			new Notice("Ligue o transporte HTTP nas configurações para usar o Claude Code.");
			return;
		}
		const comando = comandoClaudeCode(this.parametrosConexao());
		await navigator.clipboard.writeText(comando);
		new ModalPassos(this.app, {
			titulo: "Comando copiado",
			introducao: "Cole o comando no terminal, na pasta do projeto em que usa o Claude Code. Para disponibilizar em todos os projetos, acrescente --scope user.",
			passos: ["Abra o terminal.", "Cole o comando e pressione Enter.", "No Claude Code, digite /mcp para conferir a conexão."],
			codigo: comando,
			textoParaCopiar: comando,
			rotuloCopiar: "Copiar de novo",
		}).open();
	}

	async exportarMcpb(): Promise<void> {
		try {
			const parametros = this.parametrosConexao();
			const pacote = montarMcpb({
				nomeServidor: parametros.nomeServidor,
				nomeCofre: this.app.vault.getName(),
				portaTcp: parametros.portaTcp,
				token: parametros.token,
				versao: this.manifest.version,
				ferramentas: this.despachante.ferramentasVisiveis(),
			});
			const destino = await salvarMcpb(pacote, nomeArquivoMcpb(parametros.nomeServidor));
			if (!destino) return;
			this.registro.info(`Extensão .mcpb salva em ${destino}.`);
			new ModalPassos(this.app, {
				titulo: "Extensão exportada",
				introducao: `Arquivo salvo em: ${destino}`,
				passos: [
					"No Claude Desktop, abra Settings → Extensions.",
					"Clique em Advanced settings e, na seção Extension Developer, em Install Extension…",
					"Escolha o arquivo .mcpb salvo e confirme a instalação.",
					"Mantenha o Obsidian aberto: a extensão é só uma ponte para o plugin.",
					"Se gerar um token novo ou mudar a porta, exporte e instale a extensão de novo.",
				],
			}).open();
		} catch (erro) {
			const mensagem = erro instanceof Error ? erro.message : String(erro);
			this.registro.erro(`Falha ao exportar .mcpb: ${mensagem}`);
			new Notice(`Não foi possível exportar a extensão: ${mensagem}`, 10_000);
		}
	}

	// ---------------------------------------------------------------- diagnóstico

	async testarConexao(): Promise<void> {
		if (!this.tcp.ativo) await this.iniciarServidor();
		const resultados: string[] = [];
		resultados.push(await this.testarTcp());
		if (this.configuracoes.httpAtivo && this.http.ativo) resultados.push(await this.testarHttp());
		const estado = estadoNoClaudeDesktop(this.parametrosConexao());
		resultados.push(
			estado === "atualizado"
				? "Claude Desktop: conexão gravada e atualizada."
				: estado === "desatualizado"
					? "Claude Desktop: a conexão gravada está desatualizada (porta ou token mudaram). Clique em Conectar ao Claude Desktop."
					: "Claude Desktop: conexão ainda não gravada.",
		);
		new ModalPassos(this.app, { titulo: "Resultado do teste", passos: resultados }).open();
	}

	private testarTcp(): Promise<string> {
		return new Promise((resolver) => {
			const socket = net.connect({ host: "127.0.0.1", port: this.tcp.portaAtual });
			let resposta = "";
			const temporizador = window.setTimeout(() => {
				socket.destroy();
				resolver("TCP: sem resposta em 5 segundos.");
			}, 5000);
			socket.setEncoding("utf8");
			socket.on("connect", () => {
				socket.write(`${PREFIXO_TOKEN}${this.configuracoes.token}\n`);
				socket.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) + "\n");
			});
			socket.on("data", (pedaco: string) => {
				resposta += pedaco;
				if (resposta.includes("\n")) {
					window.clearTimeout(temporizador);
					socket.end();
					resolver(resposta.includes('"result"') ? `TCP: ok na porta ${this.tcp.portaAtual}.` : `TCP: resposta inesperada: ${resposta.trim()}`);
				}
			});
			socket.on("error", (erro) => {
				window.clearTimeout(temporizador);
				resolver(`TCP: falha (${erro.message}).`);
			});
		});
	}

	private testarHttp(): Promise<string> {
		return new Promise((resolver) => {
			const corpo = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
			const requisicao = http.request(
				{
					host: "127.0.0.1",
					port: this.http.portaAtual,
					path: "/mcp",
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json, text/event-stream",
						Authorization: `Bearer ${this.configuracoes.token}`,
						"Content-Length": Buffer.byteLength(corpo),
					},
					timeout: 5000,
				},
				(res) => {
					let dados = "";
					res.setEncoding("utf8");
					res.on("data", (p: string) => (dados += p));
					res.on("end", () => resolver(res.statusCode === 200 && dados.includes('"result"') ? `HTTP: ok em http://127.0.0.1:${this.http.portaAtual}/mcp.` : `HTTP: status ${res.statusCode}: ${dados}`));
				},
			);
			requisicao.on("timeout", () => {
				requisicao.destroy();
				resolver("HTTP: sem resposta em 5 segundos.");
			});
			requisicao.on("error", (erro) => resolver(`HTTP: falha (${erro.message}).`));
			requisicao.end(corpo);
		});
	}
}

function gerarToken(): string {
	return randomBytes(24).toString("base64url");
}
