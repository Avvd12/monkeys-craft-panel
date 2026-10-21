

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');
const { executeCommand } = require('../utils/rcon');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whitelist')
    .setDescription('Gerencia a whitelist do servidor')
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Adicionar jogador à whitelist')
        .addStringOption(opt =>
          opt
            .setName('player')
            .setDescription('Nome do jogador')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remover jogador da whitelist')
        .addStringOption(opt =>
          opt
            .setName('player')
            .setDescription('Nome do jogador')
            .setRequired(true)
        )
    ),
  
  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const subcommand = interaction.options.getSubcommand();
    const player = interaction.options.getString('player');

    await interaction.deferReply();

    try {
      if (subcommand === 'add') {
        const response = await executeCommand(`whitelist add ${player}`);

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Jogador Adicionado à Whitelist')
          .addFields(
            { name: 'Jogador', value: player, inline: true },
            { name: 'Adicionado por', value: interaction.user.username, inline: true },
            { name: 'Resposta Servidor', value: response || 'Sucesso', inline: false }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`✅ ${player} foi adicionado à whitelist por ${interaction.user.tag}`);

      } else if (subcommand === 'remove') {
        const response = await executeCommand(`whitelist remove ${player}`);

        const embed = new EmbedBuilder()
          .setColor('#FF6600')
          .setTitle('🗑️ Jogador Removido da Whitelist')
          .addFields(
            { name: 'Jogador', value: player, inline: true },
            { name: 'Removido por', value: interaction.user.username, inline: true },
            { name: 'Resposta Servidor', value: response || 'Sucesso', inline: false }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`🗑️ ${player} foi removido da whitelist por ${interaction.user.tag}`);
      }
    } catch (error) {
      console.error('Erro RCON:', error);
      await interaction.editReply({
        content: `❌ Erro ao executar comando: ${error.message}`,
        ephemeral: true,
      });
    }
  },
};

