import type { ChatInputCommandInteraction } from 'discord.js';
import { randArrItem } from 'e';
import { cancelTask } from '../../../lib/settings/settings';
import type { NexTaskOptions, RaidsOptions } from '../../../lib/types/minions';
import { handleMahojiConfirmation } from '../../../lib/util/handleMahojiConfirmation';
import { getActivityOfUser } from '../../../lib/util/minionIsBusy';

export async function cancelTaskCommand(user: MUser, interaction?: ChatInputCommandInteraction): Promise<string> {
	const currentTask = getActivityOfUser(user.id);

	const mName = user.minionName;

	if (!currentTask) {
		return `${mName} isn't doing anything at the moment, so there's nothing to cancel.`;
	}

	if (currentTask.type === 'MonkeyRumble') {
		return `${mName} can't leave the Monkey Rumble arena?`;
	}

	if (currentTask.type === 'Inferno') {
		return `${mName} is in the Inferno, they can't leave now!`;
	}

	if (currentTask.type === 'GroupMonsterKilling') {
		return `${mName} is in a group PVM trip, their team wouldn't like it if they left!`;
	}

	if (currentTask.type === 'Nex') {
		const data = currentTask as NexTaskOptions;
		if (data.users.length > 1) {
			return `${mName} is fighting Nex with a team, they can't abandon the trip!`;
		}
	}

	if (currentTask.type === 'Raids' || currentTask.type === 'TheatreOfBlood') {
		const data = currentTask as RaidsOptions;
		if (data.users.length > 1) {
			return `${mName} is currently doing a raid, they cannot leave their team!`;
		}
	}

	if (currentTask.type === 'Mortimer') {
		return randArrItem([
			"Run all you want; you're still trapped in my illusion.",
			"You think you can flee? I'm the maze you can't escape.",
			"Escape is futile; you're a part of my act now.",
			'No exits on this stage, only curtains.',
			"Where do you think you're going? The show's not over.",
			'Trying to quit the game? I decide when it ends.',
			"You can't break free; you're woven into my story now."
		]);
	}

	if ((currentTask as any).users && (currentTask as any).users.length > 1) {
		return 'Your minion is on a group activity and cannot cancel!';
	}

	if (interaction) {
		await handleMahojiConfirmation(
			interaction,
			`${mName} is currently doing a ${currentTask.type} trip.
Please confirm if you want to call your minion back from their trip. 
They'll **drop** all their current **loot and supplies** to get back as fast as they can, so you won't receive any loot from this trip if you cancel it, and you will lose any supplies you spent to start this trip, if any.`
		);
	}

	await cancelTask(user.id);

	return `${mName}'s trip was cancelled, and they're now available.`;
}
