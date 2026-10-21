# Changelog

Todas as mudancas relevantes deste projeto sao documentadas aqui.
O formato segue o padrao [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [1.0.0] - 2026-10-21

Primeira versao consolidada do painel e do bot.

### Adicionado

**Painel**

- Rotas proprias no `server.js`, antes do proxy: `/api/status`, `/api/services/:servico/:acao`, `/api/console/minecraft`, `/api/whitelist` e `/api/ban`
- Helper `chamar` com resolucao defensiva de nomes de metodo, para nao quebrar se o `manager.js` usar outro padrao
- Sessao persistida em SQLite, com cookie `httpOnly` e `sameSite: lax`
- Gerenciador de arquivos com areas configuraveis, upload, edicao de texto e protecao contra path traversal
- Consoles em tempo real por WebSocket, separados para servidor, bot e logs do Discord
- Bloqueio por IP apos 5 tentativas de login falhas, por 15 minutos
- Log de acessos em `acessos.log`

**Bot**

- Runtime do bot em `src/bot/client.js`, com metricas de latencia, servidores e comandos
- Carregador unico de comandos, que varre as subpastas e aceita apenas o padrao `{ dados, executar }`
- Banco SQLite em `dados/bot.db` com `journal_mode = WAL`
- Tabelas novas: `esmeraldas`, `reputacoes` e `lembretes`
- Agendador em `src/bot/util/agendador.js`, que dispara os lembretes vencidos
- Sistema de economia com a moeda Esmeralda
- Sistema de reputacao entre membros
- Sistema de tickets com botao persistente, que sobrevive a reinicio do bot
- 37 slash commands em 9 categorias: Informacao, Minecraft, Moderacao, Tickets, Configuracao, Economia, Social, Utilidade e Diversao

### Alterado

- Todos os comandos migrados do modelo antigo (`data` / `execute` / `interaction`) para o novo (`dados` / `executar` / `interacao`), com o campo `categoria` para agrupar no `/help`
- Permissoes dos comandos movidas para `setDefaultMemberPermissions`, em vez de checagem manual dentro do codigo
- Respostas padronizadas em embed, com cores por categoria e rodape fixo

### Corrigido

- Comandos duplicados: o carregador legado lia `commands/` na raiz e sobrescrevia os comandos novos. A pasta foi removida e o carregador legado, eliminado
- "Sem conexao" no cabecalho do painel, causado por rotas ausentes na API interna
- Erro HTTP 404 ao iniciar o bot pelo interruptor do painel
- Latencia negativa exibida como `-1` quando o primeiro heartbeat ainda nao voltou; agora aparece como `--`

### Removido

- Pasta `commands/` na raiz do projeto
- Funcao `carregarComandosLegado` do `client.js`