



const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Limpa mensagens do canal')
    .addIntegerOption(opt =>
      opt.setName('quantidade').setDescription('Quantas mensagens deletar (máx 100)').setRequired(true)
    ),

  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const amount = interaction.options.getInteger('quantidade');

    if (amount < 1 || amount > 100) {
      return interaction.reply({
        content: '❌ Quantidade deve estar entre 1 e 100.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      const embed = new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle('🗑️ Canal Limpo')
        .addFields(
          { name: 'Mensagens Deletadas', value: `${deleted.size}`, inline: true },
          { name: 'Responsável', value: `${interaction.user}`, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('❌ Erro ao limpar canal:', error.message);
      await interaction.editReply({
        content: '❌ Erro ao limpar o canal. Verifique as permissões do bot.',
      });
    }
  },
};



