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
