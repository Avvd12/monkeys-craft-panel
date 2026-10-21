

const { SlashCommandBuilder, EmbedBuilder, GuildVerificationLevel } = require('discord.js');

const NIVEL_VERIFICACAO = {
  [GuildVerificationLevel.None]: 'Nenhum',
  [GuildVerificationLevel.Low]: 'Baixo',
  [GuildVerificationLevel.Medium]: 'Médio',
  [GuildVerificationLevel.High]: 'Alto (☑️ Telefone verificado)',
  [GuildVerificationLevel.VeryHigh]: 'Muito Alto (☑️ Telefone verificado)',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra informações do servidor Discord'),

  async execute(interaction) {
    await interaction.deferReply();

    // Busca dados frescos (evita cache desatualizado)
    const guild = await interaction.guild.fetch();

    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`ℹ️ Informações de ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }) || null)
      .addFields(
        { name: 'ID do Servidor', value: guild.id, inline: true },
        { name: 'Criado em', value: guild.createdAt.toLocaleDateString('pt-BR'), inline: true },
        { name: 'Proprietário', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Membros', value: `${guild.memberCount}`, inline: true },
        { name: 'Canais', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Cargos (Roles)', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'Nível de Verificação', value: NIVEL_VERIFICACAO[guild.verificationLevel] || 'Desconhecido', inline: true },
        { name: 'Nível de Boost', value: `${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

