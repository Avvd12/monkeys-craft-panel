'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('baninfo')
    .setDescription('Mostra os detalhes do banimento de um usuario')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('id').setDescription('ID do usuario').setRequired(true)),

  async executar(interacao) {
    const id = interacao.options.getString('id').trim();

    if (!/^\d{17,20}$/.test(id)) {
      return interacao.reply({
        embeds: [embed('erro', 'ID invalido', 'Informe o ID numerico do usuario (17 a 20 digitos).')],
        ephemeral: true
      });
    }

    await interacao.deferReply({ ephemeral: true });

    try {
      const banimento = await interacao.guild.bans.fetch(id);

      const e = embed('moderacao', 'Usuario banido', null)
        .setThumbnail(banimento.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'Usuario', value: banimento.user.tag, inline: true },
          { name: 'ID', value: banimento.user.id, inline: true },
          { name: 'Motivo', value: banimento.reason || 'nao informado' }
        );

      return interacao.editReply({ embeds: [e] });
    } catch (e) {
      return interacao.editReply({
        embeds: [embed('info', 'Nao esta banido', 'Esse usuario nao esta na lista de banidos do servidor.')]
      });
    }
  }
};