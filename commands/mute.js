

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia um membro por um tempo')
    .addUserOption(opt =>
      opt
        .setName('usuario')
        .setDescription('Usuário a silenciar')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt
        .setName('tempo')
        .setDescription('Tempo em minutos')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo do mute')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const user = interaction.options.getUser('usuario');
    const member = await interaction.guild.members.fetch(user.id);
    const tempo = interaction.options.getInteger('tempo');
    const motivo = interaction.options.getString('motivo') || 'Não especificado';

    await interaction.deferReply();

    try {
      await member.timeout(tempo * 60 * 1000, motivo);

      const embed = new EmbedBuilder()
        .setColor('#FFAA00')
        .setTitle('🔇 Membro Silenciado')
        .addFields(
          { name: 'Usuário', value: `${user}`, inline: true },
          { name: 'Duração', value: `${tempo} minutos`, inline: true },
          { name: 'Motivo', value: motivo, inline: true },
          { name: 'Silenciado por', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`🔇 ${user.tag} foi silenciado por ${tempo}min por ${interaction.user.tag}`);
    } catch (error) {
      await interaction.editReply('❌ Erro ao silenciar membro!');
      console.error(error);
    }
  },
};

