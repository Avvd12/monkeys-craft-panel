'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed, bloco } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('tps')
    .setDescription('Mostra o desempenho do servidor de Minecraft'),

  async executar(interacao, ctx) {
    if (!ctx.minecraft || typeof ctx.minecraft.executar !== 'function') {
      return interacao.reply({
        embeds: [embed('erro', 'Indisponivel', 'O gerenciador do Minecraft nao esta acessivel.')],
        ephemeral: true
      });
    }

    await interacao.deferReply();

    try {
      const resposta = await ctx.minecraft.executar('tps');
      await interacao.editReply({
        embeds: [embed('minecraft', 'Desempenho do servidor', bloco(resposta || 'sem resposta'))]
      });
    } catch (e) {
      await interacao.editReply({ embeds: [embed('erro', 'Falha ao consultar', e.message)] });
    }
  }
};