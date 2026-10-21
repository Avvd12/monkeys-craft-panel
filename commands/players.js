

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { status } = require('minecraft-server-util');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('players')
    .setDescription('Lista os jogadores online no servidor'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const result = await status(config.minecraft.host, config.minecraft.port, {
        timeout: 5000,
        enableSRV: false,
      });

      const players = result.players.sample ? result.players.sample.map(p => p.name) : [];

      const embed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('👥 Jogadores Online')
        .setDescription(
          players.length > 0
            ? players.map((p, i) => `${i + 1}. ${p}`).join('\n')
            : `${result.players.online} jogador(es) online (nomes não divulgados pelo servidor)`
        )
        .setFooter({ text: `${result.players.online}/${result.players.max} vagas` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('🔴 O servidor não está online no momento.');
    }
  },
};

