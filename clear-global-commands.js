

// Este script APAGA todos os comandos GLOBAIS da aplicação.
// Rode uma única vez para eliminar a duplicação (guild + global).
// Depois disso, continue usando só o deploy-commands.js (que registra em GUILD_ID).

const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🧹 Limpando comandos GLOBAIS...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log('✅ Comandos globais removidos! Só os de GUILD vão continuar aparecendo.');
  } catch (error) {
    console.error('❌ Erro ao limpar comandos globais:', error);
  }
})();

