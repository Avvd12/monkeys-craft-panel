'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { embed, bloco } = require('../../util/embeds');

function comHifens(id) {
  return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

async function buscarPerfil(nick) {
  const alvos = [
    `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(nick)}`,
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nick)}`
  ];

  for (const url of alvos) {
    try {
      const r = await fetch(url);
      if (r.status === 204 || r.status === 404) return null;
      if (!r.ok) continue;
      const d = await r.json();
      if (d && d.id && d.name) return d;
    } catch (e) {
      // tenta o proximo endpoint
    }
  }

  return null;
}

module.exports = {
  categoria: 'Minecraft',

  dados: new SlashCommandBuilder()
    .setName('uuid')
    .setDescription('Mostra o UUID de um jogador do Minecraft Java Edition')
    .addStringOption((o) => o.setName('nick').setDescription('Nick do jogador').setRequired(true)),

  async executar(interacao) {
    const nick = interacao.options.getString('nick').trim();

    if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
      return interacao.reply({
        embeds: [embed('erro', 'Nick invalido', 'Use de 3 a 16 caracteres: letras, numeros e underline.')],
        ephemeral: true
      });
    }

    await interacao.deferReply();

    const perfil = await buscarPerfil(nick);

    if (!perfil) {
      return interacao.editReply({
        embeds: [embed('erro', 'Nao encontrado', `Nao achei conta premium com o nick **${nick}**.`)]
      });
    }

    await interacao.editReply({
      embeds: [embed('minecraft', `UUID de ${perfil.name}`, bloco(comHifens(perfil.id)))]
    });
  }
};