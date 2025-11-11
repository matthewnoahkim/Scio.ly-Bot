"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const vitest_1 = require("vitest");
const interactionCreate_1 = __importDefault(require("../src/events/interactionCreate"));
function createMockInteraction(command) {
    const reply = vitest_1.vi.fn().mockResolvedValue(undefined);
    const followUp = vitest_1.vi.fn().mockResolvedValue(undefined);
    const commands = new discord_js_1.Collection();
    commands.set('test', command);
    const interaction = {
        isChatInputCommand: () => true,
        commandName: 'test',
        user: { id: 'user-123' },
        member: { user: { id: 'user-123' } },
        client: { commands },
        reply,
        followUp,
        replied: false,
        deferred: false,
    };
    return { interaction, replyMock: reply };
}
(0, vitest_1.describe)('interactionCreate event rate limiting', () => {
    (0, vitest_1.it)('limits rapid repeated invocations per user', async () => {
        const execute = vitest_1.vi.fn().mockResolvedValue(undefined);
        const command = { data: { name: 'test' }, execute };
        const { interaction, replyMock } = createMockInteraction(command);
        await interactionCreate_1.default.execute(interaction);
        (0, vitest_1.expect)(execute).toHaveBeenCalledOnce();
        await interactionCreate_1.default.execute(interaction);
        (0, vitest_1.expect)(execute).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(replyMock).toHaveBeenCalled();
        const lastCall = replyMock.mock.calls.at(-1);
        (0, vitest_1.expect)(lastCall).toBeDefined();
        const [replyPayload] = lastCall ?? [{ content: '' }];
        (0, vitest_1.expect)(replyPayload.content).toContain('You\'re sending commands too quickly.');
    });
});
//# sourceMappingURL=interactionCreate.test.js.map