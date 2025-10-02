const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your Heavenly Pounds balance and inventory'),

  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View the shop to exchange Heavenly Pounds for resources'),

  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy a resource from the shop')
    .addStringOption(option =>
      option.setName('resource')
        .setDescription('The resource to buy')
        .setRequired(true)
        .addChoices(
          { name: 'Gold', value: 'gold' },
          { name: 'Wood', value: 'wood' },
          { name: 'Food', value: 'food' },
          { name: 'Stone', value: 'stone' }
        )
    )
  ,
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows how to earn currency and lists all commands'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily Heavenly Pounds reward!'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription("Check your or another user's contribution stats")
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to check stats for (admin only)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Shows the top users with the most Heavenly Pounds'),

  new SlashCommandBuilder()
    .setName('pool')
    .setDescription('Admin: Check the server pool balance'),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Admin: Start a giveaway from the server pool')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Duration of the giveaway (e.g., 10m, 2h, 3d)')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('winners')
        .setDescription('Number of winners')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option.setName('total_prize')
        .setDescription('Total prize amount in HP (e.g., 1000, 10k)')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('entry_cost')
        .setDescription('Amount of HP to enter the giveaway (0 for free)')
        .setRequired(false)
        .setMinValue(0)
    ),
  
  new SlashCommandBuilder()
    .setName('giveaway-end')
    .setDescription('Admin: Cancel an active giveaway and refund the prize')
    .addStringOption(option =>
      option.setName('message_id')
        .setDescription('The message ID of the giveaway to cancel')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('prize_to_refund')
        .setDescription('The exact prize amount to refund to the pool')
        .setRequired(true)
    ),
].map(command => command.toJSON());

const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();