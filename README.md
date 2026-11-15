# Projurista MCP

Conecte o Claude Desktop e o Claude Code ao seu cofre do Obsidian com um clique, sem instalar Node.js, sem certificados e sem editar arquivos JSON à mão.

O plugin roda um servidor [MCP](https://modelcontextprotocol.io) (Model Context Protocol) dentro do próprio Obsidian. O Claude passa a enxergar suas notas como ferramentas: listar pastas, ler notas, pesquisar, consultar tags e links e, se você permitir, criar e editar notas.

Gratuito, sem conta, sem doações, sem telemetria. Feito pela [Projurista](https://www.instagram.com/projurista/) para quem usa inteligência artificial aplicada ao Direito, mas serve a qualquer cofre. Artigos e novidades no [Substack de Jaime Zacarias](https://substack.com/@jaimezacariasprojurista).

[English summary below](#english).

## Instalação

### Pelo diretório de plugins da comunidade

1. No Obsidian, abra Configurações → Plugins de terceiros e desligue o modo restrito.
2. Clique em Procurar, pesquise "Projurista MCP" e instale.
3. Ative o plugin.

### Pelo BRAT (enquanto o plugin não aparece no diretório)

1. Instale o plugin [BRAT](https://github.com/TfTHacker/obsidian42-brat) pelo diretório da comunidade.
2. Em BRAT → Add beta plugin, informe `Ja1meZ/projurista-mcp`.
3. Ative o Projurista MCP em Plugins de terceiros.

### Manual

Baixe `main.js`, `manifest.json` e `styles.css` da [última release](https://github.com/Ja1meZ/projurista-mcp/releases), copie para `<seu cofre>/.obsidian/plugins/projurista-mcp/` e ative o plugin.

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

Busca semântica (aparece só quando o plugin [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) está instalado, ativo e com modelo de embeddings carregado):

| Ferramenta | O que faz |
|---|---|
| `buscar_semantica` | Encontra notas ou trechos por significado, mesmo sem coincidência de palavras; usa os embeddings locais do Smart Connections, sem enviar nada para fora |

Súmulas (ligadas por padrão; desligue em "Ferramentas de súmulas" se não quiser):

| Ferramenta | O que faz |
|---|---|
| `obter_sumula` | Devolve o enunciado literal de uma súmula do STF (comum ou vinculante), do STJ ou do TJPE, com a situação, a fonte oficial e a citação pronta |
| `buscar_sumulas` | Pesquisa súmulas por palavras do enunciado, sem diferenciar acentos |
| `verificar_citacoes_sumulas` | Confere todas as citações de súmula de um texto, palavra por palavra, e alerta para súmula cancelada, revogada ou superada |

Precedentes qualificados do STJ e do STF (ligadas por padrão; desligue em "Ferramentas de precedentes qualificados" se não quiser):

| Ferramenta | O que faz |
| --- | --- |
| `obter_precedente` | Devolve a tese literal de um tema repetitivo, IAC ou tema de relevância do STJ, ou de um tema de repercussão geral do STF, com a questão julgada, a situação, a suspensão de processos, os paradigmas e os avisos |
| `buscar_precedentes` | Pesquisa os precedentes pela questão jurídica e separa as teses transitadas em julgado do que ainda está afetado, sem trânsito ou revisado |
| `verificar_citacoes_precedentes` | Confere todas as referências a tema do STJ e do STF e a IAC do STJ em um texto: existência, situação e transcrição da tese, palavra por palavra |

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

## Súmulas: texto literal e conferência de citações

Modelos de linguagem erram enunciado de súmula: trocam uma palavra, citam súmula cancelada ou atribuem o texto ao número errado. O plugin traz embutida uma base com as Súmulas Vinculantes (1 a 63), as Súmulas do STF (1 a 736), as Súmulas do STJ (1 a 676) e as Súmulas do TJPE (1 a 200), copiadas das publicações oficiais dos tribunais e conferidas por mais de uma via de extração. Cada registro guarda a situação (vigente, cancelada, revogada, superada, alterada), a fonte e o hash do texto.

- Para escrever: o Claude chama `obter_sumula` e copia o enunciado devolvido, em vez de redigi-lo de memória.
- Para conferir: `verificar_citacoes_sumulas` recebe o texto inteiro (uma minuta, uma petição, um voto), localiza as referências por expressões regulares e compara cada transcrição com o enunciado oficial. A comparação é feita por código, sem modelo de linguagem. O relatório diz o que confere, mostra a palavra divergente, aponta número que não corresponde ao texto e termina com um veredito do documento.

Limites que convém conhecer:

- O servidor MCP não obriga o Claude a chamá-lo. Peça a conferência ("verifique as súmulas deste texto") ou ponha a regra nas instruções do seu projeto.
- A base é uma fotografia das fontes oficiais na data indicada nas configurações do plugin. Súmula posterior a essa data sai como "não encontrada na base", o que não significa que não exista.
- Só são conferidas as referências com número ("Súmula 7 do STJ", "SV 10", "Súmula 130 do TJPE"). Súmulas de outros tribunais são apenas relacionadas no relatório.
- Onde as publicações oficiais do TJPE divergem entre si, o registro traz a observação e as duas redações.

A base vai dentro do plugin e é atualizada a cada versão: nada é baixado da internet.

### Servidor avulso, sem Obsidian

Cada release traz também `projurista-sumulas.mjs`, um arquivo único com as mesmas três ferramentas, para quem quer só as súmulas (requer Node.js 18 ou mais novo):

```
claude mcp add projurista-sumulas -- node /caminho/para/projurista-sumulas.mjs
```

O mesmo arquivo serve na linha de comando, para scripts e ganchos: `node projurista-sumulas.mjs verificar minuta.txt` imprime o relatório e termina com código 1 quando o veredito é "não verificado"; `node projurista-sumulas.mjs obter STJ 7` imprime o enunciado.

## Precedentes qualificados do STJ e do STF: saber se o caso tem tema aplicável

O plugin traz embutida a planilha oficial de precedentes qualificados do STJ (temas repetitivos, incidentes de assunção de competência, temas de relevância, controvérsias e SIRDR), com a questão submetida a julgamento, a tese, a situação, a ordem de suspensão, os processos paradigma e as anotações do tribunal. Na base de 14/11/2026 são 2.348 registros, dos quais 1.038 com tese transitada em julgado.

- Para saber se há precedente: o Claude chama `buscar_precedentes` com a questão jurídica do caso. A busca é por palavras da questão e da tese, feita por código: a mesma consulta devolve sempre o mesmo resultado. O retorno vem em dois blocos: as teses transitadas em julgado, que podem ser aplicadas, e um bloco de atenção com temas afetados (e a suspensão determinada), teses ainda sem trânsito e teses revisadas.
- Para citar: `obter_precedente` devolve a tese literal e a citação pronta.
- Para conferir: `verificar_citacoes_precedentes` recebe o texto inteiro, localiza as referências ("Tema 1.150 do STJ", "Tema Repetitivo n. 106", "IAC 5 do STJ"), confere se o precedente existe, qual a situação e se a tese transcrita confere com a oficial. Quebras de linha e espaços não contam como diferença; palavra trocada, sim. Tema cancelado citado sem ressalva e número que não corresponde ao texto reprovam o documento.

Limites que convém conhecer:

- A busca acha precedentes pelo vocabulário; decidir se a tese se aplica aos fatos do processo continua sendo trabalho de quem analisa. Não achar resultado não prova que não exista precedente: repita com outra formulação.
- Só a tese transitada em julgado é tratada como definitiva. As demais vêm sempre com a situação e o aviso.
- Do STF entram os temas de repercussão geral, da planilha oficial de dados abertos do tribunal (1.501 temas na base de 15/11/2026). Use `tribunal: "STF"` em `obter_precedente`; a busca e a verificação cobrem os dois tribunais. Controle concentrado (ADI, ADC, ADO, ADPF) não está na base.
- Tema do STF com repercussão geral negada aparece em bloco separado: tem enunciado, mas não é tese de mérito.
- As fontes do STF cortam as teses muito longas (a planilha em 4.000 caracteres, o portal em 8.000). A base completa pelo portal o que consegue e marca como incompleta a tese que continua cortada (na base de 15/11/2026, Temas 966, 976 e 1234): ela é devolvida com o aviso e sem "citação pronta", e a conferência só alcança o trecho disponível.
- A base do STF traz caracteres corrompidos em algumas teses ("¿" no lugar de espaço). O texto é guardado como veio; na comparação vale como espaço.
- Os avisos (modulação de efeitos, remissão a tema do STF, menção a revisão ou superação) são tirados por regra das anotações do STJ: indicam que é preciso ler a anotação, não a substituem.
- A base é uma fotografia da planilha na data indicada nas configurações do plugin.

### Servidor avulso e atualização da base

Cada release traz `projurista-precedentes.mjs`, um arquivo único com as mesmas três ferramentas (requer Node.js 18 ou mais novo):

```
claude mcp add projurista-precedentes -- node /caminho/para/projurista-precedentes.mjs
```

Na linha de comando: `node projurista-precedentes.mjs buscar "prescrição PASEP saque"`, `node projurista-precedentes.mjs obter tema 1150` e `node projurista-precedentes.mjs verificar minuta.txt` (termina com código 1 quando o veredito é "não verificado").

Para atualizar a base, exporte a planilha em https://processo.stj.jus.br/repetitivos/temas_repetitivos/ e rode, na pasta do repositório:

```
python3 scripts/exportar-base-precedentes-stj.py exportacao.xlsx --data-fonte AAAA-MM-DD
npm test && npm run build
```

O script só usa a biblioteca padrão do Python, copia os textos sem alterá-los e grava ao lado um relatório com o que mudou em relação à base anterior (temas novos, mudança de situação, tese alterada).

Para a base do STF, baixe "Repercussão Geral > Temas > xlsx" em https://transparencia.stf.jus.br/extensions/dados_abertos/dados_abertos.html e rode:

```
python3 scripts/exportar-base-precedentes-stf.py temas.xlsx --data-fonte AAAA-MM-DD [--complementos pasta]
npm test && npm run build
```

`--complementos` aponta uma pasta com a página do tema no portal do STF (`tema-<número>.html`) para as teses que a planilha corta; o cabeçalho do script traz o endereço.

## Busca semântica com o Smart Connections

A busca padrão (`buscar_notas`) é por palavras. Para pesquisar por significado, instale o plugin Smart Connections pelo diretório da comunidade, deixe-o criar os embeddings do cofre (modelo local, sem chave de API) e pronto: o Projurista MCP detecta o Smart Connections e passa a oferecer `buscar_semantica` ao Claude. O estado aparece no alto das configurações do plugin. Não há configuração adicional, e o Smart Connections é opcional: sem ele, tudo o mais continua funcionando.

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
- Dados embutidos: enunciados de súmulas do STF, do STJ e do TJPE, textos oficiais de domínio público, incluídos no próprio `main.js`. As ferramentas de súmulas não acessam a rede nem o cofre. O mesmo vale para as planilhas oficiais de precedentes qualificados do STJ (temas repetitivos e IAC) e de temas de repercussão geral do STF e suas três ferramentas.

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
### Disclosures (per the Obsidian developer policies)

- Network: the plugin opens local TCP and HTTP ports bound to `127.0.0.1` only, so MCP clients on the same computer can reach the vault. It never connects to the internet or to remote services.
- Files outside the vault (Node.js `fs` module): used only when you click "Connect to Claude Desktop" or "Undo", to read, back up (`.bak-<timestamp>`) and write `claude_desktop_config.json` in Claude Desktop's config folder (`~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows), always after an explicit confirmation dialog that shows the path and the entry to be written; and when you click "Export .mcpb", to save the bundle at the location you choose (default: Downloads). No other file outside the vault is read or written.
- Files inside the vault outside the Vault API: `ponte.ps1` is written into the plugin's own folder via the vault adapter; it is the Windows bridge script.
- No telemetry, no ads, no payment, no account.
- Third-party code: [fflate](https://github.com/101arrowz/fflate) (MIT), bundled to build the `.mcpb` zip.
- Bundled data: the official texts of Brazilian court precedent statements ("súmulas" of STF, STJ and TJPE, public-domain official acts) are embedded in `main.js`. The three súmula tools (`obter_sumula`, `buscar_sumulas`, `verificar_citacoes_sumulas`) look them up and check citations in a text deterministically; they use neither the network nor the vault. The official STJ spreadsheet of binding precedents ("temas repetitivos" and IAC) is embedded the same way and served by three more read-only tools (`obter_precedente`, `buscar_precedentes`, `verificar_citacoes_precedentes`). The official STF spreadsheet of "repercussão geral" themes is embedded too and served by the same three tools. These data sets are why `main.js` is about 9 MB.

License: MIT.
