
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove o silêncio de um membro')
    .addUserOption(opt =>
      opt
        .setName('usuario')
        .setDescription('Usuário a dessilenciar')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const user = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(user.id);

    await interaction.deferReply();

    try {
      await member.timeout(null);

      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🔊 Membro Dessilenciado')
        .addFields(
          { name: 'Usuário', value: `${user}`, inline: true },
          { name: 'Dessilenciado por', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`🔊 ${user.tag} foi dessilenciado por ${interaction.user.tag}`);
    } catch (error) {
      await interaction.editReply('❌ Erro ao dessilenciar membro!');
      console.error(error);
    }
  },
};
