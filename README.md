# 🎮 Monkey's Craft — Painel de Controle

Painel web para gerenciamento do servidor de Minecraft e do bot do Discord do **Monkey's Craft**, desenvolvido em **JavaScript (Node.js)**. Liga, desliga e reinicia os serviços pelo navegador, transmite os logs em tempo real, envia comandos ao servidor via RCON e hospeda um bot de Discord com sistemas de moderação e tickets.

[🇧🇷 Português](README.md) · [🇺🇸 English](README.en.md)

### 📷 Imagens do painel:
<img width="1906" height="964" alt="image" src="https://github.com/user-attachments/assets/be98ab90-69cf-4c86-9cb9-78ea074a283a" />

<img width="1902" height="964" alt="image" src="https://github.com/user-attachments/assets/4171abaa-8141-45ba-9d8f-73f74a516a3c" />

<img width="1903" height="964" alt="image" src="https://github.com/user-attachments/assets/750f08ed-002e-492a-8fee-599995ff928b" />

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord.js&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🚀 Funcionalidades

### Painel

- 🎛️ **Interface dark** com cards de status, métricas ao vivo e consoles separados por serviço.
- 🔐 **Login com sessão** persistida em SQLite, cookie `httpOnly` e permissão por cargo (admin, moderador, visualizador).
- ▶️ **Controle de Serviços:** inicia, encerra e reinicia o servidor de Minecraft e o bot do Discord por botões, sem terminal.
- 📡 **Logs em Tempo Real:** WebSocket dedicado que empurra os logs do servidor, do bot e do Discord para o navegador.
- 💻 **Console Remoto:** envio de comandos ao Minecraft via RCON direto pela interface, com o retorno da resposta no console.
- 📁 **Gerenciador de Arquivos:** áreas configuráveis (Servidor, Plugins, Configs, Mundo, Logs, Mods, Backups), com listagem, edição de texto, upload, criação de pasta, renomear, apagar e download.
- 🛡️ **Proteção contra Path Traversal:** todo caminho é resolvido e recusado se sair da área permitida. Nomes sensíveis como `.env`, `usuarios.json` e `node_modules` são bloqueados em qualquer nível.
- 🛡️ **Proteção contra Instância Duplicada:** verifica a porta antes de iniciar e assume o monitoramento quando o servidor já está rodando, evitando o erro de `session.lock`.
- 🎨 **Classificação de Logs:** linhas `WARN` e `ERROR` do servidor são identificadas e coloridas automaticamente.
- 🔄 **Reconexão Automática:** o painel se reconecta sozinho ao WebSocket e atualiza o status a cada 4 segundos.

### Bot

- 🤖 **25 slash commands** em 4 categorias, carregados automaticamente das subpastas.
- 📘 **Informação:** help, ping, serverinfo e userinfo.
- 🎮 **Integração com o Minecraft:** status, players, whitelist, backup, restart, say, tps, skin e UUID.
- 🛠️ **Moderação completa:** ban, baninfo, clear, kick, mute, slowmode, unban, unmute, unwarn, warn e warnings.
- 🎫 **Tickets:** painel com botão persistente que cria canal privado e sobrevive a reinício do bot.

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
│   │   ├── service.js         # Camada de serviço: ciclo de vida, estado e envio de mensagens
│   │   ├── comandos/          # 25 comandos em 4 categorias
│   │   │   ├── index.js       # Carregador recursivo
│   │   │   ├── info/
│   │   │   ├── minecraft/
│   │   │   ├── moderacao/
│   │   │   └── tickets/
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
```

---

## 🛠️ Tecnologias Utilizadas

- **Ambiente:** Node.js (CommonJS)
- **Servidor HTTP:** Express
- **Tempo real:** WebSocket (`ws`)
- **Sessão:** `express-session` com `better-sqlite3-session-store`
- **Banco:** `better-sqlite3` com `journal_mode = WAL`
- **Bot:** `discord.js` v14
- **Minecraft:** RCON e `minecraft-server-util`
- **Segurança:** `helmet`, `bcrypt`, `express-rate-limit`
- **Upload:** `multer`
- **Configuração:** JSON e Dotenv (`.env`)

---

## ⚙️ Como Executar o Projeto Localmente

**1. Clonar o repositório:**

```bash
git clone https://github.com/Avvd12/monkeys-craft-panel.git
cd monkeys-craft-panel
```

**2. Instalar as dependências:**

```bash
npm install
```

**3. Criar o arquivo `.env` na raiz:**

```bash
copy .env.example .env
```

Preencha os valores:

```env
SESSION_SECRET=   # mínimo de 20 caracteres
DISCORD_TOKEN=
PORTA_INTERNA=3001
PORTA_PUBLICA=3000
```

Para gerar um `SESSION_SECRET` forte:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**4. Copiar o modelo de configuração e ajustar os caminhos:**

```bash
copy config.example.json config.json
```

Edite o `config.json` com o caminho do seu servidor, o ID do canal de logs e a senha do RCON.

**5. Criar o primeiro usuário do painel:**

```bash
node criar-usuario.js
```

**6. Iniciar o painel:**

```bash
npm start
```

Acesse http://localhost:3000 e faça login com o usuário criado no passo 5.

---

## 👥 Cargos e Permissões

| Cargo | Acesso |
|---|---|
| `admin` | Tudo: serviços, console, arquivos, whitelist, ban e gerenciamento de usuários |
| `moderador` | Serviços, console, arquivos, whitelist e ban |
| `visualizador` | Somente leitura: status, logs e listagem de arquivos |

Novos usuários são criados pelo painel, na aba **Usuários**, disponível apenas para `admin`.

---

## 🌐 Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | Estado atual dos dois serviços |
| POST | `/api/services/:servico/:acao` | Inicia, encerra ou reinicia (`start`, `stop`, `restart`) |
| POST | `/api/console/minecraft` | Envia comando ao servidor via RCON |
| POST | `/api/console/discord` | Envia mensagem ao canal configurado |
| GET | `/api/whitelist` | Lista a whitelist do servidor |
| POST | `/api/whitelist` | Adiciona ou remove um jogador (`add`, `remove`) |
| POST | `/api/ban` | Bane um jogador pelo nick |
| GET/POST/PUT/DELETE | `/api/files/*` | Gerenciador de arquivos |
| GET/POST/DELETE | `/api/usuarios` | Gerenciamento de usuários (somente admin) |
| GET | `/api/logs?limite=100` | Últimas linhas de log |
| WS | `/ws/logs` | Stream de logs e atualizações de status |

As rotas de escrita exigem sessão ativa e cargo compatível. Sem sessão, a resposta é `401`; com cargo insuficiente, `403`.

---

## 🤖 Comandos do Bot

O bot carrega **25 comandos**, distribuídos em 4 categorias.

| Categoria | Comandos | Total |
|---|---|---|
| Informação | `help`, `ping`, `serverinfo`, `userinfo` | 4 |
| Minecraft | `backup`, `players`, `restart`, `say`, `skin`, `status`, `tps`, `uuid`, `whitelist` | 9 |
| Moderação | `ban`, `baninfo`, `clear`, `kick`, `mute`, `slowmode`, `unban`, `unmute`, `unwarn`, `warn`, `warnings` | 11 |
| Tickets | `ticket` | 1 |
| **Total** | | **25** |

O comando `/whitelist` possui os subcomandos `add` e `remove`. O Discord exibe cada um em uma linha própria, mas trata-se de um único comando.

O total exato aparece no terminal ao subir o bot:

```text
[BOT] 25 comandos carregados.
[BOT] 25 comandos registrados no Discord.
```

Se o número for menor que 25, o próprio terminal informa qual arquivo falhou ao carregar.

---

## 🔐 Segurança

- `helmet` ativo e `x-powered-by` desligado.
- Sessão em SQLite com cookie `httpOnly`, `sameSite: lax` e validade de 8 horas.
- Rate limit global e limite mais rígido na rota de login.
- Bloqueio por IP após 5 tentativas de login falhas, por 15 minutos.
- Senhas com `bcrypt` em custo 12.
- Comparação com hash falso quando o usuário não existe, para igualar o tempo de resposta.
- Log de acessos em `acessos.log`, com data, evento, IP e usuário.
- Nenhum stack trace é exposto ao cliente.

Para reportar uma vulnerabilidade, consulte o [SECURITY.md](SECURITY.md).

---

## ⚠️ Notas Importantes

- O **RCON precisa estar habilitado** no `server.properties` do servidor de Minecraft, com `enable-rcon=true`, senha e porta definidas. Sem ele, o desligamento cai para encerramento forçado e o mundo pode não ser salvo corretamente.
- **Não abra o `run.bat` por fora** enquanto o painel estiver rodando. O servidor deve ser iniciado apenas pela interface, para evitar conflito de `session.lock`.
- **Os comandos são registrados em um único escopo.** Registrar o mesmo comando globalmente e por servidor faz o Discord listá-lo duas vezes. Mantenha apenas um caminho de registro e não conserve a pasta legada `commands/` na raiz do projeto.
- O projeto foi desenvolvido e testado em **Windows**, usando `netstat` e `taskkill` para detecção e encerramento de processos.
- O arquivo `.env`, o `config.json` com credenciais reais, o `usuarios.json` e a pasta `dados/` **não devem ser versionados**.
- O `/backup` executa `save-all` via RCON, que salva o mundo em disco. Ele não gera um arquivo `.zip` do mundo.

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.
