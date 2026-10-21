'use strict';

module.exports = {
  name: 'guildMemberRemove',
  execute(member) {
    member.client.hub?.log('discord', 'info', `Saiu: ${member.user.tag} (${member.guild.name})`);
  }
};