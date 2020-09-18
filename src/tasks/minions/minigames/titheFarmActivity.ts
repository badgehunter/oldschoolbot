import { Task } from 'klasa';

import { bankHasItem, roll } from '../../../lib/util';
import { TitheFarmActivityTaskOptions } from '../../../lib/types/minions';
import itemID from '../../../lib/util/itemID';
import { UserSettings } from '../../../lib/settings/types/UserSettings';
import { Events, Emoji } from '../../../lib/constants';
import { SkillsEnum } from '../../../lib/skilling/types';
import { TitheFarmStats } from '../../../lib/farming/types';
import { handleTripFinish } from '../../../lib/util/handleTripFinish';

export default class extends Task {
	async run({ userID, channelID, duration }: TitheFarmActivityTaskOptions) {
		const baseHarvest = 85;
		let lootStr = '';

		const user = await this.client.users.fetch(userID);
		user.incrementMinionDailyDuration(duration);

		const farmingLvl = user.skillLevel(SkillsEnum.Farming);
		const titheFarmStats = user.settings.get(UserSettings.Stats.TitheFarmStats);
		const { titheFarmsCompleted } = titheFarmStats;
		const { titheFarmPoints } = titheFarmStats;
		const determineHarvest = baseHarvest + Math.min(15, titheFarmsCompleted);
		const determinePoints = determineHarvest - 74;

		const updatedTitheFarmStats: TitheFarmStats = {
			titheFarmsCompleted: titheFarmsCompleted + 1,
			titheFarmPoints: titheFarmPoints + determinePoints
		};

		await user.settings.update(UserSettings.Stats.TitheFarmStats, updatedTitheFarmStats);

		let fruit = '';
		let fruitXp = 0;
		if (farmingLvl < 54) {
			fruitXp = 6;
			fruit = 'golovanova';
		} else if (farmingLvl < 74) {
			fruitXp = 14;
			fruit = 'bologano';
		} else {
			fruitXp = 23;
			fruit = 'logavano';
		}

		const harvestXp = determineHarvest * fruitXp;
		const depositXp =
			74 * 10 * fruitXp + (determineHarvest - 74) * 20 * fruitXp + 250 * fruitXp;
		const farmingXp = harvestXp + depositXp;

		const harvestStr = `${user} ${user.minionName} successfully harvested ${determineHarvest}x ${fruit} fruit and received ${farmingXp} Farming XP.`;
		const completedStr = `You have completed the Tithe Farm ${titheFarmsCompleted +
			1}x times. You now have ${titheFarmPoints + determinePoints} points to spend.`;

		const userBank = user.settings.get(UserSettings.Bank);
		let bonusXpMultiplier = 0;
		let farmersPiecesCheck = 0;
		if (bankHasItem(userBank, itemID(`Farmer's strawhat`), 1)) {
			bonusXpMultiplier += 0.004;
			farmersPiecesCheck += 1;
		}
		if (
			bankHasItem(userBank, itemID(`Farmer's jacket`), 1) ||
			bankHasItem(userBank, itemID(`Farmer's shirt`), 1)
		) {
			bonusXpMultiplier += 0.008;
			farmersPiecesCheck += 1;
		}
		if (bankHasItem(userBank, itemID(`Farmer's boro trousers`), 1)) {
			bonusXpMultiplier += 0.006;
			farmersPiecesCheck += 1;
		}
		if (bankHasItem(userBank, itemID(`Farmer's boots`), 1)) {
			bonusXpMultiplier += 0.002;
			farmersPiecesCheck += 1;
		}
		if (farmersPiecesCheck === 4) bonusXpMultiplier += 0.005;

		const bonusXp = farmingXp * bonusXpMultiplier;
		const totalXp = farmingXp + bonusXp;

		let bonusXpStr = '';
		if (bonusXp > 0) {
			bonusXpStr = `You received an additional ${Math.floor(
				bonusXp
			)} Bonus XP from your farmer's outfit pieces.`;
		}

		await user.addXP(SkillsEnum.Farming, Math.floor(totalXp));

		if (roll((7_494_389 - user.skillLevel(SkillsEnum.Farming) * 25) / determineHarvest)) {
			const loot = { [itemID('Tangleroot')]: 1 };
			lootStr += '\n\n```diff';
			lootStr += `\n- You have a funny feeling you're being followed...`;
			lootStr += '```';
			this.client.emit(
				Events.ServerNotification,
				`${Emoji.Farming} **${user.username}'s** minion, ${
					user.minionName
				}, just received a Tangleroot by completing the Tithe Farm on their ${titheFarmsCompleted +
					1} run!`
			);

			await user.addItemsToBank(loot, true);
		}

		const returnStr = `${harvestStr} ${bonusXpStr}\n\n${completedStr}${lootStr}\n`;

		handleTripFinish(this.client, user, channelID, returnStr, res => {
			user.log(`attemped another run of the Tithe Farm.`);
			return this.client.commands.get('tithefarm')!.run(res, []);
		});
	}
}
