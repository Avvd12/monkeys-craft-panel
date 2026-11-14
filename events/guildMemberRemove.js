'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const banco = require('../src/bot/util/banco');

function acharCanal(guild) {
  let id = null;

  try {
    id = banco.obter(guild.id, 'despedida_canal');
  } catch (e) {
    id = null;
  }

  if (!id && config.discord) {
    id = config.discord.despedidaChannelId
      || config.discord.byeChannelId
      || config.discord.canalDespedida
      || null;
  }

  if (!id) return null;

  const canal = guild.channels.cache.get(String(id));
  if (!canal || !canal.isTextBased()) return null;

  return canal;
}

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    if (!member || !member.guild) return;

    const hub = member.client && member.client.hub;
    const canal = acharCanal(member.guild);

    if (!canal) {
      if (hub) hub.log('bot', 'aviso', 'Canal de despedida nao configurado.');
      return;
    }

    const usuario = member.user || null;
    const nome = usuario && usuario.username ? usuario.username : 'Um membro';
    const avatar = usuario && typeof usuario.displayAvatarURL === 'function'
      ? usuario.displayAvatarURL({ size: 256 })
      : null;

    const entrou = member.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
      : 'desconhecido';

    const mensagem = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setTitle('Ate logo')
      .setDescription(`${nome} saiu do servidor.`)
      .addFields(
        { name: 'Entrou em', value: entrou, inline: true },
        { name: 'Membros agora', value: String(member.guild.memberCount), inline: true }
      )
      .setFooter({ text: 'Monkeys Craft' })
      .setTimestamp();

    if (avatar) mensagem.setThumbnail(avatar);

    try {
      await canal.send({ embeds: [mensagem] });
    } catch (e) {
      if (hub) hub.log('bot', 'erro', `Falha ao enviar despedida: ${e.message}`);
    }
  }
};