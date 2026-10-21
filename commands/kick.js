
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro do servidor Discord')
    .addUserOption(opt =>
      opt
        .setName('usuario')
        .setDescription('Usuário a expulsar')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo do kick')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const user = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(user.id);
    const motivo = interaction.options.getString('motivo') || 'Não especificado';

    await interaction.deferReply();

    try {
      await member.kick(motivo);

      const embed = new EmbedBuilder()
        .setColor('#FF6600')
        .setTitle('👢 Membro Expulso')
        .addFields(
          { name: 'Usuário', value: `${user}`, inline: true },
          { name: 'Motivo', value: motivo, inline: true },
          { name: 'Expulso por', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`👢 ${user.tag} foi expulso por ${interaction.user.tag}`);
    } catch (error) {
      await interaction.editReply('❌ Erro ao expulsar membro!');
      console.error(error);
    }
  },
};
