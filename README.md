# 🎮 Monkey's Craft — Painel de Controle

Painel web para gerenciamento do servidor de Minecraft e do bot do Discord do **Monkey's Craft**, desenvolvido em **JavaScript (Node.js)**. Liga, desliga e reinicia os serviços pelo navegador, transmite os logs em tempo real e envia comandos ao servidor via RCON.

<img width="1903" height="963" alt="painel" src="https://github.com/user-attachments/assets/2ce99c48-a1a0-466a-afdd-bdee9d3b1b9d" />


![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🚀 Funcionalidades

- 🎛️ **Painel Interativo:** interface dark com cards de status, métricas ao vivo e consoles separados por serviço.
- ▶️ **Controle de Serviços:** inicia, encerra e reinicia o servidor de Minecraft e o bot do Discord por botões, sem terminal.
- 📡 **Logs em Tempo Real:** WebSocket dedicado que empurra os logs do servidor, do bot e do Discord para o navegador.
- 💻 **Console Remoto:** envio de comandos ao Minecraft via RCON direto pela interface, com retorno da resposta no console.
- 🛡️ **Proteção contra Instância Duplicada:** verifica a porta antes de iniciar e assume o monitoramento quando o servidor já está rodando, evitando o erro de `session.lock`.
- 🎨 **Classificação de Logs:** linhas `WARN` e `ERROR` do servidor são identificadas e coloridas automaticamente.
- 🔄 **Reconexão Automática:** o painel se reconecta sozinho ao WebSocket e atualiza o status a cada 4 segundos.
- 📁 **Arquitetura Modular:** separação clara entre API, bot, servidor de Minecraft e hub de logs.

---

## 🧱 Arquitetura do Projeto

```text
monkeys-craft-panel/
├── server.js                  # Ponto de entrada, monta os módulos
├── config.json                # Configuração local (não versionado)
├── config.example.json        # Modelo de configuração
├── .env                       # Token do Discord (não versionado)
├── public/
│   ├── index.html             # Painel web (HTML, CSS e JS)
│   └── assets/                # Logo e imagens
├── src/
│   ├── api/server.js          # Rotas REST e servidor WebSocket
│   ├── bot/client.js          # Cliente do Discord e carregamento de comandos
│   ├── minecraft/manager.js   # Ciclo de vida do servidor e leitura de logs
│   ├── logs/hub.js            # Barramento de logs e broadcast
│   └── index.js
├── commands/                  # Comandos slash do bot
├── events/                    # Eventos do Discord
└── utils/
    ├── rcon.js                # Conexão RCON com o servidor
    └── serverProcess.js       # Spawn e encerramento do processo Java
```

---

## 🛠️ Tecnologias Utilizadas

- **Ambiente:** Node.js
- **Servidor HTTP:** Express
- **Tempo real:** WebSocket (`ws`)
- **Bot:** `discord.js` v14
- **Minecraft:** `minecraft-server-util` e RCON
- **Configuração:** JSON & Dotenv (`.env`)

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

```env
DISCORD_TOKEN=seu_token_aqui
```

**4. Copiar o modelo de configuração e ajustar os caminhos:**

```bash
copy config.example.json config.json
```

Edite o `config.json` com o caminho do seu servidor, o ID do canal de logs e a senha do RCON.

**5. Iniciar o painel:**

```bash
npm start
```

Acesse http://localhost:3000.

---

## 🌐 Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/status` | Estado atual dos dois serviços |
| POST | `/api/services/:nome/start` | Inicia o serviço (`minecraft` ou `discord`) |
| POST | `/api/services/:nome/stop` | Encerra o serviço |
| POST | `/api/services/:nome/restart` | Reinicia o serviço |
| POST | `/api/console/minecraft` | Envia comando ao servidor via RCON |
| POST | `/api/console/discord` | Envia mensagem ao canal configurado |
| GET | `/api/logs?limite=100` | Últimas linhas de log |
| WS | `/ws/logs` | Stream de logs e atualizações de status |

---

## ⚠️ Notas Importantes

- O **RCON precisa estar habilitado** no `server.properties` do servidor de Minecraft, com `enable-rcon=true`, senha e porta definidas. Sem ele, o desligamento cai para encerramento forçado e o mundo pode não ser salvo corretamente.
- **Não abra o `run.bat` por fora** enquanto o painel estiver rodando. O servidor deve ser iniciado apenas pela interface, para evitar conflito de `session.lock`.
- O projeto foi desenvolvido e testado em **Windows**, usando `netstat` e `taskkill` para detecção e encerramento de processos.
- O arquivo `.env` e o `config.json` com credenciais reais **não devem ser versionados**.

---

## 📄 Licença

Este projeto está sob a licença MIT.
