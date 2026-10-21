'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Anuncia uma mensagem no chat do servidor de Minecraft')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName('mensagem').setDescription('Mensagem a anunciar').setRequired(true)),

  async executar(interacao, ctx) {
    const mensagem = interacao.options.getString('mensagem');

    if (!ctx.minecraft || typeof ctx.minecraft.executar !== 'function') {
      return interacao.reply({
        embeds: [embed('erro', 'Indisponivel', 'O gerenciador do Minecraft nao esta acessivel.')],
        ephemeral: true
      });
    }

    await interacao.deferReply({ ephemeral: true });

    try {
      await ctx.minecraft.executar(`say ${mensagem}`);
      await interacao.editReply({
        embeds: [embed('sucesso', 'Mensagem enviada', `Anunciado no jogo: ${mensagem}`)]
      });
    } catch (e) {
      await interacao.editReply({ embeds: [embed('erro', 'Falha ao anunciar', e.message)] });
    }
  }
};