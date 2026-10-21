'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed, bloco } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Salva o mundo do servidor e confirma o backup')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async executar(interacao, ctx) {
    if (!ctx.minecraft || typeof ctx.minecraft.executar !== 'function') {
      return interacao.reply({
        embeds: [embed('erro', 'Indisponivel', 'O gerenciador do Minecraft nao esta acessivel.')],
        ephemeral: true
      });
    }

    await interacao.deferReply({ ephemeral: true });

    try {
      const resposta = await ctx.minecraft.executar('save-all');
      await interacao.editReply({
        embeds: [embed('sucesso', 'Mundo salvo', bloco(resposta || 'save-all executado'))]
      });
    } catch (e) {
      await interacao.editReply({ embeds: [embed('erro', 'Falha ao salvar', e.message)] });
    }
  }
};