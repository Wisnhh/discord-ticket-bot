# Quick Start Guide

## Getting Your Bot Running in Discord

### Step 1: Get Your Bot Token
Your bot is already running in Replit with the token you provided. If you need to update it, you can add it to Secrets (🔒 icon in sidebar).

### Step 2: Invite the Bot to Your Server
Use this URL to invite your bot (replace `YOUR_CLIENT_ID` with your Application ID from Discord Developer Portal):

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot
```

**To get your Client ID:**
1. Go to https://discord.com/developers/applications
2. Click your application
3. Copy the "Application ID" from the General Information page

### Step 3: Initial Setup in Discord

Once the bot is in your server, run these commands in order:

1. **Add Staff Roles** (these will appear in the dropdown when users create tickets)
   ```
   !addrole @Support
   !addrole @Moderator
   !addrole @Admin
   ```

2. **Create the Ticket Panel** (in the channel where you want users to create tickets)
   ```
   !setup
   ```

3. **Optional: Set a Category** (to organize ticket channels)
   ```
   !setcategory CATEGORY_ID
   ```
   
4. **Optional: Set a Log Channel** (to track ticket activities)
   ```
   !setlog CHANNEL_ID
   ```

5. **Optional: Configure Button Channels** (set info channels for PRIZE JASA and PRICE LOCK)
   ```
   !setprizejasa CHANNEL_ID
   !setpricelock CHANNEL_ID
   ```

### Step 4: Test It Out!

1. Click the "CREATE TICKET" button
2. Fill out the form (Subject, Description, Category)
3. Select a staff role from the dropdown
4. A new ticket channel will be created and the selected role will be pinged!

## What Each Button Does

- **CREATE TICKET** - Opens a form to create a support ticket with role selection
- **PRIZE JASA** - Directs users to the configured service prize information channel
- **PRICE LOCK** - Directs users to the configured price lock information channel

## Managing Tickets

**For Staff:**
- Click "Claim Ticket" to assign yourself to a ticket
- Click "Close Ticket" to close and delete a ticket (after 10 seconds)

**Admin Commands:**
- `!addrole @role` - Add a staff role to the dropdown
- `!removerole @role` - Remove a staff role
- `!listroles` - See all configured staff roles
- `!setprizejasa <channel_id>` - Set PRIZE JASA info channel
- `!setpricelock <channel_id>` - Set PRICE LOCK info channel

## Need Help?

Check the full README.md for detailed documentation and troubleshooting.
