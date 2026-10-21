'use strict';

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { embed } = require('../../util/embeds');
const banco = require('../../util/banco');

module.exports = {
  categoria: 'Tickets',

  dados: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Sistema de atendimento')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s.setName('painel').setDescription('Publica o painel de abertura de tickets neste canal')
    )
    .addSubcommand((s) =>
      s.setName('fechar').setDescription('Fecha o ticket do canal atual')
    ),

  async executar(interacao) {
    const sub = interacao.options.getSubcommand();

    if (sub === 'painel') {
      const linha = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:abrir').setLabel('Abrir ticket').setStyle(ButtonStyle.Primary).setEmoji('📩')
      );

      await interacao.channel.send({
        embeds: [embed('ticket', 'Atendimento', 'Precisa de ajuda? Clique no botao abaixo e um canal privado sera criado para voce falar com a equipe.')],
        components: [linha]
      });

      return interacao.reply({ content: 'Painel publicado.', ephemeral: true });
    }

    if (sub === 'fechar') {
      const ticket = banco.ticketPorCanal(interacao.channelId);

      if (!ticket) {
        return interacao.reply({
          embeds: [embed('erro', 'Nao e um ticket', 'Este canal nao esta registrado como ticket aberto.')],
          ephemeral: true
        });
      }

      banco.fecharTicket(interacao.channelId);
      await interacao.reply({
        embeds: [embed('sucesso', 'Ticket fechado', 'Este canal sera apagado em 10 segundos.')]
      });

      setTimeout(() => interacao.channel.delete().catch(() => {}), 10000);
    }
  }
};