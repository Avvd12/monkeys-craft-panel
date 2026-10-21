


const { ActivityType } = require('discord.js');
const { executeCommand } = require('./rcon');

async function getOnlineCount() {
  try {
    const response = await executeCommand('list');
    const clean = response.replace(/§[0-9a-fk-or]/gi, '');
    const match = clean.match(/There are (\d+) of a max(?: of)? (\d+) players online/i)
      || clean.match(/(\d+)\s*\/\s*(\d+)\s*players online/i);
    if (match) return `${match[1]}/${match[2]} online`;
    return 'servidor online';
  } catch {
    return 'servidor offline 🔴';
  }
}

function startPresenceRotation(client) {
  const staticMessages = [
    '/help para comandos',
    'Minecraft Server Manager',
    '/status para ver o servidor',
  ];

  let index = 0;

  async function updatePresence() {
    let text;

    if (index % 3 === 1) {
      // uma em cada 3 trocas mostra a contagem real de jogadores
      text = `⛏️ ${await getOnlineCount()}`;
    } else {
      text = staticMessages[index % staticMessages.length];
    }

    client.user.setActivity(text, { type: ActivityType.Playing });
    index++;
  }

  updatePresence();
  setInterval(updatePresence, 20000); // troca a cada 20s
}

module.exports = { startPresenceRotation };


