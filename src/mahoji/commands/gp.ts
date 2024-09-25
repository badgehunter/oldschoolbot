import type { CommandRunOptions } from '@oldschoolgg/toolkit';
import { toKMB } from 'oldschooljs';

import { Emoji } from '../../lib/constants';
import type { OSBMahojiCommand } from '../lib/util';
import { mahojiUsersSettingsFetch } from '../mahojiSettings';

export const gpCommand: OSBMahojiCommand = {
	name: 'gp',
	description: 'See your current GP balance.',
	options: [],
	run: async ({ user }: CommandRunOptions<{ question: string }>) => {
		const mUser = await mahojiUsersSettingsFetch(user.id, {
			GP: true
		});
		const gp = Number(mUser.GP);
		return `${Emoji.MoneyBag} You have ${toKMB(gp)} (${gp.toLocaleString()}) GP.`;
	}
};
