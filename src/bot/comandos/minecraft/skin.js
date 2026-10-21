'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../util/embeds');

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('skin')
    .setDescription('Mostra a skin de um jogador do Minecraft Java Edition')
    .addStringOption((o) => o.setName('nick').setDescription('Nick do jogador').setRequired(true)),

  async executar(interacao) {
    const nick = interacao.options.getString('nick').trim();

    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      return interacao.reply({
        embeds: [embed('erro', 'Nick invalido', 'Use de 3 a 16 caracteres: letras, numeros e underline.')],
        ephemeral: true
      });
    }

    const e = embed('minecraft', `Skin de ${nick}`, null)
      .setImage(`https://mc-heads.net/body/${encodeURIComponent(nick)}/300`);

    await interacao.reply({ embeds: [e] });
  }
};