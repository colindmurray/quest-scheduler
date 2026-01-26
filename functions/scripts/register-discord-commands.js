const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");

const args = process.argv.slice(2);
let guildId = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--guild") {
    guildId = args[i + 1] || null;
  }
  if (args[i] === "--global") {
    guildId = null;
  }
}

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !botToken) {
  console.error("Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN environment variables.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(botToken);

const commands = [
  {
    name: "link-group",
    description: "Link this channel to a Quest Scheduler group",
    default_member_permissions: "16",
    options: [
      {
        type: 3,
        name: "code",
        description: "Link code from Quest Scheduler",
        required: true,
      },
    ],
  },
  {
    name: "unlink-group",
    description: "Unlink this channel from a Quest Scheduler group",
    default_member_permissions: "16",
  },
];

async function registerCommands() {
  const route = guildId
    ? Routes.applicationGuildCommands(applicationId, guildId)
    : Routes.applicationCommands(applicationId);

  await rest.put(route, { body: commands });
  console.log(
    guildId
      ? `Registered guild commands for ${guildId}.`
      : "Registered global commands."
  );
}

registerCommands().catch((err) => {
  console.error("Failed to register commands", err);
  process.exit(1);
});
