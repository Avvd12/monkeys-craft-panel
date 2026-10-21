'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove o silenciamento de um membro')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro a liberar').setRequired(true)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const membro = await interacao.guild.members.fetch(alvo.id).catch(() => null);

    if (!membro) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao encontrado', 'Esse membro nao esta no servidor.')],
        ephemeral: true
      });
    }

    if (!membro.isCommunicationDisabled || !membro.isCommunicationDisabled()) {
      return interacao.reply({
        embeds: [embed('info', 'Sem silenciamento', `${alvo} nao esta silenciado.`)],
        ephemeral: true
      });
    }

    try {
      await membro.timeout(null, `Silenciamento removido por ${interacao.user.tag}`);
    } catch (e) {
      return interacao.reply({ embeds: [embed('erro', 'Falha ao liberar', e.message)], ephemeral: true });
    }

    await interacao.reply({
      embeds: [embed('sucesso', 'Silenciamento removido', `${alvo} pode voltar a falar.`)]
    });
  }
};