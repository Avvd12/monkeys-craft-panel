# 🎮 Monkey's Craft — Painel de Controle

Painel web para gerenciamento do servidor de Minecraft e do bot do Discord do **Monkey's Craft**, desenvolvido em **JavaScript (Node.js)**. Liga, desliga e reinicia os serviços pelo navegador, transmite os logs em tempo real, envia comandos ao servidor via RCON e hospeda um bot de Discord com sistema de economia, reputação e tickets.

[🇧🇷 Português](README.md) · [🇺🇸 English](README.en.md)

![Painel](https://github.com/user-attachments/assets/2ce99c48-a1a0-466a-afdd-bdee9d3b1b9d)

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🚀 Funcionalidades

### Painel

- 🎛️ **Interface dark** com cards de status, métricas ao vivo e consoles separados por serviço.
- 🔐 **Login com sessão** persistida em SQLite, cookie `httpOnly` e permissão por cargo (admin, moderador, visualizador).
- ▶️ **Controle de Serviços:** inicia, encerra e reinicia o servidor de Minecraft e o bot do Discord por botões, sem terminal.
- 📡 **Logs em Tempo Real:** WebSocket dedicado que empurra os logs do servidor, do bot e do Discord para o navegador.
- 💻 **Console Remoto:** envio de comandos ao Minecraft via RCON direto pela interface, com retorno da resposta no console.
- 📁 **Gerenciador de Arquivos:** áreas configuráveis (Servidor, Plugins, Configs, Mundo, Logs, Mods, Backups), com listagem, edição de texto, upload, criação de pasta, renomear, apagar e download.
- 🛡️ **Proteção contra Path Traversal:** todo caminho é resolvido e recusado se sair da área permitida. Nomes sensíveis como `.env`, `usuarios.json` e `node_modules` são bloqueados em qualquer nível.
- 🛡️ **Proteção contra Instância Duplicada:** verifica a porta antes de iniciar e assume o monitoramento quando o servidor já está rodando, evitando o erro de `session.lock`.
- 🎨 **Classificação de Logs:** linhas `WARN` e `ERROR` do servidor são identificadas e coloridas automaticamente.
- 🔄 **Reconexão Automática:** o painel se reconecta sozinho ao WebSocket e atualiza o status a cada 4 segundos.

### Bot

- 🤖 **50 slash commands** em 10 categorias, carregados automaticamente das subpastas.
- 💚 **Economia com Esmeraldas:** recompensa diária, transferência entre membros, ranking e apostas.
- ⭐ **Reputação:** sistema de pontos entre membros, com ranking dos mais respeitados.
- 🎫 **Tickets:** painel com botão persistente que cria canal privado e sobrevive a reinício do bot.
- 📊 **Níveis e XP:** progressão por mensagens, com cartão de nível e ranking paginado.
- ⏰ **Lembretes:** agendador que avisa o membro no canal onde o lembrete foi criado.
- 🛠️ **Moderação completa:** ban, kick, mute, unmute, warn, warnings, unban, unwarn, baninfo, clear, slowmode, lock e role.
- 🎮 **Integração com o Minecraft:** status, jogadores online, whitelist, console, restart, say, tps, skin e UUID.

---

## 🧱 Arquitetura do Projeto

```text
monkeys-craft-panel/
├── server.js                  # Gateway público: login, sessão, rotas do painel e proxy
├── criar-usuario.js           # Cria o primeiro usuário do painel
├── package.json
├── config.json                # Configuração local (não versionado)
├── config.example.json        # Modelo de configuração
├── .env.example               # Modelo das variáveis de ambiente
├── public/
│   ├── login.html             # Tela de login
│   ├── index.html             # Painel principal
│   ├── admin.html             # Gerenciamento de usuários
│   └── assets/                # Logo e imagens
├── src/
│   ├── api/
│   │   ├── server.js          # API interna na porta 3001
│   │   └── files.js           # Gerenciador de arquivos
│   ├── bot/
│   │   ├── client.js          # Runtime do bot e registro de comandos
│   │   ├── comandos/          # 50 comandos em 10 categorias
│   │   │   ├── index.js       # Carregador recursivo
│   │   │   ├── info/
│   │   │   ├── minecraft/
│   │   │   ├── moderacao/
│   │   │   ├── tickets/
│   │   │   ├── config/
│   │   │   ├── engajamento/
│   │   │   ├── economia/
│   │   │   ├── social/
│   │   │   ├── util/
│   │   │   └── diversao/
│   │   └── util/
│   │       ├── banco.js       # SQLite: avisos, vínculos, tickets, config, níveis, esmeraldas, reputações, lembretes
│   │       ├── embeds.js      # Padrão visual das respostas
│   │       ├── permissao.js   # Checagem de cargo
│   │       └── agendador.js   # Disparo dos lembretes
│   ├── events/                # Eventos do Discord
│   ├── logs/hub.js            # Barramento de logs e broadcast
│   └── minecraft/manager.js   # Ciclo de vida do servidor e leitura de logs
├── utils/
│   ├── rcon.js                # Conexão RCON com o servidor
│   └── serverProcess.js       # Spawn e encerramento do processo Java
└── dados/                     # Criado automaticamente na primeira execução
