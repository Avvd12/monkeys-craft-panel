'use strict';

module.exports = {
  name: 'messageCreate',
  execute(message) {
    if (message.author.bot) return;
    const hub = message.client.hub;
    if (!hub) return;
    hub.log('discord', 'info', `[${message.guild?.name ?? 'DM'}] ${message.author.tag}: ${message.content.slice(0, 150)}`);
  }
};