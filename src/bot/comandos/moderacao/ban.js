'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('membro').setDescription('Membro a banir').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo do banimento').setRequired(false))
    .addIntegerOption((o) => o.setName('dias').setDescription('Dias de mensagens a apagar').setMinValue(0).setMaxValue(7)),

  async executar(interacao) {
    const alvo = interacao.options.getUser('membro');
    const motivo = interacao.options.getString('motivo') || 'nao informado';
    const dias = interacao.options.getInteger('dias') ?? 0;

    const membro = await interacao.guild.members.fetch(alvo.id).catch(() => null);

    if (membro && !membro.bannable) {
      return interacao.reply({
        embeds: [embed('erro', 'Nao foi possivel banir', 'O cargo do bot esta abaixo do cargo desse membro.')],
        ephemeral: true
      });
    }

    try {
      await interacao.guild.bans.create(alvo.id, {
        reason: `${motivo} (por ${interacao.user.tag})`,
        deleteMessageSeconds: dias * 86400
      });
    } catch (e) {
      return interacao.reply({ embeds: [embed('erro', 'Falha ao banir', e.message)], ephemeral: true });
    }

    await interacao.reply({
      embeds: [embed('moderacao', 'Membro banido', `**Usuario:** ${alvo.tag}\n**Motivo:** ${motivo}\n**Moderador:** ${interacao.user}`)]
    });
  }
};