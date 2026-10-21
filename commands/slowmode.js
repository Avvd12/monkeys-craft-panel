
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Ativa ou desativa o slowmode do canal')
    .addIntegerOption(opt =>
      opt
        .setName('segundos')
        .setDescription('Segundos entre mensagens (0 = desativar)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    ),
  
  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const segundos = interaction.options.getInteger('segundos');

    await interaction.deferReply();

    try {
      await interaction.channel.setRateLimitPerUser(segundos);

      const status = segundos === 0 ? 'Desativado' : `${segundos}s`;

      const embed = new EmbedBuilder()
        .setColor(segundos === 0 ? '#00FF00' : '#FFAA00')
        .setTitle('⏱️ Slowmode Alterado')
        .addFields(
          { name: 'Canal', value: interaction.channel.name, inline: true },
          { name: 'Status', value: status, inline: true },
          { name: 'Alterado por', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`⏱️ Slowmode do canal ${interaction.channel.name} alterado para ${status} por ${interaction.user.tag}`);
    } catch (error) {
      await interaction.editReply('❌ Erro ao alterar slowmode!');
      console.error(error);
    }
  },
};
