

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');
const { executeCommand } = require('../utils/rcon');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Gerencia bans de jogadores')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Banir um jogador')
        .addStringOption(opt => opt.setName('player').setDescription('Nome do jogador').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo do ban').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Desbanir um jogador')
        .addStringOption(opt => opt.setName('player').setDescription('Nome do jogador').setRequired(true))
    ),

  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const subcommand = interaction.options.getSubcommand();
    const player = interaction.options.getString('player');
    const motivo = interaction.options.getString('motivo') || 'Não especificado';

    await interaction.deferReply();

    try {
      if (subcommand === 'add') {
        const response = await executeCommand(`ban ${player} ${motivo}`);

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🚫 Jogador Banido')
          .addFields(
            { name: 'Jogador', value: player, inline: true },
            { name: 'Motivo', value: motivo, inline: true },
            { name: 'Banido por', value: interaction.user.username, inline: true },
            { name: 'Resposta do servidor', value: response || 'Sem retorno', inline: false }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`🚫 ${player} foi banido por ${interaction.user.tag}. Motivo: ${motivo}`);
      } else {
        const response = await executeCommand(`pardon ${player}`);

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Ban Removido')
          .addFields(
            { name: 'Jogador', value: player, inline: true },
            { name: 'Removido por', value: interaction.user.username, inline: true },
            { name: 'Resposta do servidor', value: response || 'Sem retorno', inline: false }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ Ban de ${player} foi removido por ${interaction.user.tag}`);
      }
    } catch (error) {
      console.error('Erro RCON (ban):', error);
      await interaction.editReply(`❌ Erro ao executar no servidor: ${error.message}`);
    }
  },
};

