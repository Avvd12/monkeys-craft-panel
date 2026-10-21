'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Aplica um silenciamento temporario em um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro a silenciar').setRequired(true))
    .addIntegerOption((o) => o.setName('minutos').setDescription('Duracao em minutos').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const minutos = interacao.options.getInteger('minutos');
    const motivo = interacao.options.getString('motivo') || 'nao informado';

    const membro = await interacao.guild.members.fetch(alvo.id).catch(() => null);

    if (!membro) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao encontrado', 'Esse membro nao esta no servidor.')],
        ephemeral: true
      });
    }

    if (!membro.moderatable) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao foi possivel silenciar', 'O cargo do bot esta abaixo do cargo desse membro.')],
        ephemeral: true
      });
    }

    try {
      await membro.timeout(minutos * 60 * 1000, `${motivo} (por ${interacao.user.tag})`);
    } catch (e) {
      return interacao.reply({ embeds: [embed('erro', 'Falha ao silenciar', e.message)], ephemeral: true });
    }

    await interacao.reply({
      embeds: [embed('moderacao', 'Membro silenciado', `**Usuario:** ${alvo.tag}\n**Duracao:** ${minutos} minuto(s)\n**Motivo:** ${motivo}`)]
    });
  }
};