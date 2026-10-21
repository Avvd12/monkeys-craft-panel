
const fs = require('fs');
const path = require('path');
const { PermissionsBitField } = require('discord.js');
const config = require('../config.json');
const { executeCommand } = require('./rcon');

const discordConfig = config.discord || {};
const CONSOLE_CHANNEL_ID = discordConfig.consoleChannelId;
const PREFIX = discordConfig.commandPrefix || '!mc';
const LOG_FILE = discordConfig.logFile || path.join(config.server.cwd, 'logs', 'latest.log');

let lastLogPosition = 0;
let logTimer = null;

function isAdmin(member) {
  return member?.permissions?.has(PermissionsBitField.Flags.Administrator);
}

function cleanLogLine(line) {
  // Exemplo de linha: [12:00:00] [Server thread/INFO]: Player entrou no jogo
  return line
    .replace(/\u00A7[0-9A-FK-OR]/gi, '')
    .replace(/\r/g, '')
    .trim();
}

function isRelevantLog(line) {
  const text = line.toLowerCase();

  return (
    // Entradas e saídas
    text.includes('joined the game') ||
    text.includes('left the game') ||
    text.includes('entrou no jogo') ||
    text.includes('saiu do jogo') ||

    // Mortes
    text.includes('was slain') ||
    text.includes('was shot') ||
    text.includes('was blown up') ||
    text.includes('was killed') ||
    text.includes('died') ||
    text.includes('morreu') ||
    text.includes('foi morto') ||

    // Chat e comandos
    text.includes('<') ||
    text.includes('issued server command') ||

    // Eventos administrativos relevantes
    text.includes('kicked') ||
    text.includes('banned') ||
    text.includes('whitelist') ||
    text.includes('stopping server') ||
    text.includes('starting minecraft server')
  );
}

async function sendLogBatch(channel, lines) {
  if (!lines.length) return;

  const content = lines.map(line => `\`${line}\``).join('\n');

  // Limite do Discord: 2.000 caracteres por mensagem.
  if (content.length <= 1900) {
    await channel.send({ content });
    return;
  }

  let currentPart = '';

  for (const line of lines) {
    const formatted = `\`${line}\`\n`;

    if ((currentPart + formatted).length > 1900) {
      await channel.send({ content: currentPart });
      currentPart = '';
    }

    currentPart += formatted;
  }

  if (currentPart) {
    await channel.send({ content: currentPart });
  }
}

async function readNewLogs(client) {
  try {
    const channel = await client.channels.fetch(CONSOLE_CHANNEL_ID);

    if (!channel?.isTextBased()) {
      console.error('❌ O canal de console configurado não é um canal de texto válido.');
      return;
    }

    const stats = await fs.promises.stat(LOG_FILE);

    // O Minecraft pode recriar latest.log ao reiniciar.
    if (stats.size < lastLogPosition) {
      lastLogPosition = 0;
    }

    if (stats.size === lastLogPosition) return;

    const length = stats.size - lastLogPosition;
    const buffer = Buffer.alloc(length);
    const file = await fs.promises.open(LOG_FILE, 'r');

    try {
      await file.read(buffer, 0, length, lastLogPosition);
    } finally {
      await file.close();
    }

    lastLogPosition = stats.size;

    const relevantLines = buffer
      .toString('utf8')
      .split('\n')
      .map(cleanLogLine)
      .filter(Boolean)
      .filter(isRelevantLog);

    await sendLogBatch(channel, relevantLines);
  } catch (error) {
    // É normal o arquivo ainda não existir se o servidor estiver desligado.
    if (error.code !== 'ENOENT') {
      console.error('❌ Erro ao ler logs do Minecraft:', error.message);
    }
  }
}

async function initializeLogReader(client) {
  if (!CONSOLE_CHANNEL_ID) {
    console.warn('⚠️ discord.consoleChannelId não foi configurado no config.json.');
    return;
  }

  try {
    const stats = await fs.promises.stat(LOG_FILE);

    // Começa no final do arquivo: evita despejar milhares de logs antigos no Discord.
    lastLogPosition = stats.size;
    console.log(`📜 Monitorando logs do Minecraft: ${LOG_FILE}`);
  } catch (error) {
    lastLogPosition = 0;
    console.log('📜 Aguardando a criação do latest.log pelo servidor Minecraft...');
  }

  logTimer = setInterval(() => {
    readNewLogs(client);
  }, 1000);
}

function stopLogReader() {
  if (logTimer) clearInterval(logTimer);
}

async function handleConsoleMessage(message) {
  if (message.author.bot) return;
  if (message.channelId !== CONSOLE_CHANNEL_ID) return;

  if (!isAdmin(message.member)) {
    await message.reply({
      content: '⛔ Você não tem permissão de administrador para usar o console.',
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const content = message.content.trim();

  if (!content.toLowerCase().startsWith(PREFIX.toLowerCase())) return;

  const command = content.slice(PREFIX.length).trim();

  if (!command) {
    await message.reply({
      content: `Use \`${PREFIX} <comando>\`. Exemplo: \`${PREFIX} list\``,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  try {
    const response = await executeCommand(command);

    const safeResponse = response?.trim() || 'Comando executado sem resposta do servidor.';
    const shortenedResponse =
      safeResponse.length > 1500
        ? `${safeResponse.slice(0, 1500)}\n... resposta cortada`
        : safeResponse;

    await message.reply({
      content:
        `✅ **Console:** \`${command}\`\n` +
        `👤 Executado por: ${message.author}\n` +
        `\`\`\`\n${shortenedResponse}\n\`\`\``,
      allowedMentions: { repliedUser: false },
    });
  } catch (error) {
    console.error(`❌ Falha no comando "${command}":`, error.message);

    await message.reply({
      content:
        `❌ Não foi possível executar \`${command}\`.\n` +
        'O servidor pode estar offline no momento.',
      allowedMentions: { repliedUser: false },
    });
  }
}

module.exports = {
  initializeLogReader,
  stopLogReader,
  handleConsoleMessage,
};
