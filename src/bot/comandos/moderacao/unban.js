'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Moderacao',

  dados: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Remove o banimento de um usuario pelo ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('id').setDescription('ID do usuario banido').setRequired(true))
    .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setRequired(false)),

  async executar(interacao) {
    const id = interacao.options.getString('id').trim();
    const motivo = interacao.options.getString('motivo') || 'nao informado';

    if (!/^\d{17,20}$/.test(id)) {
      return interacao.reply({
        embeds: [embed('erro', 'ID invalido', 'Informe o ID numerico do usuario (17 a 20 digitos).')],
        ephemeral: true
      });
    }

    await interacao.deferReply({ ephemeral: true });

    try {
      await interacao.guild.bans.remove(id, `${motivo} (por ${interacao.user.tag})`);
    } catch (e) {
      return interacao.editReply({
        embeds: [embed('erro', 'Falha ao desbanir', 'Esse ID nao esta na lista de banidos ou o cargo do bot e insuficiente.')]
      });
    }

    await interacao.editReply({
      embeds: [embed('sucesso', 'Usuario desbanido', `**ID:** ${id}\n**Motivo:** ${motivo}`)]
    });
  }
};