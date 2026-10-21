
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avisa um membro por comportamento inadequado')
    .addUserOption(opt =>
      opt
        .setName('usuario')
        .setDescription('Usuário a avisar')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('motivo')
        .setDescription('Motivo do aviso')
        .setRequired(true)
    ),
  
  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const user = interaction.options.getUser('usuario');
    const motivo = interaction.options.getString('motivo');

    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setColor('#FFAA00')
      .setTitle('⚠️ Aviso Recebido')
      .addFields(
        { name: 'Usuário', value: `${user}`, inline: true },
        { name: 'Motivo', value: motivo, inline: true },
        { name: 'Avisor', value: interaction.user.username, inline: true }
      )
      .setDescription('⚠️ **Atenção!** Você recebeu um aviso. Comportamentos inadequados podem resultar em ações mais severas.')
      .setTimestamp();

    try {
      await user.send({ embeds: [embed] });
    } catch {
      console.log('Não foi possível enviar DM para o usuário');
    }

    await interaction.editReply({ embeds: [embed] });
    console.log(`⚠️ ${user.tag} foi avisado por ${interaction.user.tag}. Motivo: ${motivo}`);
  },
};
