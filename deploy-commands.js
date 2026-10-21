

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command || !command.data || typeof command.data.toJSON !== 'function') {
    console.warn(`⚠️  Ignorando "${file}" — não exporta { data, execute } corretamente.`);
    console.warn(`    (provavelmente é um arquivo utilitário que foi colocado em commands/ por engano)`);
    continue;
  }

  commands.push(command.data.toJSON());
  console.log(`✅ ${command.data.name}`);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\nRegistrando ${commands.length} comandos...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Sucesso! ${data.length} comandos registrados.`);
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }
})();

