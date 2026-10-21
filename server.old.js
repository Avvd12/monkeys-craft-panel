
const express = require('express');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { Rcon } = require('rcon-client');
const { status } = require('minecraft-server-util');
const config = require('./config.json');
require('dotenv').config();

const app = express();
const httpServer = http.createServer(app);
const wss = new WebSocket.Server({ server: httpServer });

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const BOT_CWD = process.env.BOT_CWD || 'Z:\\discord-bot';
const BOT_ENTRY = process.env.BOT_ENTRY || 'index.js';

let botProcess = null;
let minecraftProcess = null;
let statsTimer = null;

app.use(express.static(PUBLIC_DIR));

function broadcast(payload) {
  const message = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendError(message) {
  broadcast({
    type: 'error',
    message
  });
}

function processIsRunning(processReference) {
  return Boolean(
    processReference &&
    processReference.exitCode === null &&
    !processReference.killed
  );
}

function connectProcessLogs(childProcess, prefix) {
  childProcess.stdout?.on('data', data => {
    const message = data.toString().trim();

    if (message) {
      broadcast({
        type: `${prefix}_log`,
        message
      });
    }
  });

  childProcess.stderr?.on('data', data => {
    const message = data.toString().trim();

    if (message) {
      broadcast({
        type: `${prefix}_error`,
        message
      });
    }
  });

  childProcess.on('error', error => {
    broadcast({
      type: `${prefix}_error`,
      message: error.message
    });
  });
}

/* =========================================================
   BOT DO DISCORD
   ========================================================= */

function startBot() {
  if (processIsRunning(botProcess)) {
    sendError('O bot do Discord já está em execução.');
    return;
  }

  try {
    botProcess = spawn(process.execPath, [BOT_ENTRY], {
      cwd: BOT_CWD,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    connectProcessLogs(botProcess, 'bot');

    botProcess.once('spawn', () => {
      broadcast({
        type: 'bot_status',
        running: true,
        message: 'Bot do Discord iniciado.'
      });
    });

    botProcess.once('close', code => {
      botProcess = null;

      broadcast({
        type: 'bot_status',
        running: false,
        message: `Bot encerrado com código ${code ?? 'desconhecido'}.`
      });
    });
  } catch (error) {
    botProcess = null;
    sendError(`Não foi possível iniciar o bot: ${error.message}`);
  }
}

function stopBot() {
  if (!processIsRunning(botProcess)) {
    sendError('O bot do Discord não está em execução.');
    return;
  }

  const processToStop = botProcess;

  processToStop.kill('SIGTERM');

  setTimeout(() => {
    if (processIsRunning(processToStop)) {
      processToStop.kill('SIGKILL');
    }
  }, 5000);
}

/* =========================================================
   SERVIDOR MINECRAFT
   ========================================================= */

function startMinecraftServer() {
  if (processIsRunning(minecraftProcess)) {
    sendError('O servidor Minecraft já está em execução.');
    return;
  }

  const serverConfig = config.server || {};
  const command = serverConfig.command || 'run.bat';
  const args = Array.isArray(serverConfig.args) ? serverConfig.args : [];
  const cwd = serverConfig.cwd;

  if (!cwd) {
    sendError('O caminho server.cwd não foi definido no config.json.');
    return;
  }

  try {
    minecraftProcess = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      windowsHide: true
    });

    connectProcessLogs(minecraftProcess, 'server');

    minecraftProcess.once('spawn', () => {
      broadcast({
        type: 'server_status',
        running: true,
        message: `Servidor iniciado por ${command}.`
      });

      beginStatsMonitoring();
    });

    minecraftProcess.once('close', code => {
      minecraftProcess = null;
      stopStatsMonitoring();

      broadcast({
        type: 'server_status',
        running: false,
        message: `Servidor encerrado com código ${code ?? 'desconhecido'}.`
      });

      broadcast({ type: 'players_count', count: 0 });
      broadcast({ type: 'server_ping', ping: '--' });
    });
  } catch (error) {
    minecraftProcess = null;
    sendError(`Não foi possível iniciar o servidor: ${error.message}`);
  }
}

function stopMinecraftServer() {
  if (!processIsRunning(minecraftProcess)) {
    sendError('O servidor Minecraft não está em execução.');
    return;
  }

  /*
    O comando "stop" salva o mundo antes de encerrar.
    Evita finalizar o Java à força e possivelmente corromper o mapa.
  */
  if (minecraftProcess.stdin?.writable) {
    minecraftProcess.stdin.write('stop\n');

    broadcast({
      type: 'server_log',
      message: 'Comando de desligamento seguro enviado.'
    });
  } else {
    sendError('O console do servidor não aceita comandos via stdin.');
  }
}

/* =========================================================
   RCON
   ========================================================= */

async function executeRconCommand(command) {
  const cleanCommand = String(command || '')
    .trim()
    .replace(/^\/+/, '');

  if (!cleanCommand) {
    sendError('Digite um comando antes de enviar.');
    return;
  }

  const rconConfig = config.rcon || {};
  let rcon;

  try {
    rcon = await Rcon.connect({
      host: rconConfig.host || '127.0.0.1',
      port: Number(rconConfig.port || 25575),
      password: rconConfig.password,
      timeout: 5000
    });

    const response = await rcon.send(cleanCommand);

    broadcast({
      type: 'rcon_response',
      response: response || 'Comando executado sem mensagem de retorno.'
    });
  } catch (error) {
    sendError(`Falha no RCON: ${error.message}`);
  } finally {
    if (rcon) {
      try {
        await rcon.end();
      } catch {
        // A conexão já pode ter sido encerrada.
      }
    }
  }
}

/* =========================================================
   STATUS, JOGADORES E PING
   ========================================================= */

async function updateMinecraftStats() {
  const minecraftConfig = config.minecraft || {};
  const host = minecraftConfig.host || '127.0.0.1';
  const port = Number(minecraftConfig.port || 25565);
  const startedAt = Date.now();

  try {
    const response = await status(host, port, {
      timeout: 3000,
      enableSRV: false
    });

    const measuredPing =
      typeof response.roundTripLatency === 'number'
        ? Math.round(response.roundTripLatency)
        : Date.now() - startedAt;

    broadcast({
      type: 'players_count',
      count: response.players.online
    });

    broadcast({
      type: 'server_ping',
      ping: measuredPing
    });

    broadcast({
      type: 'server_presence',
      online: true
    });
  } catch {
    broadcast({ type: 'players_count', count: 0 });
    broadcast({ type: 'server_ping', ping: '--' });

    broadcast({
      type: 'server_presence',
      online: false
    });
  }
}

function beginStatsMonitoring() {
  stopStatsMonitoring();
  updateMinecraftStats();
  statsTimer = setInterval(updateMinecraftStats, 5000);
}

function stopStatsMonitoring() {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
}

/* =========================================================
   WEBSOCKET
   ========================================================= */

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'init',
    bot_running: processIsRunning(botProcess),
    server_running: processIsRunning(minecraftProcess)
  }));

  updateMinecraftStats();

  ws.on('message', rawData => {
    try {
      const message = JSON.parse(rawData.toString());

      switch (message.action) {
        case 'start_bot':
          startBot();
          break;

        case 'stop_bot':
          stopBot();
          break;

        case 'start_server':
          startMinecraftServer();
          break;

        case 'stop_server':
          stopMinecraftServer();
          break;

        case 'rcon_command':
          executeRconCommand(message.command);
          break;

        default:
          sendError(`Ação desconhecida: ${message.action || 'vazia'}`);
      }
    } catch (error) {
      sendError(`Mensagem inválida: ${error.message}`);
    }
  });

  ws.on('error', error => {
    console.error('Erro no WebSocket:', error.message);
  });
});

/* =========================================================
   INICIALIZAÇÃO E ENCERRAMENTO
   ========================================================= */

httpServer.listen(PORT, '127.0.0.1', () => {
  beginStatsMonitoring();

  console.log('');
  console.log('Monkey’s Craft Control Panel');
  console.log(`Painel: http://localhost:${PORT}`);
  console.log(`Bot: ${path.join(BOT_CWD, BOT_ENTRY)}`);
  console.log(`Minecraft: ${config.server?.cwd || 'não configurado'}`);
  console.log('');
});

async function shutdown() {
  console.log('\nEncerrando o painel...');
  stopStatsMonitoring();

  if (processIsRunning(botProcess)) {
    botProcess.kill('SIGTERM');
  }

  if (
    processIsRunning(minecraftProcess) &&
    minecraftProcess.stdin?.writable
  ) {
    minecraftProcess.stdin.write('stop\n');
  }

  httpServer.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 6000);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
