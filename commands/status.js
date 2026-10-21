


const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { status } = require('minecraft-server-util');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o status do servidor Minecraft'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const result = await status(config.minecraft.host, config.minecraft.port, {
        timeout: 5000,
        enableSRV: false,
      });

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🟢 Servidor Minecraft - Status')
        .addFields(
          { name: 'Estado', value: '🟢 Online', inline: true },
          { name: 'Jogadores Online', value: `${result.players.online}/${result.players.max}`, inline: true },
          { name: 'Ping do Servidor', value: `${result.roundTripLatency}ms`, inline: true },
          { name: 'Versão', value: result.version?.name || 'Desconhecida', inline: true }
        )
        .setTimestamp();

      // Mostra nomes se o servidor divulgar a amostra de jogadores
      if (result.players.sample && result.players.sample.length > 0) {
        embed.addFields({
          name: 'Jogadores',
          value: result.players.sample.map(p => p.name).join(', '),
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔴 Servidor Offline')
        .setDescription('O servidor não está online no momento.')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }
  },
};


