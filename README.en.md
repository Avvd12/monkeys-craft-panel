# 🎮 Monkey's Craft — Control Panel

Web panel for managing the **Monkey's Craft** Minecraft server and Discord bot, built with **JavaScript (Node.js)**. Start, stop and restart services from the browser, stream logs in real time, send commands to the server over RCON, and host a Discord bot with economy, reputation and ticket systems.

[🇧🇷 Português](README.md) · [🇺🇸 English](README.en.md)

![Panel](https://github.com/user-attachments/assets/2ce99c48-a1a0-466a-afdd-bdee9d3b1b9d)

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🚀 Features

### Panel

- 🎛️ **Dark interface** with status cards, live metrics and one console per service.
- 🔐 **Login with session** persisted in SQLite, `httpOnly` cookie and role-based permissions (admin, moderator, viewer).
- ▶️ **Service Control:** start, stop and restart the Minecraft server and the Discord bot with buttons, no terminal needed.
- 📡 **Real-Time Logs:** dedicated WebSocket that pushes server, bot and Discord logs to the browser.
- 💻 **Remote Console:** send Minecraft commands over RCON straight from the interface, with the response shown in the console.
- 📁 **File Manager:** configurable areas (Server, Plugins, Configs, World, Logs, Mods, Backups) with listing, text editing, upload, folder creation, rename, delete and download.
- 🛡️ **Path Traversal Protection:** every path is resolved and rejected if it leaves the allowed area. Sensitive names such as `.env`, `usuarios.json` and `node_modules` are blocked at any level.
- 🛡️ **Duplicate Instance Protection:** checks the port before starting and takes over monitoring when the server is already running, preventing the `session.lock` error.
- 🎨 **Log Classification:** `WARN` and `ERROR` lines from the server are detected and colored automatically.
- 🔄 **Automatic Reconnect:** the panel reconnects to the WebSocket on its own and refreshes status every 4 seconds.

### Bot

- 🤖 **50 slash commands** across 10 categories, loaded automatically from subfolders.
- 💚 **Emerald Economy:** daily reward, transfers between members, ranking and betting.
- ⭐ **Reputation:** point system between members, with a ranking of the most respected.
- 🎫 **Tickets:** panel with a persistent button that creates a private channel and survives bot restarts.
- 📊 **Levels and XP:** progression through messages, with a level card and paginated ranking.
- ⏰ **Reminders:** scheduler that notifies the member in the channel where the reminder was created.
- 🛠️ **Full moderation:** ban, kick, mute, unmute, warn, warnings, unban, unwarn, baninfo, clear, slowmode, lock and role.
- 🎮 **Minecraft integration:** status, online players, whitelist, console, restart, say, tps, skin and UUID.

---

## 🧱 Project Structure

```text
monkeys-craft-panel/
├── server.js                  # Public gateway: login, session, panel routes and proxy
├── criar-usuario.js           # Creates the first panel user
├── package.json
├── config.json                # Local configuration (not versioned)
├── config.example.json        # Configuration template
├── .env.example               # Environment variables template
├── public/
│   ├── login.html             # Login screen
│   ├── index.html             # Main panel
│   ├── admin.html             # User management
│   └── assets/                # Logo and images
├── src/
│   ├── api/
│   │   ├── server.js          # Internal API on port 3001
│   │   └── files.js           # File manager
│   ├── bot/
│   │   ├── client.js          # Bot runtime and command registration
│   │   ├── comandos/          # 50 commands across 10 categories
│   │   │   ├── index.js       # Recursive loader
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
│   │       ├── banco.js       # SQLite: warnings, links, tickets, config, levels, emeralds, reputation, reminders
│   │       ├── embeds.js      # Visual standard for replies
│   │       ├── permissao.js   # Role checking
│   │       └── agendador.js   # Reminder dispatcher
│   ├── events/                # Discord events
│   ├── logs/hub.js            # Log bus and broadcast
│   └── minecraft/manager.js   # Server lifecycle and log reading
├── utils/
│   ├── rcon.js                # RCON connection to the server
│   └── serverProcess.js       # Java process spawn and shutdown
└── dados/                     # Created automatically on first run
```

---

## 🛠️ Tech Stack

- **Runtime:** Node.js (CommonJS)
- **HTTP server:** Express
- **Real time:** WebSocket (`ws`)
- **Session:** `express-session` with `better-sqlite3-session-store`
- **Database:** `better-sqlite3` with `journal_mode = WAL`
- **Bot:** `discord.js` v14
- **Minecraft:** RCON and `minecraft-server-util`
- **Security:** `helmet`, `bcrypt`, `express-rate-limit`
- **Upload:** `multer`
- **Configuration:** JSON and Dotenv (`.env`)

---

## ⚙️ Running Locally

**1. Clone the repository:**

```bash
git clone https://github.com/Avvd12/monkeys-craft-panel.git
cd monkeys-craft-panel
```

**2. Install dependencies:**

```bash
npm install
```

**3. Create the `.env` file at the root:**

```bash
copy .env.example .env
```

Fill in the values:

```env
SESSION_SECRET=   # at least 20 characters
DISCORD_TOKEN=
PORTA_INTERNA=3001
PORTA_PUBLICA=3000
```

To generate a strong `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**4. Copy the configuration template and adjust the paths:**

```bash
copy config.example.json config.json
```

Edit `config.json` with your server path, the log channel ID and the RCON password.

**5. Create the first panel user:**

```bash
node criar-usuario.js
```

**6. Start the panel:**

```bash
npm start
```

Open http://localhost:3000 and log in with the user created in step 5.

---

## 👥 Roles and Permissions

| Role | Access |
|---|---|
| `admin` | Everything: services, console, files, whitelist, ban and user management |
| `moderador` | Services, console, files, whitelist and ban |
| `visualizador` | Read-only: status, logs and file listing |

New users are created from the panel, in the **Users** tab, available to `admin` only.

---

## 🌐 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/status` | Current state of both services |
| POST | `/api/services/:servico/:acao` | Start, stop or restart (`start`, `stop`, `restart`) |
| POST | `/api/console/minecraft` | Sends a command to the server over RCON |
| POST | `/api/console/discord` | Sends a message to the configured channel |
| GET | `/api/whitelist` | Lists the server whitelist |
| POST | `/api/whitelist` | Adds or removes a player (`add`, `remove`) |
| POST | `/api/ban` | Bans a player by nickname |
| GET/POST/PUT/DELETE | `/api/files/*` | File manager |
| GET/POST/DELETE | `/api/usuarios` | User management (admin only) |
| GET | `/api/logs?limite=100` | Latest log lines |
| WS | `/ws/logs` | Log stream and status updates |

Write routes require an active session and a compatible role. Without a session the response is `401`; with an insufficient role, `403`.

---

## 🤖 Bot Commands

The bot loads **50 commands**, spread across 10 categories.

| Category | Commands | Total |
|---|---|---|
| Information | `ping`, `help`, `userinfo`, `serverinfo`, `avatar`, `uptime` | 6 |
| Minecraft | `status`, `players`, `ip`, `whitelist`, `console`, `restart`, `say`, `tps`, `skin`, `uuid`, `backup` | 11 |
| Moderation | `ban`, `kick`, `mute`, `unmute`, `warn`, `warnings`, `unban`, `unwarn`, `baninfo`, `clear`, `slowmode`, `lock`, `role` | 13 |
| Tickets | `ticket` | 1 |
| Configuration | `config` | 1 |
| Engagement | `rank`, `leaderboard` | 2 |
| Economy | `daily`, `saldo`, `pagar`, `ricos`, `apostar` | 5 |
| Social | `rep`, `ship` | 2 |
| Utilities | `calc`, `lembrete`, `escolher` | 3 |
| Fun | `poll`, `giveaway`, `dice`, `8ball`, `girarmoeda`, `jankenpon` | 6 |
| **Total** | | **50** |

The exact number appears in the terminal when the bot starts:

```text
[BOT] 50 comandos carregados.
[BOT] 50 comandos registrados no Discord.
```

If the number is lower than 50, the terminal itself reports which file failed to load.

---

## 🔐 Security

- `helmet` enabled and `x-powered-by` disabled.
- Session stored in SQLite with an `httpOnly` cookie, `sameSite: lax` and 8-hour lifetime.
- Global rate limit and a stricter limit on the login route.
- IP block after 5 failed login attempts, for 15 minutes.
- Passwords hashed with `bcrypt` at cost 12.
- Dummy hash comparison when the user does not exist, to equalize response time.
- Access log in `acessos.log`, with date, event, IP and user.
- No stack trace is exposed to the client.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

---

## ⚠️ Important Notes

- **RCON must be enabled** in the Minecraft `server.properties`, with `enable-rcon=true`, a password and a port. Without it, shutdown falls back to a forced kill and the world may not be saved properly.
- **Do not run `run.bat` on its own** while the panel is running. The server should only be started from the interface, to avoid `session.lock` conflicts.
- The project was developed and tested on **Windows**, using `netstat` and `taskkill` for process detection and termination.
- The `.env` file, any `config.json` with real credentials, `usuarios.json` and the `dados/` folder **must not be versioned**.
- `/backup` runs `save-all` over RCON, which saves the world to disk. It does not produce a `.zip` archive of the world.

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.