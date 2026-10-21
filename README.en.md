\# 🎮 Monkey's Craft — Control Panel



Web panel for managing the \*\*Monkey's Craft\*\* Minecraft server and Discord bot, built with \*\*JavaScript (Node.js)\*\*. Start, stop and restart services from the browser, stream logs in real time, and send commands to the server over RCON.



\[🇧🇷 Português](README.md) · \*\*🇺🇸 English\*\*



!\[Monkey's Craft panel](docs/painel.png)



!\[Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js\&logoColor=white)

!\[Express](https://img.shields.io/badge/Express-4.x-000000?logo=express\&logoColor=white)

!\[discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord\&logoColor=white)

!\[License](https://img.shields.io/badge/license-MIT-blue)



\---



\## 🚀 Features



\- 🎛️ \*\*Interactive Panel:\*\* dark interface with status cards, live metrics and one console per service.

\- ▶️ \*\*Service Control:\*\* start, stop and restart the Minecraft server and the Discord bot with buttons, no terminal needed.

\- 📡 \*\*Real-Time Logs:\*\* dedicated WebSocket that pushes server, bot and Discord logs to the browser.

\- 💻 \*\*Remote Console:\*\* send Minecraft commands over RCON straight from the interface, with the response shown in the console.

\- 🛡️ \*\*Duplicate Instance Protection:\*\* checks the port before starting and takes over monitoring when the server is already running, preventing the `session.lock` error.

\- 🎨 \*\*Log Classification:\*\* `WARN` and `ERROR` lines from the server are detected and colored automatically.

\- 🔄 \*\*Automatic Reconnect:\*\* the panel reconnects to the WebSocket on its own and refreshes status every 4 seconds.

\- 📁 \*\*Modular Architecture:\*\* clear separation between API, bot, Minecraft server and log hub.



\---



\## 🧱 Project Structure



```text

monkeys-craft-panel/

├── server.js                  # Entry point, wires the modules together

├── config.json                # Local configuration (not versioned)

├── config.example.json        # Configuration template

├── .env                       # Discord token (not versioned)

├── public/

│   ├── index.html             # Web panel (HTML, CSS and JS)

│   └── assets/                # Logo and images

├── src/

│   ├── api/server.js          # REST routes and WebSocket server

│   ├── bot/client.js          # Discord client and command loading

│   ├── minecraft/manager.js   # Server lifecycle and log reading

│   ├── logs/hub.js            # Log bus and broadcast

│   └── index.js

├── commands/                  # Bot slash commands

├── events/                    # Discord events

└── utils/

&#x20;   ├── rcon.js                # RCON connection to the server

&#x20;   └── serverProcess.js       # Java process spawn and shutdown

```



\---



\## 🛠️ Tech Stack



\- \*\*Runtime:\*\* Node.js

\- \*\*HTTP server:\*\* Express

\- \*\*Real time:\*\* WebSocket (`ws`)

\- \*\*Bot:\*\* `discord.js` v14

\- \*\*Minecraft:\*\* `minecraft-server-util` and RCON

\- \*\*Configuration:\*\* JSON \& Dotenv (`.env`)



\---



\## ⚙️ Running Locally



\*\*1. Clone the repository:\*\*



```bash

git clone https://github.com/Avvd12/monkeys-craft-panel.git

cd monkeys-craft-panel

```



\*\*2. Install dependencies:\*\*



```bash

npm install

```



\*\*3. Create the `.env` file at the root:\*\*



```env

DISCORD\_TOKEN=your\_token\_here

```



\*\*4. Copy the configuration template and adjust the paths:\*\*



```bash

copy config.example.json config.json

```



Edit `config.json` with your server path, the log channel ID and the RCON password.



\*\*5. Start the panel:\*\*



```bash

npm start

```



Open http://localhost:3000.



\---



\## 🌐 API Endpoints



| Method | Route | Description |

|--------|-------|-------------|

| GET | `/api/status` | Current state of both services |

| POST | `/api/services/:name/start` | Starts the service (`minecraft` or `discord`) |

| POST | `/api/services/:name/stop` | Stops the service |

| POST | `/api/services/:name/restart` | Restarts the service |

| POST | `/api/console/minecraft` | Sends a command to the server over RCON |

| POST | `/api/console/discord` | Sends a message to the configured channel |

| GET | `/api/logs?limite=100` | Latest log lines |

| WS | `/ws/logs` | Log stream and status updates |



\---



\## ⚠️ Important Notes



\- \*\*RCON must be enabled\*\* in the Minecraft `server.properties`, with `enable-rcon=true`, a password and a port. Without it, shutdown falls back to a forced kill and the world may not be saved properly.

\- \*\*Do not run `run.bat` on its own\*\* while the panel is running. The server should only be started from the interface, to avoid `session.lock` conflicts.

\- The project was developed and tested on \*\*Windows\*\*, using `netstat` and `taskkill` for process detection and termination.

\- The `.env` file and any `config.json` with real credentials \*\*must not be versioned\*\*.



\---



\## 📄 License



This project is licensed under the MIT License.

