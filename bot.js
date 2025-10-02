const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Events, MessageFlags } = require('discord.js');
const db = require('./database');
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const cachedInvites = new Map(); // code -> uses
const voiceTimes = new Map(); // userId -> startTime
const activeGiveaways = new Map(); // messageId -> collector

// --- Logging Function ---
async function logActivity(title, message, color = 'Blue') {
  const logChannelId = process.env.LOG_CHANNEL_ID;
  if (!logChannelId) return; // Do nothing if the channel ID is not set

  try {
    const channel = await client.channels.fetch(logChannelId);
    if (channel && channel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(message)
        .setColor(color)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Failed to send log message:', error);
  }
}

// --- Google Sheets Logging Function ---
async function logPurchaseToSheet(username, resource, resourceAmount, cost) {
  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;

  if (!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.log('Google Sheets credentials not configured. Skipping sheet log.');
    return;
  }

  try {
    const jwt = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, jwt);
    await doc.loadInfo();
    
    const sheetTitle = 'Purchases';
    let sheet = doc.sheetsByTitle[sheetTitle];

    if (!sheet) {
      console.log(`Sheet "${sheetTitle}" not found. Creating it now...`);
      sheet = await doc.addSheet({ title: sheetTitle, headerValues: ['Timestamp', 'User', 'Gold', 'Wood', 'Food', 'Stone', 'HP Cost'] });
    } else {
      // If sheet exists, ensure headers are loaded and correct
      await sheet.loadHeaderRow();
      if (sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(['Timestamp', 'User', 'Gold', 'Wood', 'Food', 'Stone', 'HP Cost']);
      }
    }

    // --- Find existing user row or add/update ---
    const rows = await sheet.getRows();
    let userRow = rows.find(r => r.get('User') === username && r.get('Timestamp') !== 'TOTALS');

    if (userRow) {
      // Update existing row by adding the new amounts
      const resourceColumnName = resource.charAt(0).toUpperCase() + resource.slice(1);
      const currentResourceAmount = parseFloat(userRow.get(resourceColumnName)) || 0;
      const currentCost = parseFloat(userRow.get('HP Cost')) || 0;

      userRow.set(resourceColumnName, currentResourceAmount + resourceAmount);
      userRow.set('HP Cost', currentCost + cost);
      await userRow.save();
    } else {
      // Add a new row for the user's first purchase
      const newRowData = {
        Timestamp: new Date().toLocaleString('en-US', { timeZone: 'UTC' }),
        User: username,
        Gold: resource === 'gold' ? resourceAmount : 0,
        Wood: resource === 'wood' ? resourceAmount : 0,
        Food: resource === 'food' ? resourceAmount : 0,
        Stone: resource === 'stone' ? resourceAmount : 0,
        'HP Cost': cost,
      };
      await sheet.addRow(newRowData);
    }

    // --- Update Totals Row ---
    const totalsRow = rows.find(r => r.get('Timestamp') === 'TOTALS');
    if (totalsRow) {
      await totalsRow.delete();
    }

    // Calculate totals from all purchase rows
    const totals = { Gold: 0, Wood: 0, Food: 0, Stone: 0, 'HP Cost': 0 };
    // We need to re-fetch the rows after potential deletion and addition
    const updatedRows = await sheet.getRows();
    updatedRows.forEach(row => {
      totals.Gold += parseFloat(row.get('Gold')) || 0;
      totals.Wood += parseFloat(row.get('Wood')) || 0;
      totals.Food += parseFloat(row.get('Food')) || 0;
      totals.Stone += parseFloat(row.get('Stone')) || 0;
      totals['HP Cost'] += parseFloat(row.get('HP Cost')) || 0;
    });

    // Add the new totals row at the very end
    await sheet.addRow({
      Timestamp: 'TOTALS',
      User: '',
      ...totals
    });

    console.log(`Successfully logged purchase to "${sheetTitle}" sheet.`);
    await logActivity('📄 Google Sheet Updated', `Successfully logged a purchase from **${username}** to the **${sheetTitle}** sheet.`, 'DarkGreen');
  } catch (error) {
    console.error('Error logging purchase to Google Sheet:', error);
    await logActivity('⚠️ Google Sheet Error', `Failed to log a purchase from **${username}**.\n**Error:** \`${error.message}\``, 'Red');
  }
}

// --- Helper Function to Parse Shorthand ---
function parseShorthand(value) {
  if (typeof value !== 'string') return value;

  const lastChar = value.slice(-1).toLowerCase();
  const numPart = value.slice(0, -1);
  
  if (!isNaN(numPart) && numPart !== '') {
    const num = parseFloat(numPart);
    switch (lastChar) {
      case 'k':
        return num * 1e3;
      case 'm':
        return num * 1e6;
      case 'b':
        return num * 1e9;
    }
  }
  return parseFloat(value);
}

// --- Helper Function to Parse Duration ---
function parseDuration(durationString) {
  const durationRegex = /^(\d+)(m|h|d)$/i;
  const match = durationString.match(durationRegex);

  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  let milliseconds = 0;

  switch (unit) {
    case 'm':
      milliseconds = value * 60 * 1000;
      break;
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
  }
  return milliseconds;
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    const invites = await guild.invites.fetch();
    invites.forEach(invite => {
      cachedInvites.set(invite.code, invite.uses);
    });
  }

  // Reset daily counts if needed, but for simplicity, not implemented
});

client.on('guildMemberAdd', async member => {
  const guild = member.guild;
  const newInvites = await guild.invites.fetch();
  let inviterId = null;
  newInvites.forEach(invite => {
    const oldUses = cachedInvites.get(invite.code) || 0;
    if (invite.uses > oldUses) {
      inviterId = invite.inviter.id;
    }
    cachedInvites.set(invite.code, invite.uses);
  });
  if (inviterId && inviterId !== member.id) { // avoid self
    db.run('INSERT OR IGNORE INTO users (id) VALUES (?)', [inviterId]);
    db.run('UPDATE users SET balance = balance + 80 WHERE id = ?', [inviterId]);
    db.run('INSERT OR REPLACE INTO invites (user_id, invites) VALUES (?, COALESCE((SELECT invites FROM invites WHERE user_id = ?), 0) + 1)', [inviterId, inviterId]);
    logActivity('💌 Invite Reward', `<@${inviterId}> received **80** Heavenly Pounds for inviting ${member.user.tag}.`, 'Green');
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  db.run('INSERT OR IGNORE INTO users (id) VALUES (?)', [message.author.id]);
  db.run('INSERT OR REPLACE INTO message_counts (user_id, count, last_reset) VALUES (?, COALESCE((SELECT count FROM message_counts WHERE user_id = ? AND last_reset = CURRENT_DATE), 0) + 1, CURRENT_DATE)', [message.author.id, message.author.id]);
  // Check for reward
  db.get('SELECT count FROM message_counts WHERE user_id = ? AND last_reset = CURRENT_DATE', [message.author.id], (err, row) => {
    if (row && row.count % 100 === 0) {
      db.run('UPDATE users SET balance = balance + 20 WHERE id = ?', [message.author.id]);
      logActivity('💬 Message Reward', `<@${message.author.id}> received **20** Heavenly Pounds for sending 100 messages.`, 'Green');
    }
  });
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (member.user.bot) return;
  db.run('INSERT OR IGNORE INTO users (id) VALUES (?)', [member.id]);
  if (oldState.channelId && !newState.channelId) { // left
    const start = voiceTimes.get(member.id);
    if (start) {
      const minutes = Math.floor((Date.now() - start) / 60000);
      voiceTimes.delete(member.id);
      db.run('INSERT OR REPLACE INTO voice_times (user_id, minutes, last_reset) VALUES (?, COALESCE((SELECT minutes FROM voice_times WHERE user_id = ? AND last_reset = CURRENT_DATE), 0) + ?, CURRENT_DATE)', [member.id, member.id, minutes]);
      // Reward every 60 minutes
      db.get('SELECT minutes FROM voice_times WHERE user_id = ? AND last_reset = CURRENT_DATE', [member.id], (err, row) => {
        if (row) {
          const totalMinutes = row.minutes;
          const rewards = Math.floor(totalMinutes / 60) - Math.floor((totalMinutes - minutes) / 60);
          if (rewards > 0) {
            db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [rewards * 20, member.id]);
            logActivity('🎤 Voice Chat Reward', `<@${member.id}> received **${rewards * 20}** Heavenly Pounds for spending time in voice chat.`, 'Green');
          }
        }
      });
    }
  } else if (!oldState.channelId && newState.channelId) { // joined
    voiceTimes.set(member.id, Date.now());
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  // Check if the member started boosting or if their roles changed (which can indicate a boost)
  if (!oldMember.premiumSince && newMember.premiumSince) {
    const guild = newMember.guild;
    const currentBoosts = guild.premiumSubscriptionCount;

    db.get('SELECT rewarded_boosts FROM server_stats WHERE id = ?', [guild.id], (err, row) => {
      const rewardedBoosts = row?.rewarded_boosts || 0;
      const newBoosts = currentBoosts - rewardedBoosts;

      if (newBoosts > 0) {
        const reward = newBoosts * 1000;
        db.run('INSERT OR IGNORE INTO users (id) VALUES (?)', [newMember.id]);
        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [reward, newMember.id]);
        
        // Update the user's personal boost count
        db.run('INSERT OR REPLACE INTO boosts (user_id, boosts) VALUES (?, COALESCE((SELECT boosts FROM boosts WHERE user_id = ?), 0) + ?)', [newMember.id, newMember.id, newBoosts]);
        
        // Update the total rewarded boosts for the server
        db.run('INSERT OR REPLACE INTO server_stats (id, rewarded_boosts) VALUES (?, ?)', [guild.id, currentBoosts]);
        
        logActivity('🚀 Server Boost Reward', `<@${newMember.id}> received **${reward}** Heavenly Pounds for **${newBoosts}** new boost(s).`, 'Gold');
      }
    });
  }
});

client.on('guildCreate', guild => {
  console.log(`Joined a new guild: ${guild.name}`);
  // Initialize server pool with 100k
  db.run('INSERT OR IGNORE INTO server_stats (id, pool_balance) VALUES (?, ?)', [guild.id, 100000], function(err) {
    if (err) {
      return console.error('Failed to initialize server pool on guild join:', err.message);
    }
    logActivity('🏦 Server Pool Initialized', `The bot joined a new server. The pool has been initialized with **100,000** 💰.`, 'Green');
  });
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) { // Handle Slash Commands
    const { commandName } = interaction;
    db.run('INSERT OR IGNORE INTO users (id) VALUES (?)', [interaction.user.id]);

    if (commandName === 'balance') {
    db.get('SELECT * FROM users WHERE id = ?', [interaction.user.id], (err, row) => {
      const embed = new EmbedBuilder()
        .setTitle(`📊 Balance of ${interaction.user.username}`)
        .addFields(
          { name: '💰 Heavenly Pounds', value: `**${(row?.balance || 0).toLocaleString('en-US')}**`, inline: true },
          { name: '🪙 Gold', value: `${(row?.gold || 0).toLocaleString('en-US')}`, inline: true },
          { name: '🪵 Wood', value: `${(row?.wood || 0).toLocaleString('en-US')}`, inline: true },
          { name: '🌽 Food', value: `${(row?.food || 0).toLocaleString('en-US')}`, inline: true },
          { name: '🪨 Stone', value: `${(row?.stone || 0).toLocaleString('en-US')}`, inline: true }
        )
        .setFooter({ text: 'Note: Resources (RSS) will be granted when the temple is conquered. If the project is canceled, all resources and currency will be lost.' });
      interaction.reply({ embeds: [embed] });
    });
    } else if (commandName === 'shop') {
    const embed = new EmbedBuilder()
      .setTitle('🛍️ Heavenly Shop')
      .setDescription('Exchange your Heavenly Pounds for resources. Use `/buy` to purchase.\n\n- **🪙 Gold:** 10 HP for 50,000\n- **🪵 Wood:** 10 HP for 150,000\n- **🌽 Food:** 10 HP for 150,000\n- **🪨 Stone:** 10 HP for 112,000');
    interaction.reply({ embeds: [embed] });
    } else if (commandName === 'buy') {
    const resource = interaction.options.getString('resource');

    const modal = new ModalBuilder()
      .setCustomId(`buy_modal_${resource}`)
      .setTitle(`Buy ${resource.charAt(0).toUpperCase() + resource.slice(1)}`);

    const quantityInput = new TextInputBuilder()
      .setCustomId('hp_quantity_input')
      .setLabel("How many HP do you want to spend?")
      .setPlaceholder('e.g., 10, 5.5, 100k, 1.5m')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow = new ActionRowBuilder().addComponents(quantityInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);

    } else if (commandName === 'help') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('❓ Heavenly Pounds Help')
        .setColor('Green')
        .addFields(
          {
            name: '💸 How to Earn Heavenly Pounds',
            value: '- **Invites**: Earn **80** 💰 for each person you invite.\n' +
                   '- **Messages**: Earn **20** 💰 for every 100 messages you send.\n' +
                   '- **Voice Chat**: Earn **20** 💰 for every hour you spend in a voice channel.\n' +
                   '- **Server Boosts**: Earn **1,000** 💰 for each time you boost the server.'
          },
          {
            name: '🤖 User Commands',
            value: '`/balance`: Check your balance and resource inventory.\n' +
                   '`/shop`: View the items available for purchase.\n' +
                   '`/buy <resource>`: Purchase resources from the shop.\n' +
                   '`/daily`: Claim your daily reward with a streak bonus.\n' +
                   '`/stats [user]`: Check your contribution stats.\n' +
                   '`/leaderboard`: See the top 10 richest users and your rank.\n' +
                   '`/help`: Shows this help message.'
          },
          {
            name: '⚙️ Admin Commands',
            value: '`/pool`: Check the server pool balance.\n' +
                   '`/giveaway`: Start a giveaway funded by the server pool.\n' +
                   '`/giveaway-end`: Cancel an active giveaway.'
          },
        );
      interaction.reply({ embeds: [helpEmbed] });
    }  else if (commandName === 'daily') {
      const userId = interaction.user.id;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

      db.get('SELECT last_daily, daily_streak FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) {
          console.error(err);
          return interaction.reply({ content: '❌ An error occurred while processing your daily reward.', flags: [MessageFlags.Ephemeral] });
        }

        const lastDaily = row?.last_daily;
        let streak = row?.daily_streak || 0;

        if (lastDaily === todayStr) {
          // Calculate time until next claim (UTC midnight)
          const tomorrow = new Date(today);
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(0, 0, 0, 0);
          return interaction.reply({ content: `You have already claimed your daily reward today! Please come back <t:${Math.floor(tomorrow.getTime() / 1000)}:R>.`, flags: [MessageFlags.Ephemeral] });
        }

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().slice(0, 10);

        if (lastDaily === yesterdayStr) {
          // Continue the streak
          streak++;
        } else {
          // Reset the streak
          streak = 1;
        }

        const reward = 10 + streak;

        db.run('UPDATE users SET balance = balance + ?, last_daily = ?, daily_streak = ? WHERE id = ?', [reward, todayStr, streak, userId]);

        const replyEmbed = new EmbedBuilder()
          .setTitle('🎉 Daily Reward Claimed! 🎉')
          .setDescription(`You have received **${reward}** 💰!\nYour current streak is **${streak}** day(s). Come back tomorrow to increase it!`)
          .setColor('Gold');
        interaction.reply({ embeds: [replyEmbed] });
        logActivity('🎁 Daily Reward', `<@${userId}> claimed their daily reward of **${reward}** 💰 (Streak: ${streak}).`, 'Aqua');
      });
    } else if (commandName === 'stats') {
      const user = interaction.options.getUser('user') || interaction.user;

      const statsPromises = [
        new Promise(resolve => db.get('SELECT invites FROM invites WHERE user_id = ?', [user.id], (err, row) => resolve(row?.invites || 0))),
        new Promise(resolve => db.get('SELECT boosts FROM boosts WHERE user_id = ?', [user.id], (err, row) => resolve(row?.boosts || 0))),
        new Promise(resolve => db.get('SELECT count FROM message_counts WHERE user_id = ? AND last_reset = CURRENT_DATE', [user.id], (err, row) => resolve(row?.count || 0))),
        new Promise(resolve => db.get('SELECT minutes FROM voice_times WHERE user_id = ? AND last_reset = CURRENT_DATE', [user.id], (err, row) => resolve(row?.minutes || 0))),
      ];

      Promise.all(statsPromises).then(([invites, boosts, messages, voiceMinutes]) => {
        const statsEmbed = new EmbedBuilder()
          .setTitle(`📈 Stats for ${user.username}`)
          .setThumbnail(user.displayAvatarURL())
          .setColor('Blue')
          .addFields(
            { name: '💌 Invites', value: `**${invites}** total`, inline: true },
            { name: '🚀 Server Boosts', value: `**${boosts}** total`, inline: true },
            { name: '💬 Messages (Today)', value: `**${messages}** sent`, inline: true },
            { name: '🎤 Voice Chat (Today)', value: `**${voiceMinutes}** minutes`, inline: true }
          );
        interaction.reply({ embeds: [statsEmbed] });
      });

    } else if (commandName === 'leaderboard') {
    db.all('SELECT id, balance FROM users ORDER BY balance DESC', [], async (err, allUsers) => {
      if (err) {
        console.error(err);
        return interaction.reply('❌ An error occurred while fetching the leaderboard.');
      }

      const top10Users = allUsers.slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle('🏆 Heavenly Pounds Leaderboard')
        .setColor('Gold');

      let description = '';
      for (let i = 0; i < top10Users.length; i++) {
        try {
          const user = await client.users.fetch(top10Users[i].id);
          const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
          description += `${medal} <@${user.id}> - **${top10Users[i].balance.toLocaleString('en-US')}** 💰\n`;
        } catch {
          // User might not be in the server anymore
          description += `**${i + 1}.** *Unknown User* - **${top10Users[i].balance.toLocaleString('en-US')}** 💰\n`;
        }
      }

      if (description === '') {
        description = 'The leaderboard is empty!';
      }

      // Find the user's rank and add it if they are not in the top 10
      const userRankIndex = allUsers.findIndex(user => user.id === interaction.user.id);
      if (userRankIndex !== -1 && userRankIndex >= 10) {
        const userRank = userRankIndex + 1;
        const userBalance = allUsers[userRankIndex].balance;
        description += `\n...\n**${userRank}.** <@${interaction.user.id}> - **${userBalance.toLocaleString('en-US')}** 💰`;
      }

      embed.setDescription(description);
      interaction.reply({ embeds: [embed] });
    });
    } else if (commandName === 'pool') {
    const adminIds = (process.env.ADMIN_IDS || '').split(',');
    if (!adminIds.includes(interaction.user.id)) {
      return interaction.reply('🚫 You do not have permission to use this command.');
    }
    db.get('SELECT pool_balance FROM server_stats WHERE id = ?', [interaction.guildId], (err, row) => {
      const poolBalance = row?.pool_balance || 0;
      const embed = new EmbedBuilder()
        .setTitle('🏦 Server Pool Balance')
        .setDescription(`The server pool currently holds **${poolBalance.toLocaleString('en-US')}** 💰.`)
        .setColor('Aqua');
      interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
    });
    } else if (commandName === 'giveaway') {
    const adminIds = (process.env.ADMIN_IDS || '').split(',');
    if (!adminIds.includes(interaction.user.id)) {
      return interaction.reply('🚫 You do not have permission to use this command.');
    }

    const durationString = interaction.options.getString('duration');
    const durationMs = parseDuration(durationString);
    if (!durationMs) {
      return interaction.reply('⚠️ Invalid duration format. Please use formats like `10m`, `2h`, or `3d`.');
    }

    const winnersCount = interaction.options.getInteger('winners');
    const prize = parseShorthand(interaction.options.getString('total_prize'));
    const entryCost = interaction.options.getNumber('entry_cost') || 0;
    const pingRoleId = process.env.GIVEAWAY_PING_ROLE_ID;

    db.get('SELECT pool_balance FROM server_stats WHERE id = ?', [interaction.guildId], async (err, row) => {
      const poolBalance = row?.pool_balance || 0;
      if (prize > poolBalance) {
        return interaction.reply(`❌ Not enough funds in the server pool! The pool only has **${poolBalance.toLocaleString('en-US')}** 💰.`);
      }

      // Deduct from pool
      db.run('UPDATE server_stats SET pool_balance = pool_balance - ? WHERE id = ?', [prize, interaction.guildId]);

      const endTime = Date.now() + durationMs;
      const embed = new EmbedBuilder()
        .setTitle('🎉 GIVEAWAY! 🎉')
        .setDescription(`React with 🎉 to enter!\n\n**Prize:** **${prize.toLocaleString('en-US')}** Heavenly Pounds 💰\n**Entry Cost:** ${entryCost > 0 ? `**${entryCost.toLocaleString('en-US')}** 💰` : 'Free'}\n**Winners:** ${winnersCount}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>`)
        .setColor('Purple')
        .setFooter({ text: `Started by ${interaction.user.username}` });

      const giveawayMessage = await interaction.channel.send({ content: pingRoleId ? `<@&${pingRoleId}>` : '@here', embeds: [embed] });
      giveawayMessage.react('🎉');
      await interaction.reply({ content: '✅ Giveaway started!', flags: [MessageFlags.Ephemeral] });

      const collector = giveawayMessage.createReactionCollector({ time: durationMs });
      activeGiveaways.set(giveawayMessage.id, collector);

      const participants = new Set();

      collector.on('collect', (reaction, user) => {
        if (user.bot) return;

        db.get('SELECT balance FROM users WHERE id = ?', [user.id], (err, userRow) => {
          if ((userRow?.balance || 0) < entryCost) {
            reaction.users.remove(user.id);
            user.send(`❌ You don't have enough Heavenly Pounds to enter the giveaway. You need **${entryCost}** 💰.`).catch(() => {});
            return;
          }

          if (!participants.has(user.id)) {
            db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [entryCost, user.id]);
            db.run('UPDATE server_stats SET pool_balance = pool_balance + ? WHERE id = ?', [entryCost, interaction.guildId]);
            participants.add(user.id);
          }
        });
      });

      collector.on('end', collected => {
        activeGiveaways.delete(giveawayMessage.id);
        const winnerIds = Array.from(participants);

        if (winnerIds.length === 0) {
          db.run('UPDATE server_stats SET pool_balance = pool_balance + ? WHERE id = ?', [prize, interaction.guildId]);
          return interaction.channel.send('The giveaway ended with no participants. The prize has been returned to the server pool.');
        }

        const winners = [];
        for (let i = 0; i < winnersCount && winnerIds.length > 0; i++) {
          const winnerIndex = Math.floor(Math.random() * winnerIds.length);
          winners.push(winnerIds.splice(winnerIndex, 1)[0]);
        }

        const prizePerWinner = Math.floor(prize / winners.length);
        winners.forEach(winnerId => db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [prizePerWinner, winnerId]));

        interaction.channel.send(`Congratulations to ${winners.map(id => `<@${id}>`).join(', ')}! You've each won **${prizePerWinner.toLocaleString('en-US')}** 💰!`);
      });
    });
    } else if (commandName === 'giveaway-end') {
      const adminIds = (process.env.ADMIN_IDS || '').split(',');
      if (!adminIds.includes(interaction.user.id)) {
        return interaction.reply('🚫 You do not have permission to use this command.');
      }

      const messageId = interaction.options.getString('message_id');
      const collector = activeGiveaways.get(messageId);

      if (!collector) {
        return interaction.reply({ content: '❌ No active giveaway found with that message ID.', flags: [MessageFlags.Ephemeral] });
      }

      const prizeToRefund = parseShorthand(interaction.options.getString('prize_to_refund'));
      const entryCost = collector.options.entryCost || 0;

      // Stop the collector
      collector.stop();
      activeGiveaways.delete(messageId);

      // Refund the prize
      db.run('UPDATE server_stats SET pool_balance = pool_balance + ? WHERE id = ?', [prizeToRefund, interaction.guildId]);

      // Edit the original message
      const giveawayChannel = await client.channels.fetch(collector.channel.id);
      const giveawayMessage = await giveawayChannel.messages.fetch(messageId);
      const canceledEmbed = EmbedBuilder.from(giveawayMessage.embeds[0]).setTitle('🎉 GIVEAWAY CANCELED 🎉').setDescription('This giveaway was canceled by an admin.').setColor('Red');
      await giveawayMessage.edit({ embeds: [canceledEmbed], components: [] });

      // Refund entry fees to participants
      if (entryCost > 0) {
        const reactions = giveawayMessage.reactions.cache.get('🎉');
        const users = await reactions.users.fetch();
        users.filter(user => !user.bot).forEach(user => {
          db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [entryCost, user.id]);
        });
      }

      interaction.reply({ content: '✅ Giveaway has been successfully canceled and the prize refunded.', flags: [MessageFlags.Ephemeral] });
      logActivity('🎁 Giveaway Canceled', `Admin <@${interaction.user.id}> canceled the giveaway (\`${messageId}\`).\n- **${prizeToRefund.toLocaleString('en-US')}** 💰 was refunded to the server pool.\n- Entry fees were refunded to all participants.`, 'Orange');
    }
  } else if (interaction.isModalSubmit()) { // Handle Modal Submissions
    if (interaction.customId.startsWith('buy_modal_')) {
      const resource = interaction.customId.split('_')[2];
      const quantityString = interaction.fields.getTextInputValue('hp_quantity_input');
      const cost = parseShorthand(quantityString);

      if (isNaN(cost) || cost <= 0) {
        return interaction.reply({ content: '⚠️ Please provide a valid quantity of Heavenly Pounds to spend.', flags: [MessageFlags.Ephemeral] });
      }

      // Define how many resources you get for 10 HP
      const quantities = { gold: 50000, wood: 150000, food: 150000, stone: 112000 };
      const pricePerPackage = 10;

      // Calculate the proportional amount of resources
      const desiredResourceAmount = Math.floor((cost / pricePerPackage) * quantities[resource]);

      if (desiredResourceAmount < 1) {
        return interaction.reply({ content: '⚠️ The amount of Heavenly Pounds is too small to buy at least 1 unit of this resource.', flags: [MessageFlags.Ephemeral] });
      }

      const confirmationEmbed = new EmbedBuilder()
        .setTitle('🛒 Purchase Confirmation')
        .setDescription(`You are about to spend **${cost.toLocaleString('en-US')}** 💰 to receive **${desiredResourceAmount.toLocaleString('en-US')} ${resource}**.\n\nPlease confirm your purchase.`)
        .setColor('Orange');

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId(`confirm_buy_${resource}_${cost}_${desiredResourceAmount}`).setLabel('Confirm').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cancel_buy').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );

      await interaction.reply({
        embeds: [confirmationEmbed],
        components: [row],
        flags: [MessageFlags.Ephemeral],
      });
    }
  } else if (interaction.isButton()) { // Handle Button Clicks
    if (interaction.customId.startsWith('confirm_buy_')) {
      const [, , resource, costStr, resourceAmountStr] = interaction.customId.split('_');
      const cost = parseFloat(costStr);
      const resourceAmount = parseInt(resourceAmountStr, 10);

      db.get('SELECT balance FROM users WHERE id = ?', [interaction.user.id], (err, userRow) => {
        if ((userRow?.balance || 0) < cost) {
          return interaction.update({ content: `❌ Oops! You no longer have enough Heavenly Pounds.`, embeds: [], components: [] });
        }
        db.run(`UPDATE users SET balance = balance - ?, ${resource} = ${resource} + ? WHERE id = ?`, [cost, resourceAmount, interaction.user.id]);
        db.run('UPDATE server_stats SET pool_balance = pool_balance + ? WHERE id = ?', [cost, interaction.guildId]);
        interaction.update({ content: `✅ Success! You spent **${cost.toLocaleString('en-US')}** 💰 and received **${resourceAmount.toLocaleString('en-US')} ${resource}**!`, embeds: [], components: [] });
        logActivity('🛒 Shop Purchase', `<@${interaction.user.id}> bought **${resourceAmount.toLocaleString('en-US')} ${resource}** for **${cost.toLocaleString('en-US')}** Heavenly Pounds.`, 'Blue')
          .then(() => logPurchaseToSheet(interaction.user.username, resource, resourceAmount, cost));
      });
    } else if (interaction.customId === 'cancel_buy') {
      await interaction.update({ content: 'Purchase canceled.', embeds: [], components: [] });
    }
  }
});

// Web server to keep the bot alive on hosting platforms like Koyeb/Railway
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('Heavenly Pounds bot is alive!');
});

app.listen(port, () => console.log(`Health check server listening on port ${port}`));

client.login(process.env.DISCORD_TOKEN);