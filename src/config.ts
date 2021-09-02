import { config } from 'dotenv';
config();

export const PortConfig = Number(process.env.PORT) || 9000;

export const GMAuth = process.env.GM_AUTH as string;
export const DisableTask = process.env.DISABLE_TASK == 'true' || false;
export const DiscordHook = process.env.DISCORD_WEBHOOK as string;