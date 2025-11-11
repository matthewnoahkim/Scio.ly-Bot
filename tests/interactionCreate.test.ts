import { Collection } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import interactionCreate from '../src/events/interactionCreate';
import type { SciOlyCommand } from '../src/shared-command-utils';

function createMockInteraction(command: SciOlyCommand) {
	const reply = vi.fn().mockResolvedValue(undefined);
	const followUp = vi.fn().mockResolvedValue(undefined);
	const commands = new Collection<string, SciOlyCommand>();
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
	} as unknown as Parameters<typeof interactionCreate.execute>[0];

	return { interaction, replyMock: reply };
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
		expect(replyMock).toHaveBeenCalled();
		const lastCall = replyMock.mock.calls.at(-1) as [{ content: string }] | undefined;
		expect(lastCall).toBeDefined();
		const [replyPayload] = lastCall ?? [{ content: '' }];
		expect(replyPayload.content).toContain('You\'re sending commands too quickly.');
	});
});

