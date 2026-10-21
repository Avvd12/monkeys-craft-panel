'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Reinicia o servidor de Minecraft')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((o) =>
      o.setName('aviso').setDescription('Segundos de aviso antes de reiniciar').setMinValue(0).setMaxValue(600)
    ),

  async executar(interacao) {
    const segundos = interacao.options.getInteger('aviso') ?? 30;

    const linha = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('restart:confirmar').setLabel('Confirmar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('restart:cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
    );

    await interacao.reply({
      embeds: [embed('minecraft', 'Confirmar reinicio', `O servidor sera reiniciado com **${segundos}s** de aviso. Confirma?`)],
      components: [linha],
      ephemeral: true
    });
  }
};