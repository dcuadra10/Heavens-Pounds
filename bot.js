const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Events, MessageFlags } = require('discord.js');
const { pool: db, initializeDatabase } = require('./database');
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
    await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [inviterId]);
    await db.query('UPDATE users SET balance = balance + 20 WHERE id = $1', [inviterId]);
    await db.query('INSERT INTO invites (user_id, invites) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET invites = invites.invites + 1', [inviterId]);
    logActivity('💌 Invite Reward', `<@${inviterId}> received **20** Heavenly Pounds for inviting ${member.user.tag}.`, 'Green');
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [message.author.id]);

  // Increment total message count
  const { rows } = await db.query(`
      INSERT INTO message_counts (user_id, count, rewarded_messages) 
      VALUES ($1, 1, 0) 
      ON CONFLICT (user_id) 
      DO UPDATE SET count = message_counts.count + 1
      RETURNING count, rewarded_messages
  `, [message.author.id]);

  const { count, rewarded_messages } = rows[0];
  const unrewardedCount = count - rewarded_messages;
  
  if (unrewardedCount >= 100) {
      const rewardsToGive = Math.floor(unrewardedCount / 100);
      const totalReward = rewardsToGive * 5;
      await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalReward, message.author.id]);
      await db.query('UPDATE message_counts SET rewarded_messages = rewarded_messages + $1 WHERE user_id = $2', [rewardsToGive * 100, message.author.id]);
      logActivity('💬 Message Reward', `<@${message.author.id}> received **${totalReward}** Heavenly Pounds for sending ${rewardsToGive * 100} messages.`, 'Green');
  }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (member.user.bot) return;
  await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [member.id]);
  if (oldState.channelId && !newState.channelId) { // left
    const start = voiceTimes.get(member.id);
    if (start) {
      const minutesInSession = Math.floor((Date.now() - start) / 60000);
      voiceTimes.delete(member.id);

      if (minutesInSession > 0) {
        const { rows } = await db.query(`
          INSERT INTO voice_times (user_id, minutes, rewarded_minutes)
          VALUES ($1, $2, 0)
          ON CONFLICT (user_id)
          DO UPDATE SET minutes = voice_times.minutes + $2
          RETURNING minutes, rewarded_minutes
        `, [member.id, minutesInSession]);

        const { minutes, rewarded_minutes } = rows[0];
        const unrewardedMinutes = minutes - rewarded_minutes;

        if (unrewardedMinutes >= 60) {
          const rewardsToGive = Math.floor(unrewardedMinutes / 60);
          const totalReward = rewardsToGive * 5;
          await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [totalReward, member.id]);
          await db.query('UPDATE voice_times SET rewarded_minutes = rewarded_minutes + $1 WHERE user_id = $2', [rewardsToGive * 60, member.id]);
          logActivity('🎤 Voice Chat Reward', `<@${member.id}> received **${totalReward}** Heavenly Pounds for spending ${rewardsToGive * 60} minutes in voice chat.`, 'Green');
        }
      }
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

    const { rows } = await db.query('SELECT rewarded_boosts FROM server_stats WHERE id = $1', [guild.id]);
      const rewardedBoosts = rows[0]?.rewarded_boosts || 0;
      const newBoosts = currentBoosts - rewardedBoosts;

      if (newBoosts > 0) {
        const reward = newBoosts * 500;
        await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [newMember.id]);
        await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [reward, newMember.id]);
        
        // Update the user's personal boost count
        await db.query('INSERT INTO boosts (user_id, boosts) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET boosts = boosts.boosts + $2', [newMember.id, newBoosts]);
        
        // Update the total rewarded boosts for the server
        await db.query('INSERT INTO server_stats (id, rewarded_boosts) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET rewarded_boosts = $2', [guild.id, currentBoosts]);
        
        logActivity('🚀 Server Boost Reward', `<@${newMember.id}> received **${reward}** Heavenly Pounds for **${newBoosts}** new boost(s).`, 'Gold');
      }
  }
});

client.on('messageDelete', async (message) => {
  // Check if this is a giveaway message
  if (!message.embeds || message.embeds.length === 0) return;
  
  const embed = message.embeds[0];
  if (!embed.footer || !embed.footer.text || !embed.footer.text.startsWith('Giveaway ID:')) return;
  
  const giveawayId = embed.footer.text.replace('Giveaway ID: ', '');
  
  try {
    // Find the giveaway in database
    const { rows } = await db.query('SELECT * FROM giveaways WHERE id = $1 AND ended = FALSE', [giveawayId]);
    if (rows.length === 0) return;
    
    const giveaway = rows[0];
    
    // Cancel the giveaway
    await cancelGiveaway(giveawayId, 'Message deleted');
    
    logActivity('❌ Giveaway Cancelled', `Giveaway **${giveaway.prize}** was cancelled because the message was deleted.`, 'Red');
    
  } catch (error) {
    console.error('Error handling giveaway message deletion:', error);
  }
});

client.on('guildCreate', async (guild) => {
  console.log(`Joined a new guild: ${guild.name}`);
  try {
    // Initialize server pool with 100k
    await db.query('INSERT INTO server_stats (id, pool_balance) VALUES ($1, 100000) ON CONFLICT (id) DO NOTHING', [guild.id]);
    logActivity('🏦 Server Pool Initialized', `The bot joined a new server. The pool has been initialized with **100,000** 💰.`, 'Green');
  } catch (err) {
    console.error('Failed to initialize server pool on guild join:', err.message);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) { // Handle Slash Commands
    const { commandName } = interaction;
    await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [interaction.user.id]);

    if (commandName === 'balance') {
      // Defer the reply to prevent interaction timeout
      await interaction.deferReply(); 
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [interaction.user.id]);
      const row = rows[0];
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
      await interaction.editReply({ embeds: [embed] });
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
      await interaction.deferReply();
      const helpEmbed = new EmbedBuilder()
        .setTitle('❓ Heavenly Pounds Help')
        .setColor('Green')
        .addFields(
          {
            name: '💸 How to Earn Heavenly Pounds',
            value: '- **Invites**: Earn **20** 💰 for each person you invite.\n' +
                   '- **Messages**: Earn **5** 💰 for every 100 messages you send.\n' +
                   '- **Voice Chat**: Earn **5** 💰 for every hour you spend in a voice channel.\n' +
                   '- **Server Boosts**: Earn **500** 💰 for each time you boost the server.'
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
                   '`/give <user> <amount>`: Give currency to a user from the pool.\n' +
                   '`/take <user> <amount>`: Take currency from a user.\n' +
                   '`/giveaway <prize> <duration> <entry_cost> [winners]`: Create a paid giveaway.'
          },
          {
            name: '🎁 Giveaways',
            value: 'Giveaways allow users to pay Heavenly Pounds to participate and win prizes!\n' +
                   '- Entry costs are paid from your balance and added to the server pool\n' +
                   '- Winners receive the prize amount from the server pool\n' +
                   '- Only admins can create giveaways'
          },
        );
      await interaction.editReply({ embeds: [helpEmbed] });
    }  else if (commandName === 'daily') {
      await interaction.deferReply();
      const userId = interaction.user.id;
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

      try {
        const { rows } = await db.query('SELECT last_daily, daily_streak FROM users WHERE id = $1', [userId]);
        const row = rows[0];

        const lastDaily = row?.last_daily ? new Date(row.last_daily).toISOString().slice(0, 10) : null;
        let streak = row?.daily_streak || 0;

        if (lastDaily === todayStr) {
          // Calculate time until next claim (UTC midnight)
          const tomorrow = new Date(today);
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(0, 0, 0, 0);
          return await interaction.editReply({ content: `You have already claimed your daily reward today! Please come back <t:${Math.floor(tomorrow.getTime() / 1000)}:R>.` });
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

        await db.query('UPDATE users SET balance = balance + $1, last_daily = $2, daily_streak = $3 WHERE id = $4', [reward, todayStr, streak, userId]);

        const replyEmbed = new EmbedBuilder()
          .setTitle('🎉 Daily Reward Claimed! 🎉')
          .setDescription(`You have received **${reward}** 💰!\nYour current streak is **${streak}** day(s). Come back tomorrow to increase it!`)
          .setColor('Gold');
        await interaction.editReply({ embeds: [replyEmbed] });
        logActivity('🎁 Daily Reward', `<@${userId}> claimed their daily reward of **${reward}** 💰 (Streak: ${streak}).`, 'Aqua');
      } catch (err) {
        console.error(err);
          return await interaction.editReply({ content: '❌ An error occurred while processing your daily reward.' });
        }
    } else if (commandName === 'stats') {
      await interaction.deferReply();
      const targetUser = interaction.options.getUser('user');
      const adminIds = (process.env.ADMIN_IDS || '').split(',');
      const isUserAdmin = adminIds.includes(interaction.user.id);

      if (targetUser && targetUser.id !== interaction.user.id && !isUserAdmin) {
        return await interaction.editReply({ content: '🚫 You can only view your own stats. Only admins can view stats for other users.'});
      }
      const user = interaction.options.getUser('user') || interaction.user;

      const statsPromises = [
        db.query('SELECT invites FROM invites WHERE user_id = $1', [user.id]),
        db.query('SELECT boosts FROM boosts WHERE user_id = $1', [user.id]),
        db.query('SELECT count, rewarded_messages FROM message_counts WHERE user_id = $1', [user.id]),
        db.query('SELECT minutes, rewarded_minutes FROM voice_times WHERE user_id = $1', [user.id]),
      ];

      await Promise.all(statsPromises).then(async ([invitesRes, boostsRes, messagesRes, voiceMinutesRes]) => {
        const invites = invitesRes.rows[0]?.invites || 0;
        const boosts = boostsRes.rows[0]?.boosts || 0;
        const totalMessages = messagesRes.rows[0]?.count || 0;
        const rewardedMessages = messagesRes.rows[0]?.rewarded_messages || 0;
        const totalVoiceMinutes = voiceMinutesRes.rows[0]?.minutes || 0;
        const rewardedVoiceMinutes = voiceMinutesRes.rows[0]?.rewarded_minutes || 0;

        const messageProgress = ((totalMessages - rewardedMessages) % 100);
        const voiceProgress = ((totalVoiceMinutes - rewardedVoiceMinutes) % 60);

        const statsEmbed = new EmbedBuilder()
          .setTitle(`📈 Stats for ${user.username}`)
          .setThumbnail(user.displayAvatarURL())
          .setColor('Blue')
          .addFields(
            { name: '💌 Invites', value: `**${invites}** total`, inline: true },
            { name: '🚀 Server Boosts', value: `**${boosts}** total`, inline: true },
            { name: '💬 Lifetime Messages', value: `**${totalMessages.toLocaleString('en-US')}** sent\n(${messageProgress}/100 for next reward)` },
            { name: '🎤 Lifetime Voice Chat', value: `**${totalVoiceMinutes}** minutes\n(${voiceProgress}/60 for next reward)` }
          );
        await interaction.editReply({ embeds: [statsEmbed] });
      });

    } else if (commandName === 'leaderboard') {
    try {
      await interaction.deferReply();
      const { rows: allUsers } = await db.query('SELECT id, balance FROM users ORDER BY balance DESC');

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
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error(err);
        return await interaction.editReply({ content: '❌ An error occurred while fetching the leaderboard.' });
      }
    } else if (commandName === 'pool') {
    const adminIds = (process.env.ADMIN_IDS || '').split(',');
    if (!adminIds.includes(interaction.user.id)) {
      return interaction.reply('🚫 You do not have permission to use this command.');
    }
    // Defer the reply and make it ephemeral
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const { rows } = await db.query('SELECT pool_balance FROM server_stats WHERE id = $1', [interaction.guildId]);
      const poolBalance = rows[0]?.pool_balance || 0;
      const embed = new EmbedBuilder()
        .setTitle('🏦 Server Pool Balance')
        .setDescription(`The server pool currently holds **${poolBalance.toLocaleString('en-US')}** 💰.`)
        .setColor('Aqua');
      await interaction.editReply({ embeds: [embed] });
    } else if (commandName === 'give') {
      await interaction.deferReply({ ephemeral: true });
      const adminIds = (process.env.ADMIN_IDS || '').split(',');
      if (!adminIds.includes(interaction.user.id)) {
        return await interaction.editReply({ content: '🚫 You do not have permission to use this command.' });
      }

      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getNumber('amount');

      const { rows } = await db.query('SELECT pool_balance FROM server_stats WHERE id = $1', [interaction.guildId]);
      const poolBalance = rows[0]?.pool_balance || 0;

      if (amount > poolBalance) {
        return await interaction.editReply({ content: `❌ Not enough funds in the server pool! The pool only has **${poolBalance.toLocaleString('en-US')}** 💰.` });
      }

      await db.query('UPDATE server_stats SET pool_balance = pool_balance - $1 WHERE id = $2', [amount, interaction.guildId]);
      await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [targetUser.id]);
      await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, targetUser.id]);

      await interaction.editReply({ content: `✅ Successfully gave **${amount.toLocaleString('en-US')}** 💰 to ${targetUser}.` });
      logActivity('💸 Admin Give', `<@${interaction.user.id}> gave **${amount.toLocaleString('en-US')}** 💰 to ${targetUser}.`, 'Yellow');

    } else if (commandName === 'take') {
      await interaction.deferReply({ ephemeral: true });
      const adminIds = (process.env.ADMIN_IDS || '').split(',');
      if (!adminIds.includes(interaction.user.id)) {
        return await interaction.editReply({ content: '🚫 You do not have permission to use this command.' });
      }

      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getNumber('amount');

      await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [targetUser.id]);
      const { rows } = await db.query('SELECT balance FROM users WHERE id = $1', [targetUser.id]);
      const currentBalance = rows[0]?.balance || 0;
      const newBalance = Math.max(0, currentBalance - amount); // Ensure balance doesn't go negative
      const amountTaken = currentBalance - newBalance;

      await db.query('UPDATE server_stats SET pool_balance = pool_balance + $1 WHERE id = $2', [amountTaken, interaction.guildId]);
      await db.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, targetUser.id]);
      await interaction.editReply({ content: `✅ Successfully took **${amountTaken.toLocaleString('en-US')}** 💰 from ${targetUser}. Their new balance is **${newBalance.toLocaleString('en-US')}** 💰.` });
      logActivity('💸 Admin Take', `<@${interaction.user.id}> took **${amountTaken.toLocaleString('en-US')}** 💰 from ${targetUser}. The amount was added to the server pool.`, 'Orange');
    } else if (commandName === 'giveaway') {
      const adminIds = (process.env.ADMIN_IDS || '').split(',');
      if (!adminIds.includes(interaction.user.id)) {
        return interaction.reply('🚫 You do not have permission to use this command.');
      }

      const prize = interaction.options.getString('prize');
      const duration = interaction.options.getString('duration');
      const entryCost = interaction.options.getNumber('entry_cost');
      const winnerCount = interaction.options.getInteger('winners') || 1;

      const modal = new ModalBuilder()
        .setCustomId(`giveaway_modal_${Date.now()}`)
        .setTitle('Create Giveaway');

      const prizeInput = new TextInputBuilder()
        .setCustomId('giveaway_prize')
        .setLabel('Prize Description')
        .setPlaceholder('Enter the giveaway prize...')
        .setValue(prize)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const durationInput = new TextInputBuilder()
        .setCustomId('giveaway_duration')
        .setLabel('Duration (e.g., 1h, 30m, 2d)')
        .setPlaceholder('1h, 30m, 2d...')
        .setValue(duration)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const entryCostInput = new TextInputBuilder()
        .setCustomId('giveaway_entry_cost')
        .setLabel('Entry Cost (Heavenly Pounds)')
        .setPlaceholder('Enter the cost to participate...')
        .setValue(entryCost.toString())
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const winnersInput = new TextInputBuilder()
        .setCustomId('giveaway_winners')
        .setLabel('Number of Winners')
        .setPlaceholder('1')
        .setValue(winnerCount.toString())
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(prizeInput),
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(entryCostInput),
        new ActionRowBuilder().addComponents(winnersInput)
      );

      await interaction.showModal(modal);
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
          new ButtonBuilder().setCustomId('cancel_buy').setLabel('Cancel').setStyle(ButtonStyle.Danger),
        );

      await interaction.reply({
        embeds: [confirmationEmbed],
        components: [row],
        flags: [MessageFlags.Ephemeral],
      });
    } else if (interaction.customId.startsWith('giveaway_modal_')) {
      const prize = interaction.fields.getTextInputValue('giveaway_prize');
      const durationStr = interaction.fields.getTextInputValue('giveaway_duration');
      const entryCost = parseFloat(interaction.fields.getTextInputValue('giveaway_entry_cost'));
      const winnerCount = parseInt(interaction.fields.getTextInputValue('giveaway_winners'));

      if (isNaN(entryCost) || entryCost <= 0) {
        return interaction.reply({ content: '⚠️ Please provide a valid entry cost.', ephemeral: true });
      }

      if (isNaN(winnerCount) || winnerCount <= 0) {
        return interaction.reply({ content: '⚠️ Please provide a valid number of winners.', ephemeral: true });
      }

      const duration = parseDuration(durationStr);
      if (!duration) {
        return interaction.reply({ content: '⚠️ Please provide a valid duration (e.g., 1h, 30m, 2d).', ephemeral: true });
      }

      const endTime = Date.now() + duration;
      const giveawayId = `giveaway_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Check if server pool has enough funds
      const { rows } = await db.query('SELECT pool_balance FROM server_stats WHERE id = $1', [interaction.guildId]);
      const poolBalance = rows[0]?.pool_balance || 0;

      if (poolBalance < entryCost * winnerCount) {
        return interaction.reply({ 
          content: `❌ Not enough funds in server pool! Need **${(entryCost * winnerCount).toLocaleString('en-US')}** 💰 but pool only has **${poolBalance.toLocaleString('en-US')}** 💰.`, 
          ephemeral: true 
        });
      }

      // Deduct funds from pool
      await db.query('UPDATE server_stats SET pool_balance = pool_balance - $1 WHERE id = $2', [entryCost * winnerCount, interaction.guildId]);

      // Create giveaway embed
      const giveawayEmbed = new EmbedBuilder()
        .setTitle('🎉 Giveaway! 🎉')
        .setDescription(`**Prize:** ${prize}\n**Entry Cost:** ${entryCost.toLocaleString('en-US')} 💰\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>`)
        .setColor('Gold')
        .setFooter({ text: `Giveaway ID: ${giveawayId}` })
        .setTimestamp();

      const joinButton = new ButtonBuilder()
        .setCustomId(`join_giveaway_${giveawayId}`)
        .setLabel(`Join Giveaway (${entryCost.toLocaleString('en-US')} 💰)`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎁');

      const row = new ActionRowBuilder().addComponents(joinButton);

      await interaction.reply({ embeds: [giveawayEmbed], components: [row] });

      // Store giveaway in database
      await db.query(`
        INSERT INTO giveaways (id, guild_id, channel_id, message_id, prize, entry_cost, winner_count, end_time, creator_id, participants)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [giveawayId, interaction.guildId, interaction.channelId, null, prize, entryCost, winnerCount, new Date(endTime), interaction.user.id, []]);

      // Set timeout to end giveaway
      setTimeout(async () => {
        await endGiveaway(giveawayId);
      }, duration);

      logActivity('🎁 Giveaway Created', `<@${interaction.user.id}> created a giveaway: **${prize}** (${entryCost.toLocaleString('en-US')} 💰 entry, ${winnerCount} winner(s))`, 'Gold');
    }
  } else if (interaction.isButton()) { // Handle Button Clicks
    await interaction.deferUpdate(); // Acknowledge the button click immediately
    if (interaction.customId.startsWith('confirm_buy_')) {
      const [, , resource, costStr, resourceAmountStr] = interaction.customId.split('_');
      const cost = parseFloat(costStr);
      const resourceAmount = parseInt(resourceAmountStr, 10);

    const { rows: userRows } = await db.query('SELECT balance FROM users WHERE id = $1', [interaction.user.id]);
      if ((userRows[0]?.balance || 0) < cost) {
          return interaction.editReply({ content: `❌ Oops! You no longer have enough Heavenly Pounds.`, embeds: [], components: [] });
        }
      await db.query(`UPDATE users SET balance = balance - $1, ${resource} = ${resource} + $2 WHERE id = $3`, [cost, resourceAmount, interaction.user.id]);
      await db.query('UPDATE server_stats SET pool_balance = pool_balance + $1 WHERE id = $2', [cost, interaction.guildId]);
        await interaction.editReply({ content: `✅ Success! You spent **${cost.toLocaleString('en-US')}** 💰 and received **${resourceAmount.toLocaleString('en-US')} ${resource}**!`, embeds: [], components: [] });
        logActivity('🛒 Shop Purchase', `<@${interaction.user.id}> bought **${resourceAmount.toLocaleString('en-US')} ${resource}** for **${cost.toLocaleString('en-US')}** Heavenly Pounds.`, 'Blue')
          .then(() => logPurchaseToSheet(interaction.user.username, resource, resourceAmount, cost));
    } else if (interaction.customId === 'cancel_buy') {
      await interaction.editReply({ content: 'Purchase canceled.', embeds: [], components: [] });
    } else if (interaction.customId.startsWith('join_giveaway_')) {
      const giveawayId = interaction.customId.replace('join_giveaway_', '');
      
      try {
        // Get giveaway info
        const { rows } = await db.query('SELECT * FROM giveaways WHERE id = $1', [giveawayId]);
        if (rows.length === 0) {
          return interaction.editReply({ content: '❌ Giveaway not found or has ended.', embeds: [], components: [] });
        }

        const giveaway = rows[0];
        
        // Check if giveaway has ended
        if (new Date() > new Date(giveaway.end_time)) {
          return interaction.editReply({ content: '❌ This giveaway has already ended.', embeds: [], components: [] });
        }

        // Check if user already joined
        const participants = giveaway.participants || [];
        if (participants.includes(interaction.user.id)) {
          return interaction.editReply({ content: '❌ You have already joined this giveaway!', embeds: [], components: [] });
        }

        // Check if user has enough balance
        const { rows: userRows } = await db.query('SELECT balance FROM users WHERE id = $1', [interaction.user.id]);
        const userBalance = userRows[0]?.balance || 0;

        if (userBalance < giveaway.entry_cost) {
          return interaction.editReply({ 
            content: `❌ You need **${giveaway.entry_cost.toLocaleString('en-US')}** 💰 to join this giveaway. You only have **${userBalance.toLocaleString('en-US')}** 💰.`, 
            embeds: [], 
            components: [] 
          });
        }

        // Deduct entry cost from user and add to pool
        await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [giveaway.entry_cost, interaction.user.id]);
        await db.query('UPDATE server_stats SET pool_balance = pool_balance + $1 WHERE id = $2', [giveaway.entry_cost, interaction.guildId]);

        // Add user to participants
        participants.push(interaction.user.id);
        await db.query('UPDATE giveaways SET participants = $1 WHERE id = $2', [participants, giveawayId]);

        await interaction.editReply({ 
          content: `✅ You have successfully joined the giveaway! **${giveaway.entry_cost.toLocaleString('en-US')}** 💰 has been deducted from your balance.`, 
          embeds: [], 
          components: [] 
        });

        logActivity('🎁 Giveaway Joined', `<@${interaction.user.id}> joined giveaway **${giveaway.prize}** for **${giveaway.entry_cost.toLocaleString('en-US')}** 💰.`, 'Blue');

      } catch (error) {
        console.error('Error joining giveaway:', error);
        await interaction.editReply({ content: '❌ An error occurred while joining the giveaway.', embeds: [], components: [] });
      }
    }
  }
});

// Web server to keep the bot alive on hosting platforms like Koyeb/Railway
const app = express();
const port = process.env.PORT || 8080;

// Middleware to log incoming health check requests
app.use((req, res, next) => {
  console.log(`[${new Date().toUTCString()}] Received a ping to keep the bot alive.`);
  next();
});

app.get('/', (req, res) => {
  res.send('Heavenly Pounds bot is alive!');
});

app.listen(port, () => console.log(`Health check server listening on port ${port}`));

// --- Healthchecks.io Ping ---
function setupHealthchecksPing() {
  const healthcheckUrl = process.env.HEALTHCHECK_URL;
  if (!healthcheckUrl) {
    console.log('HEALTHCHECK_URL not found, skipping Healthchecks.io setup.');
    return;
  }

  console.log('Setting up ping to Healthchecks.io...');
  // Ping immediately on start and then every 50 seconds
  const ping = () => {
    fetch(healthcheckUrl)
      .then(res => {
        if (res.ok) {
          console.log(`[${new Date().toUTCString()}] Successfully pinged Healthchecks.io.`);
        } else {
          console.error(`[${new Date().toUTCString()}] Failed to ping Healthchecks.io. Status: ${res.status}`);
        }
      })
      .catch(err => console.error('Failed to ping Healthchecks.io:', err.message));
  };
  
  ping();
  setInterval(ping, 50 * 1000); // 50 seconds
}


// --- Giveaway Functions ---
async function cancelGiveaway(giveawayId, reason = 'Cancelled') {
  try {
    const { rows } = await db.query('SELECT * FROM giveaways WHERE id = $1 AND ended = FALSE', [giveawayId]);
    if (rows.length === 0) return;

    const giveaway = rows[0];
    const participants = giveaway.participants || [];

    // Refund all participants
    for (const participantId of participants) {
      await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [participantId]);
      await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [giveaway.entry_cost, participantId]);
    }

    // Return the original prize amount to pool (if no participants joined)
    if (participants.length === 0) {
      await db.query('UPDATE server_stats SET pool_balance = pool_balance + $1 WHERE id = $2', [giveaway.entry_cost * giveaway.winner_count, giveaway.guild_id]);
    }

    // Mark giveaway as ended
    await db.query('UPDATE giveaways SET ended = TRUE WHERE id = $1', [giveawayId]);

    // Send cancellation message to the channel
    try {
      const channel = await client.channels.fetch(giveaway.channel_id);
      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle('❌ Giveaway Cancelled')
          .setDescription(`**Prize:** ${giveaway.prize}\n**Reason:** ${reason}\n**Participants:** ${participants.length}\n\n${participants.length > 0 ? `All participants have been refunded **${giveaway.entry_cost.toLocaleString('en-US')}** 💰 each.` : 'No participants joined this giveaway.'}`)
          .setColor('Red')
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error sending giveaway cancellation message:', error);
    }

    logActivity('❌ Giveaway Cancelled', `Giveaway **${giveaway.prize}** was cancelled (${reason}). ${participants.length} participants refunded.`, 'Red');

  } catch (error) {
    console.error('Error cancelling giveaway:', error);
  }
}

async function endGiveaway(giveawayId) {
  try {
    const { rows } = await db.query('SELECT * FROM giveaways WHERE id = $1 AND ended = FALSE', [giveawayId]);
    if (rows.length === 0) return;

    const giveaway = rows[0];
    const participants = giveaway.participants || [];

    if (participants.length === 0) {
      // No participants, refund to pool
      await db.query('UPDATE server_stats SET pool_balance = pool_balance + $1 WHERE id = $2', [giveaway.entry_cost * giveaway.winner_count, giveaway.guild_id]);
      await db.query('UPDATE giveaways SET ended = TRUE WHERE id = $1', [giveawayId]);
      
      const channel = await client.channels.fetch(giveaway.channel_id);
      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 Giveaway Ended')
          .setDescription(`**Prize:** ${giveaway.prize}\n**Result:** No participants joined this giveaway.\n**Refund:** ${(giveaway.entry_cost * giveaway.winner_count).toLocaleString('en-US')} 💰 returned to server pool.`)
          .setColor('Red')
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      }
      return;
    }

    // Select winners
    const shuffled = participants.sort(() => 0.5 - Math.random());
    const winners = shuffled.slice(0, Math.min(giveaway.winner_count, participants.length));

    // Give rewards to winners
    for (const winnerId of winners) {
      await db.query('INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [winnerId]);
      await db.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [giveaway.entry_cost, winnerId]);
    }

    // Update giveaway as ended
    await db.query('UPDATE giveaways SET ended = TRUE, winners = $1 WHERE id = $2', [winners, giveawayId]);

    // Send result message
    const channel = await client.channels.fetch(giveaway.channel_id);
    if (channel) {
      const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
      const embed = new EmbedBuilder()
        .setTitle('🎉 Giveaway Ended! 🎉')
        .setDescription(`**Prize:** ${giveaway.prize}\n**Entry Cost:** ${giveaway.entry_cost.toLocaleString('en-US')} 💰\n**Participants:** ${participants.length}\n**Winner(s):** ${winnerMentions}\n\nEach winner received **${giveaway.entry_cost.toLocaleString('en-US')}** 💰!`)
        .setColor('Gold')
        .setTimestamp();
      await channel.send({ embeds: [embed] });
    }

    logActivity('🎁 Giveaway Ended', `Giveaway **${giveaway.prize}** ended with ${participants.length} participants. Winners: ${winners.join(', ')}`, 'Gold');

  } catch (error) {
    console.error('Error ending giveaway:', error);
  }
}

async function startBot() {
  try {
    // Ensure the database is initialized before logging in
    await initializeDatabase();

    // Log in to Discord
    await client.login(process.env.DISCORD_TOKEN);

    // Set up the keep-alive ping if configured
    setupHealthchecksPing();
  } catch (error) {
    console.error('Failed to start the bot:', error);
    process.exit(1);
  }
}

startBot();