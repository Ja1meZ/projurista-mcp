# Projurista MCP

Conecte o Claude Desktop e o Claude Code ao seu cofre do Obsidian com um clique, sem instalar Node.js, sem certificados e sem editar arquivos JSON à mão.

O plugin roda um servidor [MCP](https://modelcontextprotocol.io) (Model Context Protocol) dentro do próprio Obsidian. O Claude passa a enxergar suas notas como ferramentas: listar pastas, ler notas, pesquisar, consultar tags e links e, se você permitir, criar e editar notas.

Gratuito, sem conta, sem doações, sem telemetria. Feito pela [Projurista](https://projurista.com.br) para quem usa inteligência artificial aplicada ao Direito, mas serve a qualquer cofre.

[English summary below](#english).

## Instalação

### Pelo diretório de plugins da comunidade

1. No Obsidian, abra Configurações → Plugins de terceiros e desligue o modo restrito.
2. Clique em Procurar, pesquise "Projurista MCP" e instale.
3. Ative o plugin.

### Pelo BRAT (enquanto o plugin não aparece no diretório)

1. Instale o plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat) pelo diretório da comunidade.
2. Em BRAT → Add beta plugin, informe `projurista/projurista-mcp`.
3. Ative o Projurista MCP em Plugins de terceiros.

### Manual

Baixe `main.js`, `manifest.json` e `styles.css` da [última release](https://github.com/projurista/projurista-mcp/releases), copie para `<seu cofre>/.obsidian/plugins/projurista-mcp/` e ative o plugin.

## Conectar ao Claude Desktop (um clique)

1. Abra Configurações → Projurista MCP.
2. Clique em "Conectar ao Claude Desktop" e confirme.
3. Feche o Claude Desktop por completo e abra de novo.
4. Em uma conversa, confira se a conexão aparece entre as ferramentas e peça: "Liste as pastas do meu cofre do Obsidian".

Mantenha o Obsidian aberto enquanto usa o Claude: o servidor roda dentro dele.

O que acontece por trás: o plugin grava uma entrada no arquivo de configuração do Claude Desktop (`claude_desktop_config.json`), com cópia de segurança do arquivo anterior. A entrada usa programas que já vêm com o sistema (no macOS, `/bin/sh` e `/usr/bin/nc`; no Windows, `powershell.exe` com um pequeno script gravado na pasta do plugin) para ligar o Claude ao servidor que roda no Obsidian. Nada é baixado nem instalado.

### Alternativas

- Extensão `.mcpb`: clique em "Exportar .mcpb" e instale o arquivo no Claude Desktop em Settings → Extensions → Advanced settings → Install Extension… O Claude Desktop traz o próprio Node.js, então essa ponte também dispensa instalação.
- Claude Code: clique em "Copiar comando do Claude Code" e cole no terminal. O comando usa o transporte Streamable HTTP em `http://127.0.0.1:<porta>/mcp`, com o token no cabeçalho `Authorization`.
- Outros clientes (Cursor, Windsurf, Cherry Studio etc.): qualquer cliente com suporte a Streamable HTTP pode usar a mesma URL e o mesmo token.
- Manual: "Copiar JSON do Claude Desktop" copia o trecho para colar em Settings → Developer → Edit Config.

## Ferramentas disponíveis

Leitura (sempre ativas):

| Ferramenta | O que faz |
|---|---|
| `info_do_cofre` | Nome do cofre, quantidade de notas e pastas, modo de escrita, pastas ocultas |
| `listar_pastas` | Árvore de pastas com a quantidade de arquivos |
| `listar_notas` | Arquivos de uma pasta, com tamanho e data |
| `ler_nota` | Conteúdo integral de uma nota, com frontmatter, tags, cabeçalhos e links |
| `ler_varias_notas` | Até 20 notas de uma vez |
| `buscar_notas` | Pesquisa de texto com trechos de contexto |
| `buscar_por_tag` | Notas com uma tag (inclui subtags) |
| `listar_tags` | Todas as tags e a quantidade de notas |
| `notas_recentes` | Notas modificadas há menos tempo |
| `nota_ativa` | A nota aberta no Obsidian |
| `links_da_nota` | Links de saída e backlinks |
| `abrir_nota` | Abre uma nota na janela do Obsidian |

Escrita (só com a chave "Permitir escrita" ligada):

| Ferramenta | O que faz |
|---|---|
| `criar_nota` | Cria uma nota (e as pastas necessárias) |
| `anexar_a_nota` | Acrescenta texto ao final |
| `substituir_nota` | Substitui o conteúdo inteiro |
| `substituir_trecho` | Troca um trecho exato, que deve ser único |
| `editar_frontmatter` | Define ou remove propriedades |
| `mover_nota` | Move ou renomeia, atualizando os links |
| `excluir_nota` | Envia para a lixeira (nunca apaga em definitivo) |

## Segurança

- O servidor escuta apenas em `127.0.0.1`. Nenhuma porta fica aberta para a rede.
- Toda conexão exige um token gerado pelo plugin. Sem ele, a conexão é recusada. Você pode gerar um token novo a qualquer momento.
- O modo padrão é somente leitura. As ferramentas de escrita nem aparecem para o Claude até você ligar a chave "Permitir escrita".
- Pastas ocultas: liste as pastas que o Claude nunca deve ver (por exemplo, `Sigiloso`). `.obsidian` e `.trash` são sempre ocultas.
- O transporte HTTP valida o cabeçalho `Origin` para impedir ataques de DNS rebinding a partir do navegador.
- O registro de atividade mostra as sessões e as chamadas de ferramentas; ele fica só na memória do Obsidian.

## Divulgações exigidas pela política de plugins do Obsidian

- Rede: o plugin abre portas locais (TCP e HTTP) apenas em `127.0.0.1`, para que clientes MCP no mesmo computador se conectem ao cofre. Não há acesso à internet nem a serviços remotos.
- Arquivos fora do cofre: ao clicar em "Conectar ao Claude Desktop" ou "Desfazer", o plugin lê e grava o arquivo `claude_desktop_config.json` do Claude Desktop (em `~/Library/Application Support/Claude/` no macOS, `%APPDATA%\Claude\` no Windows), sempre após sua confirmação e com cópia de segurança. "Exportar .mcpb" grava um arquivo no local que você escolher (padrão: Downloads). Nenhum outro arquivo fora do cofre é tocado.
- Dentro do cofre, o plugin grava `ponte.ps1` na própria pasta (`.obsidian/plugins/projurista-mcp/`), usado apenas no Windows.
- Sem telemetria, sem anúncios, sem pagamento, sem conta.
- Código de terceiros: [fflate](https://github.com/101arrowz/fflate) (MIT), usado para montar o pacote `.mcpb`.

## Problemas comuns

- O Claude não mostra a conexão: feche o Claude Desktop por completo (no macOS, ⌘Q; no Windows, saia pelo ícone da bandeja) e abra de novo. Confira em Configurações → Projurista MCP se o servidor está ligado.
- "O Obsidian não está aberto": o servidor roda dentro do Obsidian. Abra o cofre antes de usar o Claude. A ponte espera até 60 segundos pelo Obsidian.
- Porta ocupada: o plugin escolhe a porta livre seguinte e avisa. Clique em "Conectar ao Claude Desktop" de novo para atualizar.
- Token novo: depois de gerar um token, reconecte o Claude Desktop (botão) e refaça o comando do Claude Code.
- Windows com política de execução restrita: a ponte é chamada com `-ExecutionPolicy Bypass`, que vale só para aquele processo. Se a política corporativa bloquear, use a alternativa `.mcpb`.
- Vários cofres: cada cofre tem porta e nome próprios (`obsidian-<nome-do-cofre>`), então podem conviver no mesmo Claude.

## Desenvolvimento

```bash
npm install
npm run dev     # recompila a cada alteração
npm run build   # verificação de tipos + bundle de produção
```

Estrutura: `src/mcp` (despachante JSON-RPC e ferramentas), `src/transports` (TCP por linha e Streamable HTTP), `src/claude` (configuração do Claude Desktop, pontes e `.mcpb`), `src/ui` (aba de configurações e modais).

## Licença

MIT. Veja [LICENSE](LICENSE).

---

## English

Projurista MCP runs a local [MCP](https://modelcontextprotocol.io) server inside Obsidian and connects Claude Desktop (one click) and Claude Code (one command) to your vault, with no Node.js install, no self-signed certificates and no manual JSON editing.

- Read-only by default; write tools (create, append, replace, edit frontmatter, move, trash) only appear after you enable "Allow writing".
- Binds to `127.0.0.1` only; every connection requires a generated token; the HTTP transport validates `Origin`.
- "Connect to Claude Desktop" writes an entry to `claude_desktop_config.json` (after confirmation, with a backup) that uses only OS-provided programs as a stdio bridge: `/bin/sh` + `nc` on macOS, `powershell.exe` on Windows. Alternatively export a `.mcpb` extension (Claude Desktop ships its own Node.js) or copy the Claude Code command (Streamable HTTP with bearer token).
- Tool names and descriptions are in Brazilian Portuguese, the language of the plugin's audience; any MCP client works with them.
- Disclosures: local ports on loopback only; reads and writes the Claude Desktop config file outside the vault on explicit user action; writes `ponte.ps1` inside the plugin folder; no telemetry, no ads, no payment; bundles [fflate](https://github.com/101arrowz/fflate) (MIT).

License: MIT.
