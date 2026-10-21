


const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');
const { executeCommand } = require('../utils/rcon');
const { buildTitleCommands, buildChatMessage } = require('../utils/mcMessage');
const { startServer } = require('../utils/serverProcess');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Reinicia o servidor Minecraft'),

  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    await interaction.deferReply();

    // Avisa na tela e no chat do jogo
    try {
      for (const cmd of buildTitleCommands('SERVIDOR REINICIANDO', 'em 30 segundos', '#FF5555')) {
        await executeCommand(cmd);
      }
      await executeCommand(buildChatMessage('⚠ O servidor será reiniciado em 30 segundos!', 'red', true));
    } catch (error) {
      console.error('Erro ao avisar no jogo:', error.message);
    }

    const embed = new EmbedBuilder()
      .setColor('#FF6600')
      .setTitle('🔄 Servidor Reiniciando')
      .setDescription('Aviso enviado no jogo. O servidor vai parar em **30 segundos** e reiniciar automaticamente em seguida.')
      .addFields({ name: 'Responsável', value: `${interaction.user}`, inline: true })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    setTimeout(async () => {
      try {
        await executeCommand('stop');
        console.log('🔄 Comando stop enviado.');
      } catch (error) {
        console.error('Erro ao parar servidor:', error.message);
      }

      // Espera o processo antigo finalizar de vez antes de subir um novo
      setTimeout(() => {
        try {
          startServer();
        } catch (error) {
          console.error('❌ Erro ao iniciar novo processo do servidor:', error.message);
        }
      }, 15000);
    }, 30000);
  },
};


