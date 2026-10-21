'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');
const banco = require('../../util/banco');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Apaga as advertencias de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro').setRequired(true))
    .addIntegerOption((o) => o.setName('id').setDescription('Apagar so uma advertencia, pelo numero dela').setMinValue(1)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const id = interacao.options.getInteger('id');

    if (id) {
      const apagadas = banco.apagarAviso(interacao.guildId, id);

      if (!apagadas) {
        return interacao.reply({
          embeds: [embed('erro', 'Nao encontrada', `Nao existe advertencia com o numero **${id}**.`)],
          ephemeral: true
        });
      }

      return interacao.reply({
        embeds: [embed('sucesso', 'Advertencia removida', `A advertencia **#${id}** de ${alvo} foi apagada.`)]
      });
    }

    const total = banco.contarAvisos(interacao.guildId, alvo.id);

    if (!total) {
      return interacao.reply({
        embeds: [embed('info', 'Nada a apagar', `${alvo} nao tem advertencias.`)],
        ephemeral: true
      });
    }

    banco.limparAvisos(interacao.guildId, alvo.id);

    await interacao.reply({
      embeds: [embed('sucesso', 'Advertencias apagadas', `${total} advertencia(s) de ${alvo} foram removidas.`)]
    });
  }
};