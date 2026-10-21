'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');
const banco = require('../../util/banco');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Lista as advertencias de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro a consultar').setRequired(true)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const lista = banco.listarAvisos(interacao.guildId, alvo.id);

    if (!lista.length) {
      return interacao.reply({
        embeds: [embed('info', 'Sem advertencias', `${alvo} nao tem nenhuma advertencia.`)],
        ephemeral: true
      });
    }

    const linhas = lista.slice(0, 15).map((a) =>
      `**#${a.id}** · <t:${Math.floor(a.criado_em / 1000)}:d> · <@${a.moderador_id}>\n${a.motivo}`
    );

    await interacao.reply({
      embeds: [embed('moderacao', `Advertencias de ${alvo.username}`, linhas.join('\n\n').slice(0, 4000))],
      ephemeral: true
    });
  }
};