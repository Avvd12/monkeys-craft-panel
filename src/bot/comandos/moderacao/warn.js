'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');
const banco = require('../../util/banco');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Registra uma advertencia em um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro a advertir').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo da advertencia').setRequired(true)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const motivo = interacao.options.getString('motivo');

    banco.criarAviso(interacao.guildId, alvo.id, interacao.user.id, motivo);
    const total = banco.contarAvisos(interacao.guildId, alvo.id);

    await interacao.reply({
      embeds: [embed('moderacao', 'Advertencia registrada', `${alvo} recebeu uma advertencia.\n**Motivo:** ${motivo}\n**Total:** ${total}`)]
    });

    try {
      await alvo.send({
        embeds: [embed('moderacao', 'Voce recebeu uma advertencia', `**Servidor:** ${interacao.guild.name}\n**Motivo:** ${motivo}`)]
      });
    } catch (e) {}
  }
};