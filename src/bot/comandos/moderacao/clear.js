'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Apaga mensagens do canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName('quantidade').setDescription('Quantas mensagens apagar (1 a 100)').setRequired(true).setMinValue(1).setMaxValue(100)
    ),

  async executar(interacao) {
    const quantidade = interacao.options.getInteger('quantidade');

    await interacao.deferReply({ ephemeral: true });

    try {
      const apagadas = await interacao.channel.bulkDelete(quantidade, true);
      await interacao.editReply({
        embeds: [embed('sucesso', 'Mensagens apagadas', `${apagadas.size} mensagem(ns) removida(s).`)]
      });
    } catch (e) {
      await interacao.editReply({ embeds: [embed('erro', 'Falha ao apagar', e.message)] });
    }
  }
};