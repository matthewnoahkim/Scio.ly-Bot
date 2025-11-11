import { Collection } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { SciOlyCommand } from '../src/shared-command-utils';

type InteractionCreateModule = typeof import('../src/events/interactionCreate');
type InteractionCreateHandler = InteractionCreateModule['default'];
type InteractionParam = Parameters<InteractionCreateHandler['execute']>[0];

let interactionCreate: InteractionCreateHandler;

beforeEach(async () => {
	vi.resetModules();
	const module: InteractionCreateModule = await import('../src/events/interactionCreate');
	interactionCreate = module.default;
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function createMockInteraction(command: SciOlyCommand, userId = 'user-123'): {
	interaction: InteractionParam;
	replyMock: Mock<[], Promise<void>>;
} {
	const reply: Mock<[], Promise<void>> = vi.fn(() => Promise.resolve());
	const followUp: Mock<[], Promise<void>> = vi.fn(() => Promise.resolve());
	const commands = new Collection<string, SciOlyCommand>();
	commands.set('test', command);

	const interaction = {
		isChatInputCommand: () => true,
		commandName: 'test',
		user: { id: userId },
		member: { user: { id: userId } },
		client: { commands },
		reply,
		followUp,
		replied: false,
		deferred: false,
	} as unknown as InteractionParam;

	return {
		interaction,
		replyMock: reply,
	} satisfies {
		interaction: InteractionParam;
		replyMock: Mock<[], Promise<void>>;
	};
}

function expectRateLimitMessage(mock: Mock<[], Promise<void>>) {
	expect(mock).toHaveBeenCalled();
	const calls = mock.mock.calls as Array<[content: { content: string }]>;
	const lastCall = calls.at(-1);
	expect(lastCall).toBeDefined();
	const [payload] = lastCall ?? [{ content: '' }];
	expect(payload.content).toContain('You\'re sending commands too quickly.');
}

describe('interactionCreate event rate limiting', () => {
	it('limits rapid repeated invocations per user', async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		const command = { data: { name: 'test' }, execute } as unknown as SciOlyCommand;

		const { interaction, replyMock } = createMockInteraction(command);

		await interactionCreate.execute(interaction);
		expect(execute).toHaveBeenCalledOnce();

		await interactionCreate.execute(interaction);

		expect(execute).toHaveBeenCalledTimes(1);
		expectRateLimitMessage(replyMock);
	});

	it('allows commands again after the cooldown period', async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		const command = { data: { name: 'test' }, execute } as unknown as SciOlyCommand;
		const userId = 'user-cooldown';

		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

		const { interaction: firstInteraction } = createMockInteraction(command, userId);
		await interactionCreate.execute(firstInteraction);
		expect(execute).toHaveBeenCalledTimes(1);

		const { interaction: secondInteraction, replyMock: secondReply } = createMockInteraction(command, userId);
		await interactionCreate.execute(secondInteraction);
		expect(execute).toHaveBeenCalledTimes(1);
		expectRateLimitMessage(secondReply);

		vi.advanceTimersByTime(2_100);

		const { interaction: thirdInteraction, replyMock: thirdReply } = createMockInteraction(command, userId);
		await interactionCreate.execute(thirdInteraction);

		expect(execute).toHaveBeenCalledTimes(2);
		expect(thirdReply).not.toHaveBeenCalled();
	});
});

