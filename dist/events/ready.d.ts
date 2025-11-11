import { ActivityType, Events } from 'discord.js';
declare const _default: {
    name: Events;
    once: boolean;
    execute(client: {
        user: {
            tag: string;
            setPresence: (presence: {
                activities: Array<{
                    name: string;
                    type: ActivityType;
                }>;
                status: "online" | "idle" | "dnd" | "invisible";
            }) => void;
        };
        guilds: {
            cache: {
                size: number;
            };
        };
    }): void;
};
export default _default;
