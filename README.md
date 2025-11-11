# Discord Ticket Bot

A comprehensive Discord bot for managing support tickets with interactive buttons, role notifications, and status tracking.

## Features

- **Interactive Button Panel** with CREATE TICKET, PRIZE JASA, and PRICE LOCK buttons
- **Automatic Ticket Creation** with unique ticket IDs and dedicated channels
- **Role-Based Notifications** - Automatically ping selected staff roles when tickets are created
- **Status Tracking** - Track tickets as open, in-progress, or closed
- **Ticket Management** - Staff can claim and close tickets with resolution notes
- **Logging System** - Keep track of all ticket activities in a designated log channel

## Setup Instructions

### 1. Initial Bot Setup

Run the following command in any channel where you have Administrator permissions:

```
!setup
```

This will create the interactive button panel with all three buttons.

### 2. Configure Ticket Category (Optional)

To organize tickets in a specific category:

```
!setcategory <category_id>
```

**How to get category ID:**
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click on a category
3. Click "Copy ID"

### 3. Configure Log Channel (Optional)

To set up a channel for ticket activity logs:

```
!setlog <channel_id>
```

**How to get channel ID:**
1. Enable Developer Mode in Discord
2. Right-click on a channel
3. Click "Copy ID"

### 4. Configure Staff Roles (Required for Role Selection)

To enable the role selection dropdown when creating tickets, you need to add staff roles:

```
!addrole @RoleName
```

Or using role ID:
```
!addrole <role_id>
```

**Managing Staff Roles:**
- Add a role: `!addrole @Support`
- Remove a role: `!removerole @Support`
- List configured roles: `!listroles`

**Note:** Users will be able to select from these configured roles when creating tickets.

### 5. Configure Button Channels (Optional)

Set which channels are displayed when users click the PRIZE JASA and PRICE LOCK buttons:

```
!setprizejasa <channel_id>
!setpricelock <channel_id>
```

When configured, clicking these buttons will direct users to the specified channels for information.

## How to Use

### For Users:

1. **Create a Ticket:**
   - Click the "CREATE TICKET" button
   - Fill out the modal form with:
     - Subject (brief description)
     - Description (detailed information)
     - Category (e.g., Technical Support, General, Billing)
   - Submit the form
   - Select which staff role should be notified from the dropdown menu
   - A new ticket channel will be created automatically and the selected role will be pinged

2. **PRIZE JASA Button:**
   - Click to get directed to the service prize information channel
   - Admin must configure the channel using `!setprizejasa <channel_id>`

3. **PRICE LOCK Button:**
   - Click to get directed to the price lock information channel
   - Admin must configure the channel using `!setpricelock <channel_id>`

### For Staff:

1. **Claim a Ticket:**
   - Click the "Claim Ticket" button in any ticket channel
   - This marks you as the assigned staff member
   - Changes ticket status to "in-progress"

2. **Close a Ticket:**
   - Click the "Close Ticket" button
   - Add resolution notes in the modal
   - The ticket channel will be deleted after 10 seconds

## Commands

### Admin Commands
- `!setup` - Send the ticket panel to the current channel
- `!setcategory <category_id>` - Set the category where tickets will be created
- `!setlog <channel_id>` - Set the log channel for ticket activities
- `!addrole <@role>` - Add a staff role to the ticket system (users can select this role when creating tickets)
- `!removerole <@role>` - Remove a staff role from the ticket system
- `!listroles` - List all configured staff roles
- `!setprizejasa <channel_id>` - Set the channel for PRIZE JASA button information
- `!setpricelock <channel_id>` - Set the channel for PRICE LOCK button information

**Note:** All commands require Administrator permissions.

## Ticket Lifecycle

1. **Open** - User creates a ticket, staff role is pinged
2. **In-Progress** - Staff member claims the ticket
3. **Closed** - Staff closes the ticket with resolution notes
4. **Deleted** - Channel is automatically deleted 10 seconds after closing

## File Structure

- `index.js` - Main bot code
- `config.json` - Bot configuration (category ID, log channel ID, staff roles)
- `tickets.json` - Active ticket data storage
- `package.json` - Node.js dependencies

## Important Notes

- Users who create tickets automatically get access to view and send messages in their ticket channel
- When a staff role is selected during ticket creation, that role is automatically given access to the ticket channel
- All ticket activities are logged to the designated log channel (if configured)
- Ticket data persists across bot restarts

## Permissions Required

The bot needs the following permissions:
- View Channels
- Send Messages
- Manage Channels (to create ticket channels)
- Manage Roles (to set channel permissions)
- Read Message History
- Embed Links
- Attach Files

## Support

For issues or questions about the bot, contact your server administrator.
