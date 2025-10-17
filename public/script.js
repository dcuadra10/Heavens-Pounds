// Countdown
const launchDate = new Date("2026-03-27T00:00:00Z");

function updateCountdown() {
  const now = new Date();
  const diff = launchDate - now;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  document.getElementById("days").textContent = days;
  document.getElementById("hours").textContent = hours;
  document.getElementById("minutes").textContent = minutes;
  document.getElementById("seconds").textContent = seconds;
}

setInterval(updateCountdown, 1000);
updateCountdown();

// Get configuration from server
let botApiUrl = 'https://your-bot-name.koyeb.app/api/guild-info';

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    botApiUrl = config.botApiUrl;
  } catch (error) {
    console.warn('Failed to load config, using default URL:', error);
  }
}

// Fetch real-time data from Discord bot API
async function fetchServerStats() {
  try {
    
    const response = await fetch(botApiUrl);
    const data = await response.json();
    
    if (response.ok) {
      // Update member count
      document.getElementById("member-count").textContent = `👥 ${data.totalMembers} Members`;
      
      // Update server info
      document.getElementById("server-name").textContent = `🌠 ${data.serverName}`;
      document.getElementById("server-online-count").textContent = `🟢 ${data.onlineMembers}`;
      document.getElementById("server-status").textContent = data.status === 'Online' ? '✅ Online' : '❌ Offline';
      document.getElementById("server-notes").textContent = `📝 ${data.notes}`;
    } else {
      // Fallback to static data if API fails
      setStaticInfo();
    }
  } catch (error) {
    console.error('Failed to fetch server stats:', error);
    // Fallback to static data
    setStaticInfo();
  }
}

// Set static info as fallback
function setStaticInfo() {
  // "Registered" y "Online"
  document.getElementById("member-count").textContent = "👥 230 Members";  
  
  // "Server Name", "Status" y "Notes"
  document.getElementById("server-name").textContent = "🌠 Heavens of Glory || March 27";
  document.getElementById("server-online-count").textContent = "🟢 67";
  document.getElementById("server-status").textContent = "✅ Online";
  document.getElementById("server-notes").textContent = "📝 TBA";
}

// Load configuration and fetch stats on page load
async function initialize() {
  await loadConfig();
  fetchServerStats();
  setInterval(fetchServerStats, 30000);
}

// Initialize when page loads
initialize();
