'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Define o modo lento do canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o.setName('segundos').setDescription('Intervalo entre mensagens (0 desliga)').setRequired(true).setMinValue(0).setMaxValue(21600)
    ),

  async executar(interacao) {
    const segundos = interacao.options.getInteger('segundos');

    try {
      await interacao.channel.setRateLimitPerUser(segundos);
    } catch (e) {
      return interacao.reply({ embeds: [embed('erro', 'Falha ao definir', e.message)], ephemeral: true });
    }

    await interacao.reply({
      embeds: [embed('sucesso', 'Modo lento definido', segundos === 0 ? 'Modo lento desligado.' : `Intervalo de ${segundos} segundo(s).`)]
    });
  }
};