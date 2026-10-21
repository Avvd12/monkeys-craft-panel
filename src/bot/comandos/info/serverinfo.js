'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Informacao',

  dados: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra a ficha do servidor'),

  async executar(interacao) {
    const g = interacao.guild;

    const e = embed('info', g.name, null)
      .setThumbnail(g.iconURL({ size: 256 }))
      .addFields(
        { name: 'Membros', value: String(g.memberCount), inline: true },
        { name: 'Canais', value: String(g.channels.cache.size), inline: true },
        { name: 'Cargos', value: String(g.roles.cache.size), inline: true },
        { name: 'Criado em', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Dono', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Boosts', value: String(g.premiumSubscriptionCount || 0), inline: true }
      );

    await interacao.reply({ embeds: [e] });
  }
};