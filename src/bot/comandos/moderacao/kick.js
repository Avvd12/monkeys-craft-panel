'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro a expulsar').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const motivo = interacao.options.getString('motivo') || 'nao informado';

    const membro = await interacao.guild.members.fetch(alvo.id).catch(() => null);

    if (!membro) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao encontrado', 'Esse membro nao esta no servidor.')],
        ephemeral: true
      });
    }

    if (!membro.kickable) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao foi possivel expulsar', 'O cargo do bot esta abaixo do cargo desse membro.')],
        ephemeral: true
      });
    }

    try {
      await membro.kick(`${motivo} (por ${interacao.user.tag})`);
    } catch (e) {
      return interacao.reply({ embeds: [embed('erro', 'Falha ao expulsar', e.message)], ephemeral: true });
    }

    await interacao.reply({
      embeds: [embed('moderacao', 'Membro expulso', `**Usuario:** ${alvo.tag}\n**Motivo:** ${motivo}\n**Moderador:** ${interacao.user}`)]
    });
  }
};