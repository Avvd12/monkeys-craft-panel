'use strict';

module.exports = {
  name: 'guildMemberAdd',
  execute(member) {
    member.client.hub?.log('discord', 'sucesso', `Entrou: ${member.user.tag} (${member.guild.name})`);
  }
};