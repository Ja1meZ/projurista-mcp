# Guia do aluno: ligando o Claude ao seu cofre do Obsidian

Este guia leva uns cinco minutos. Ao final, o Claude Desktop vai conseguir ler (e, se você quiser, escrever) as notas do seu cofre.

## Antes de começar

- Obsidian instalado e um cofre aberto.
- Claude Desktop instalado e aberto ao menos uma vez (é isso que cria a pasta de configuração dele).
- Não precisa instalar Node.js, Python, Git nem certificados.

## Passo 1: instalar o plugin

Pelo diretório da comunidade:

1. Obsidian → Configurações (engrenagem) → Plugins de terceiros.
2. Se aparecer "Modo restrito", clique em "Desligar modo restrito".
3. Clique em "Procurar", pesquise "Projurista MCP" e clique em "Instalar".
4. Clique em "Ativar".

Pelo BRAT, se o plugin ainda não aparecer na busca:

1. Instale o plugin "BRAT" pelo mesmo diretório e ative-o.
2. Configurações → BRAT → "Add beta plugin" → cole `Ja1meZ/projurista-mcp` → "Add plugin".
3. Em Plugins de terceiros, ative o "Projurista MCP".

## Passo 2: conectar ao Claude Desktop

1. Configurações → Projurista MCP.
2. No alto, confira que está escrito "Servidor ligado". Se estiver desligado, clique em "Iniciar".
3. Clique em "Conectar ao Claude Desktop".
4. Leia a tela de confirmação (ela mostra o arquivo que será alterado e o trecho que entra nele) e clique em "Gravar".
5. Feche o Claude Desktop por completo:
   - macOS: menu Claude → Quit Claude (ou ⌘Q).
   - Windows: clique com o botão direito no ícone do Claude na bandeja, ao lado do relógio, e escolha sair.
6. Abra o Claude Desktop de novo.

## Passo 3: testar

Em uma conversa nova no Claude Desktop, peça:

> Liste as pastas do meu cofre do Obsidian.

Se o Claude pedir permissão para usar a ferramenta `listar_pastas`, permita. Ele deve responder com a árvore de pastas do seu cofre.

Outros pedidos para experimentar:

- "Procure no meu cofre notas sobre dano moral e resuma as três mais relevantes."
- "Leia a nota aberta no Obsidian e aponte inconsistências."
- "Quais notas têm a tag #processo?"

## Permitir que o Claude escreva no cofre (opcional)

Por padrão o Claude só lê. Para que ele crie ou edite notas:

1. Configurações → Projurista MCP → ligue "Permitir escrita".
2. Pronto; não precisa reiniciar nada. As ferramentas de escrita passam a aparecer na próxima conversa.

Sugestão: mantenha desligado no dia a dia e ligue só quando for pedir uma tarefa de escrita. Notas excluídas pelo Claude vão para a lixeira, nunca são apagadas em definitivo.

## Pesquisa por significado (opcional)

A busca padrão encontra palavras. Para o Claude encontrar notas por assunto, mesmo com outras palavras:

1. Instale o plugin "Smart Connections" pelo diretório da comunidade e ative-o.
2. Na primeira vez ele baixa um modelo pequeno e cria o índice do cofre; acompanhe pela barra de status do Obsidian. Em cofres grandes, isso pode levar alguns minutos.
3. Em Configurações → Projurista MCP, o alto da tela passa a mostrar "Smart Connections detectado: busca semântica disponível".
4. Pergunte ao Claude, por exemplo: "Que notas do meu cofre tratam de responsabilidade por negativação indevida?". Ele usará a ferramenta `buscar_semantica`.

Tudo roda no seu computador; nada é enviado para a internet.

## Súmulas sem erro de transcrição

O plugin traz embutidas as súmulas do STF (comuns e vinculantes), do STJ e do TJPE, em texto literal copiado das publicações oficiais. Não precisa instalar nem configurar nada, e funciona sem internet.

1. Para citar: peça "Transcreva a Súmula 7 do STJ" ou "Qual súmula do TJPE trata de fornecimento de medicamentos?". O Claude usa `obter_sumula` ou `buscar_sumulas` e copia o enunciado da base, com a situação (vigente, cancelada, revogada) e a fonte.
2. Para conferir: cole a sua minuta ou a petição da parte e peça "Verifique as citações de súmulas deste texto". O Claude chama `verificar_citacoes_sumulas`, que compara cada transcrição com o texto oficial, palavra por palavra, e devolve um relatório: o que confere, o que diverge (com a palavra trocada), súmula cancelada citada como vigente e número que não corresponde ao texto.

A conferência é feita pelo programa, não pela inteligência artificial. Ainda assim, quem decide chamar a ferramenta é o Claude: crie o hábito de pedir a verificação antes de assinar. Súmula mais nova que a base aparece como "não encontrada na base"; nesse caso, confira no portal do tribunal.

## Precedentes do STJ: o caso tem tema repetitivo?

O plugin também traz embutidos os precedentes qualificados do STJ (temas repetitivos e incidentes de assunção de competência), copiados da planilha oficial do tribunal, com a tese literal e a situação de cada um. Funciona sem internet.

1. Para descobrir se há precedente: descreva a questão e peça "Veja se há tema repetitivo do STJ sobre prescrição em ação de desfalque do PASEP". O Claude usa `buscar_precedentes` e devolve as teses transitadas em julgado e, separadamente, o que pede atenção: tema afetado (com a suspensão determinada), tese ainda sem trânsito e tese revisada.
2. Para citar: peça "Transcreva a tese do Tema 1.150 do STJ". O Claude usa `obter_precedente` e copia a tese da base.
3. Para conferir: cole a minuta e peça "Verifique os temas do STJ citados neste texto". O Claude chama `verificar_citacoes_precedentes`, que diz se cada tema existe, se transitou em julgado e se a tese transcrita confere com a oficial, apontando a palavra trocada.

A busca encontra os precedentes pelo vocabulário; avaliar se a tese se aplica aos fatos do seu processo é com você. Se nada aparecer, tente outras palavras antes de concluir que não há precedente. Temas do STF (repercussão geral) não estão na base.

## Esconder pastas do Claude

Configurações → Projurista MCP → "Pastas ocultas". Escreva uma pasta por linha (por exemplo, `Sigiloso` ou `Clientes/Confidencial`). Essas pastas ficam invisíveis em todas as ferramentas.

## Se algo der errado

| Sintoma | O que fazer |
|---|---|
| A conexão não aparece no Claude | Feche o Claude por completo (não só a janela) e abra de novo. No Obsidian, confira se o servidor está ligado. |
| O Claude diz que o servidor falhou ao iniciar | Abra o Obsidian primeiro, com o cofre certo, e depois o Claude. A ponte espera até 60 segundos pelo Obsidian. |
| Mensagem de porta ocupada | O plugin já escolheu outra porta. Clique de novo em "Conectar ao Claude Desktop" e reinicie o Claude. |
| Gerei um token novo | Clique de novo em "Conectar ao Claude Desktop" e reinicie o Claude. |
| Windows bloqueia scripts do PowerShell | Use o caminho alternativo abaixo (extensão .mcpb). |
| Quero ver o que o Claude está fazendo | Configurações → Projurista MCP → "Registro de atividade". |

Botão "Testar conexão": o próprio plugin confere os dois transportes e diz se a entrada no Claude Desktop está atualizada.

## Caminho alternativo: extensão .mcpb

Se a gravação automática não servir (política da empresa, por exemplo):

1. Configurações → Projurista MCP → "Exportar .mcpb" e salve o arquivo.
2. No Claude Desktop: Settings → Extensions → Advanced settings → seção Extension Developer → "Install Extension…".
3. Escolha o arquivo salvo e confirme.
4. Reinicie o Claude Desktop.

Se você gerar um token novo ou a porta mudar, exporte e instale a extensão de novo.

## Para quem usa o Claude Code

Configurações → Projurista MCP → "Copiar comando do Claude Code". Cole no terminal, dentro da pasta do projeto (ou acrescente `--scope user` para valer em todos os projetos). Depois, no Claude Code, digite `/mcp` para conferir.

## Dois cofres no mesmo Claude

Cada cofre tem sua própria porta e seu próprio nome de conexão (`obsidian-<nome-do-cofre>`). Repita o Passo 2 em cada cofre; os dois aparecem lado a lado no Claude.
