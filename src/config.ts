import { config } from 'dotenv';
config();

export const PortConfig = Number(process.env.PORT) || 9000;