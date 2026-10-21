
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informações de um usuário')
    .addUserOption(opt =>
      opt
        .setName('usuario')
        .setDescription('Usuário a verificar')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    await interaction.deferReply();

    const user = interaction.options.getUser('usuario') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id);

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`ℹ️ Informações de ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Tag', value: user.tag, inline: true },
        { name: 'Bot', value: user.bot ? 'Sim ✅' : 'Não ❌', inline: true },
        { name: 'Conta Criada', value: user.createdAt.toLocaleDateString('pt-BR'), inline: true },
        { name: 'Entrou no Servidor', value: member.joinedAt.toLocaleDateString('pt-BR'), inline: true },
        { name: 'Cargos', value: member.roles.cache.map(r => r.name).join(', ') || 'Nenhum', inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
