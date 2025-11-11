import 'dotenv/config';
import { Collection } from 'discord.js';
import type { SciOlyCommand } from './shared-command-utils';
declare module 'discord.js' {
    interface Client {
        commands: Collection<string, SciOlyCommand>;
    }
}
