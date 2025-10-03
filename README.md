# Heavenly Pounds Bot

A Discord bot for managing a virtual currency called "Heavenly Pounds", with a shop system for exchanging the currency for in-game resources.

## Features

- **Currency System**: Earn Heavenly Pounds through invites (80), messages (20 per 100), voice chat (20 per hour), and boosts (1,000 per boost).
- **Shop**: Exchange Heavenly Pounds for gold, wood, food, or stone.
- **Admin Commands**: Admins can manage the server pool and run giveaways.
- **Database Persistence**: Uses SQLite to track user balances and resource inventories.

## Setup

1. Create a Discord bot at https://discord.com/developers/applications
2. Copy the Application ID (Client ID) and Bot Token.
3. Create a `.env` file and add your `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_IDS`, `LOG_CHANNEL_ID`, and `GIVEAWAY_PING_ROLE_ID`.
4. Install dependencies: `npm install discord.js pg express google-spreadsheet google-auth-library dotenv`
5. Deploy commands: `node deploy-commands.js`
6. Run the bot: `npm start`

## Database and Admin Management

Uses SQLite for persistence. Tables are created automatically.

### Adding Admins
To grant admin privileges for commands like `/give`, add their Discord User IDs to your `.env` file.

1.  Open your `.env` file.
2.  Add or update the `ADMIN_IDS` variable. Separate multiple IDs with a comma (no spaces).
    `ADMIN_IDS=your_discord_id,another_admin_id`

### Google Sheets Integration (for logging purchases)

To automatically log all resource purchases to a Google Sheet, follow these steps:

1.  **Create a Google Sheet**: Go to sheets.google.com and create a new spreadsheet.
2.  **Set up a Google Cloud Service Account**:
    *   Go to the Google Cloud Console and create a new project.
    *   Enable the "Google Drive API" and "Google Sheets API" for your project.
    *   Go to "Credentials", click "Create Credentials", and select "Service account".
    *   Give it a name (e.g., "sheets-bot"), grant it the "Editor" role, and finish.
    *   Go to the "Keys" tab for your new service account, click "Add Key", "Create new key", select "JSON", and create it. A JSON file will be downloaded.
3.  **Share the Sheet**: Open your Google Sheet and share it with the `client_email` found in the JSON file you just downloaded. Give it "Editor" permissions.
4.  **Update your `.env` file**:
    *   Copy the ID of your Google Sheet from its URL (`.../spreadsheets/d/THIS_IS_THE_ID/edit...`).
    *   Open the downloaded JSON file and copy the `client_email` and `private_key`.
    *   Add these three variables to your `.env` file:
        `GOOGLE_SHEET_ID=the_id_you_copied`
        `GOOGLE_SERVICE_ACCOUNT_EMAIL=the_email_from_the_json`
        `GOOGLE_PRIVATE_KEY="the_private_key_from_the_json"` (Make sure to wrap the key in quotes).

## Commands

- `/balance`: View your balance and inventory.
- `/shop`: View shop prices.
- `/buy <resource>`: Purchase resources from the shop.
- `/daily`: Claim your daily reward with a streak bonus.
- `/stats [user]`: Check your contribution stats.
- `/leaderboard`: Shows the top 10 users and your rank.
- `/help`: Shows how to earn currency and lists all commands.

## 24/7 Deployment (Free Options)

### Option 1: Railway or Koyeb (Recommended)

Railway is the easiest way to get your bot running 24/7 for free.

1.  **Push your code to a GitHub repository.**
2.  **Sign up at [railway.app](https://railway.app)** using your GitHub account.
3.  Click "New Project" and select "Deploy from GitHub repo".
4.  Choose your bot's repository.
5.  Go to the "Variables" tab in your Railway project and add your environment variables (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `ADMIN_IDS`).
6.  Railway will automatically deploy and run your bot. It's that simple!

**Koyeb (Alternative):**

Koyeb is another excellent, easy-to-use platform with a free tier that doesn't require a credit card.

1.  **Push your code to a GitHub repository.**
2.  **Sign up at koyeb.com** using your GitHub account.
3.  Click "Create App", select GitHub, and choose your bot's repository.
4.  In the "Environment variables" section, add your secrets (`DISCORD_TOKEN`, etc.).
5.  Click "Deploy". Koyeb will build and run your bot continuously.
6.  **Crucial Step for Database**: Go to your Service settings, find the **Volumes** section, and create a new volume with the path set to `/data`. Then, go back to **Environment variables** and add a new variable `DB_PATH` with the value `/data/database.db`. This ensures your database is not deleted on restarts.

### Option 2: AWS (Amazon Web Services) Free Tier

This is a robust way to host your bot 24/7 for free for the first 12 months.

1.  **Create an AWS Account**: Sign up at aws.amazon.com. You will need a credit card for verification, but you won't be charged if you stay within the Free Tier limits.
2.  **Launch an EC2 Instance**:
    *   Go to the EC2 Dashboard and click "Launch instance".
    *   **AMI**: Select "Ubuntu" (make sure it says "Free tier eligible").
    *   **Instance Type**: Choose `t2.micro` (also "Free tier eligible").
    *   **Key Pair**: Create a new key pair. Give it a name and download the `.pem` file. **Store this file securely! You need it to connect.**
3.  **Connect to your Instance**:
    *   Open a terminal (like PowerShell, Command Prompt, or Terminal on Mac/Linux).
    *   Navigate to where you saved your `.pem` file.
    *   Run `ssh -i your-key-name.pem ubuntu@<Your-EC2-Public-IP>`. You can find the Public IP on your EC2 dashboard.
4.  **Install Dependencies on the Server**:
    *   Update packages: `sudo apt update && sudo apt upgrade -y`
    *   Install Node.js (using nvm is recommended):
        ```bash
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
        source ~/.bashrc
        nvm install 16
        ```
    *   Install Git: `sudo apt install git -y`
5.  **Deploy Your Code**:
    *   Clone your code from GitHub: `git clone https://github.com/your-username/your-repo.git`
    *   Navigate into the project folder: `cd your-repo-name`
    *   Install dependencies: `npm install`
    *   Create the environment file: `nano .env` and paste your variables. Press `Ctrl+X`, then `Y`, then `Enter` to save.
    *   Deploy the slash commands: `node deploy-commands.js`
6.  **Run the Bot 24/7 with PM2**:
    *   Install PM2: `npm install pm2 -g`
    *   Start your bot: `pm2 start bot.js --name "heavenly-pounds-bot"`
    *   To make sure it restarts automatically if the server reboots: `pm2 startup` (follow the on-screen instructions) and then `pm2 save`.

### Vercel (Not Recommended)

Vercel is designed for websites and serverless functions, not for applications like a Discord bot that need to run continuously. If you deploy on Vercel, your bot will go offline after a few minutes. **Use Railway or AWS instead.**