const express = require('express');
const { Client, GatewayIntentBits } = require("discord.js");
const path = require('path');
require("dotenv").config();

const app = express();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Discord Bot Singleton Setup ---
// This ensures we only have one instance of the client and one login process.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// This promise will resolve once the bot is ready.
// We create it once and reuse it for all API calls.
let botReadyPromise = null;

function ensureBotReady() {
  if (!botReadyPromise) {
    console.log('[ensureBotReady] Bot not ready. Initializing promise...');
    botReadyPromise = new Promise((resolve, reject) => {
      // If the bot is already ready, resolve immediately.
      if (client.isReady()) {
        console.log('[ensureBotReady] Bot was already ready.');
        return resolve();
      }
      client.once("ready", () => {
        console.log(`Bot logged in as ${client.user.tag} and ready to serve API requests.`);
        resolve();
      });
      console.log('[ensureBotReady] Logging in to Discord...');
      client.login(process.env.DISCORD_TOKEN).catch(reject);
    });
  }
  return botReadyPromise;
}

// --- Configuration Endpoint ---
// Serve configuration to frontend
app.get('/api/config', (req, res) => {
  res.json({
    botApiUrl: process.env.BOT_API_URL || 'https://your-bot-name.koyeb.app/api/guild-info'
  });
});

// --- API Endpoint ---
// A single endpoint to get all guild info at once.
app.get('/api/guild-info', async (req, res) => {
  try {
    console.log('[API /guild-info] Request received. Ensuring bot is ready...');
    await ensureBotReady();
    console.log('[API /guild-info] Bot is ready. Fetching guild...');
    const guild = await client.guilds.fetch(process.env.GUILD_ID);

    // Fetch all members to count online status. This is an expensive operation.
    console.log('[API /guild-info] Fetching all members for online count...');
    const members = await guild.members.fetch();
    const onlineCount = members.filter(m => !m.user.bot && ['online', 'dnd', 'idle'].includes(m.presence?.status)).size;

    const totalMembers = guild.memberCount;
    console.log(`[API /guild-info] Found ${totalMembers} total members and ${onlineCount} online members.`);

    res.json({
      serverName: guild.name,
      status: "Online",
      totalMembers: totalMembers,
      onlineMembers: onlineCount,
      notes: `Serving ${totalMembers} members.`
    });
  } catch (error) {
    console.error("[API /guild-info] Error:", error.message);
    res.status(500).json({ error: "Failed to fetch guild info", details: error.message });
  }
});

// Export the app for Vercel
module.exports = app;
