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
	const calls = mock.mock.calls as unknown as Array<[{ content: string }]>;
	const lastCall = calls.at(-1);
	expect(lastCall).toBeDefined();
	const [payload] = lastCall ?? [{ content: '' }];
	expect(payload.content).toContain('You\'re sending commands too quickly.');
}

function extractWaitTime(mock: Mock<[], Promise<void>>): number {
	const calls = mock.mock.calls as unknown as Array<[{ content: string }]>;
	const lastCall = calls.at(-1);
	if (!lastCall) return 0;
	const [payload] = lastCall;
	const match = payload.content.match(/wait (\d+) second/);
	return match ? Number.parseInt(match[1] || '0', 10) : 0;
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

	it('allows commands again after the rate limit window expires', async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		const command = { data: { name: 'test' }, execute } as unknown as SciOlyCommand;
		const userId = 'user-window';

		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

		const { interaction: firstInteraction } = createMockInteraction(command, userId);
		await interactionCreate.execute(firstInteraction);
		expect(execute).toHaveBeenCalledTimes(1);

		// Advance time past the window (1000ms) but before cooldown (2000ms)
		vi.advanceTimersByTime(1_100);

		const { interaction: secondInteraction, replyMock: secondReply } = createMockInteraction(command, userId);
		await interactionCreate.execute(secondInteraction);

		// Should be allowed because the window expired (old timestamp filtered out)
		expect(execute).toHaveBeenCalledTimes(2);
		expect(secondReply).not.toHaveBeenCalled();
	});

	describe('exponential backoff', () => {
		it('applies exponential backoff on repeated violations', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			const command = { data: { name: 'test' }, execute } as unknown as SciOlyCommand;
			const userId = 'user-exponential';

			vi.useFakeTimers();
			vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

			// First violation: should be 2 seconds (base)
			const { interaction: firstInteraction } = createMockInteraction(command, userId);
			await interactionCreate.execute(firstInteraction);
			expect(execute).toHaveBeenCalledTimes(1);

			const { interaction: secondInteraction, replyMock: secondReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(secondInteraction);
			expect(execute).toHaveBeenCalledTimes(1);
			expectRateLimitMessage(secondReply);
			expect(extractWaitTime(secondReply)).toBe(2); // 2^0 * 2000ms = 2 seconds

			// Wait for first block to expire
			vi.advanceTimersByTime(2_100);

			// Second violation: should be 4 seconds (2^1 * base)
			const { interaction: thirdInteraction, replyMock: thirdReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(thirdInteraction);
			expect(execute).toHaveBeenCalledTimes(2);

			const { interaction: fourthInteraction, replyMock: fourthReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(fourthInteraction);
			expect(execute).toHaveBeenCalledTimes(2);
			expectRateLimitMessage(fourthReply);
			expect(extractWaitTime(fourthReply)).toBe(4); // 2^1 * 2000ms = 4 seconds

			// Wait for second block to expire
			vi.advanceTimersByTime(4_100);

			// Third violation: should be 8 seconds (2^2 * base)
			const { interaction: fifthInteraction, replyMock: fifthReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(fifthInteraction);
			expect(execute).toHaveBeenCalledTimes(3);

			const { interaction: sixthInteraction, replyMock: sixthReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(sixthInteraction);
			expect(execute).toHaveBeenCalledTimes(3);
			expectRateLimitMessage(sixthReply);
			expect(extractWaitTime(sixthReply)).toBe(8); // 2^2 * 2000ms = 8 seconds
		});

		it('caps exponential backoff at maximum duration', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			const command = { data: { name: 'test' }, execute } as unknown as SciOlyCommand;
			const userId = 'user-max-cap';

			vi.useFakeTimers();
			vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

			// Trigger multiple violations to reach the max cap (60 seconds)
			// We need to trigger violations quickly to avoid the 60s reset period
			for (let i = 0; i < 5; i++) {
				const { interaction } = createMockInteraction(command, userId);
				await interactionCreate.execute(interaction);
				expect(execute).toHaveBeenCalledTimes(i + 1);

				// Trigger violation
				const { interaction: violationInteraction, replyMock: violationReply } = createMockInteraction(
					command,
					userId,
				);
				await interactionCreate.execute(violationInteraction);
				expect(execute).toHaveBeenCalledTimes(i + 1);
				expectRateLimitMessage(violationReply);

				// Wait for block to expire, but advance time minimally to avoid reset
				const waitTime = extractWaitTime(violationReply);
				vi.advanceTimersByTime(waitTime * 1000 + 100);
			}

			// After 5 violations, violationCount = 5, so 2^5 * 2000ms = 64s, but max is 60s
			// Make one more successful call (6th call)
			const { interaction: finalCall } = createMockInteraction(command, userId);
			await interactionCreate.execute(finalCall);
			expect(execute).toHaveBeenCalledTimes(6); // 5 from loop + 1 more successful call

			// Trigger 6th violation - should be capped at 60 seconds
			// This happens quickly after the last violation, so reset period hasn't passed
			const { interaction: triggerViolation, replyMock: triggerReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(triggerViolation);
			expect(execute).toHaveBeenCalledTimes(6); // Still 6 because violation was blocked
			expectRateLimitMessage(triggerReply);
			const waitTime = extractWaitTime(triggerReply);
			// After 5 violations, violationCount = 5, so 2^5 * 2000ms = 64s, but max is 60s
			expect(waitTime).toBe(60); // Capped at 60 seconds
		});

		it('resets violation count after grace period', async () => {
			const execute = vi.fn().mockResolvedValue(undefined);
			const command = { data: { name: 'test' }, execute } as unknown as SciOlyCommand;
			const userId = 'user-reset';

			vi.useFakeTimers();
			vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

			// First violation: 2 seconds
			const { interaction: firstInteraction } = createMockInteraction(command, userId);
			await interactionCreate.execute(firstInteraction);
			expect(execute).toHaveBeenCalledTimes(1);

			const { interaction: secondInteraction, replyMock: secondReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(secondInteraction);
			expect(execute).toHaveBeenCalledTimes(1);
			expect(extractWaitTime(secondReply)).toBe(2);

			// Wait for block to expire
			vi.advanceTimersByTime(2_100);

			// Advance time past violation reset period (60 seconds)
			vi.advanceTimersByTime(61_000);

			// Next violation should reset to base duration (2 seconds)
			const { interaction: thirdInteraction } = createMockInteraction(command, userId);
			await interactionCreate.execute(thirdInteraction);
			expect(execute).toHaveBeenCalledTimes(2);

			const { interaction: fourthInteraction, replyMock: fourthReply } = createMockInteraction(command, userId);
			await interactionCreate.execute(fourthInteraction);
			expect(execute).toHaveBeenCalledTimes(2);
			expect(extractWaitTime(fourthReply)).toBe(2); // Reset to base duration
		});
	});
});

