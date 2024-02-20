import { KillableMonster } from '../types';
import calculateMonsterFood from './calculateMonsterFood';
import getUserFoodFromBank from './getUserFoodFromBank';

export default function hasEnoughFoodForMonster(
	monster: Readonly<KillableMonster>,
	user: MUser,
	quantity: number,
	totalPartySize = 1
) {
	if (monster.healAmountNeeded) {
		return (
			getUserFoodFromBank({
				bank: user.bank,
				skillsAsLevels: user.skillsAsLevels,
				totalHealingNeeded: Math.ceil(calculateMonsterFood(monster, user)[0] / totalPartySize) * quantity,
				favoriteFood: user.user.favorite_food
			}) !== false
		);
	}
	return true;
}
