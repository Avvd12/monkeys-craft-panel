


const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkAdmin } = require('../utils/permissions');
const { executeCommand } = require('../utils/rcon');
const { buildTitleCommands, buildChatMessage } = require('../utils/mcMessage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Faz um anúncio para o servidor (Discord + tela do jogo)')
    .addStringOption(opt => opt.setName('titulo').setDescription('Título do anúncio').setRequired(true))
    .addStringOption(opt => opt.setName('mensagem').setDescription('Conteúdo do anúncio').setRequired(true))
    .addStringOption(opt => opt.setName('cor').setDescription('Cor (ex: gold, red, #00AAFF)').setRequired(false)),

  async execute(interaction) {
    if (!(await checkAdmin(interaction))) return;

    const titulo = interaction.options.getString('titulo');
    const mensagem = interaction.options.getString('mensagem');
    const cor = interaction.options.getString('cor') || 'gold';

    await interaction.deferReply();

    try {
      for (const cmd of buildTitleCommands(titulo, null, cor)) {
        await executeCommand(cmd);
      }
      await executeCommand(buildChatMessage(mensagem, cor, true));
    } catch (error) {
      console.error('Erro ao anunciar no jogo:', error.message);
    }

    const embedCor = cor.startsWith('#') ? cor : '#FFD700';
    const embed = new EmbedBuilder()
      .setColor(embedCor)
      .setTitle(`📢 ${titulo}`)
      .setDescription(mensagem)
      .setFooter({ text: `Anunciado por ${interaction.user.username}` })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    await interaction.editReply({ content: '✅ Anúncio enviado no Discord e na tela do jogo!' });
  },
};


