import { Minigame, UserStats } from '@prisma/client';
import { calcWhatPercent, objectEntries } from 'e';
import { Bank } from 'oldschooljs';

import { getParsedStashUnits, ParsedUnit } from '../../mahoji/lib/abstracted_commands/stashUnitsCommand';
import { BitField, BitFieldData } from '../constants';
import { diariesObject, DiaryTierName, userhasDiaryTier } from '../diaries';
import { effectiveMonsters } from '../minions/data/killableMonsters';
import { UserKourendFavour } from '../minions/data/kourendFavour';
import { MinigameName } from '../settings/minigames';
import { prisma } from '../settings/prisma';
import Agility from '../skilling/skills/agility';
import { ItemBank, Skills } from '../types';
import { itemNameFromID } from '../util';
import { MUserStats } from './MUserStats';

export interface RequirementFailure {
	reason: string;
}

type ManualHasFunction = (args: {
	user: MUser;
	userStats: UserStats;
	stashUnits: ParsedUnit[];
	minigames: Minigame;
	stats: MUserStats;
}) =>
	| Promise<RequirementFailure[]>
	| RequirementFailure[]
	| undefined
	| Promise<undefined | string>
	| string
	| Promise<string>;

type Requirement = {
	name?: string;
} & (
	| { name: string; has: ManualHasFunction }
	| { skillRequirements: Partial<Skills> }
	| { clRequirement: Bank | number[] }
	| { kcRequirement: Record<number, number> }
	| { qpRequirement: number }
	| { lapsRequirement: Record<number, number> }
	| { sacrificedItemsRequirement: Bank }
	| { favour: Partial<UserKourendFavour> }
	| { OR: Requirement[] }
	| { minigames: Partial<Record<MinigameName, number>> }
	| { bitfieldRequirement: BitField }
	| { diaryRequirement: [keyof typeof diariesObject, DiaryTierName][] }
);

export class Requirements {
	requirements: Requirement[] = [];

	formatRequirement(req: Requirement): (string | string[])[] {
		const requirementParts: (string | string[])[] = [];
		if ('skillRequirements' in req) {
			requirementParts.push(
				`Required Skills: ${objectEntries(req.skillRequirements)
					.map(([skill, level]) => `Level ${level} ${skill}`)
					.join(', ')}`
			);
		}

		if ('clRequirement' in req) {
			requirementParts.push(
				`Items Must Be in CL: ${
					Array.isArray(req.clRequirement)
						? req.clRequirement.map(itemNameFromID).join(', ')
						: req.clRequirement.toString()
				}`
			);
		}

		if ('kcRequirement' in req) {
			requirementParts.push(
				`Kill Count Requirement: ${Object.entries(req.kcRequirement)
					.map(([k, v]) => `${v}x ${effectiveMonsters.find(i => i.id === Number(k))!.name}`)
					.join(', ')}.`
			);
		}

		if ('qpRequirement' in req) {
			requirementParts.push(`Quest Point Requirement: ${req.qpRequirement} QP`);
		}

		if ('lapsRequirement' in req) {
			requirementParts.push(
				`Agility Course Laps Requirements: ${Object.entries(req.lapsRequirement)
					.map(([k, v]) => `${v}x laps of ${Agility.Courses.find(i => i.id === Number(k))!.name}`)
					.join(', ')}.`
			);
		}

		if ('sacrificedItemsRequirement' in req) {
			requirementParts.push(`Sacrificed Items Requirement: ${req.sacrificedItemsRequirement.toString()}`);
		}

		if ('favour' in req) {
			requirementParts.push(
				`Kourend Favour Requirement: ${Object.entries(req.favour)
					.map(([k, v]) => `${v}% favour in ${k}`)
					.join(', ')}.`
			);
		}

		if ('minigames' in req) {
			requirementParts.push(
				`Minigame Requirements: ${Object.entries(req.minigames)
					.map(([k, v]) => `${v} KC in ${k}`)
					.join(', ')}.`
			);
		}

		if ('bitfieldRequirement' in req) {
			requirementParts.push(`${BitFieldData[req.bitfieldRequirement].name}`);
		}

		if ('diaryRequirement' in req) {
			requirementParts.push(
				`Achievement Diary Requirement: ${req.diaryRequirement
					.map(i => `${i[1]} ${diariesObject[i[0]].name}`)
					.join(', ')}`
			);
		}

		if ('OR' in req) {
			const subResults = req.OR.map(i => this.formatRequirement(i));
			requirementParts.push(`ONE of the following requirements must be met: ${subResults.join(', ')}.`);
		}

		return requirementParts;
	}

	formatAllRequirements() {
		let finalStr = '';
		for (const req of this.requirements) {
			const formatted = this.formatRequirement(req);
			finalStr += `  - ${req.name}\n`;
			if (typeof formatted === 'string') {
				finalStr += `    - ${formatted}`;
			} else {
				for (const subReq of formatted) {
					finalStr += `    - ${subReq}`;
				}
			}
			finalStr += '\n';
		}

		return finalStr;
	}

	add(requirement: Requirement) {
		this.requirements.push(requirement);
		return this;
	}

	async checkSingleRequirement(
		requirement: Requirement,
		{
			user,
			userStats,
			minigames,
			stashUnits,
			stats
		}: { user: MUser; userStats: UserStats; minigames: Minigame; stashUnits: ParsedUnit[]; stats: MUserStats }
	): Promise<RequirementFailure[]> {
		const results: RequirementFailure[] = [];

		if ('has' in requirement) {
			const result = await requirement.has({ user, userStats, minigames, stashUnits, stats });
			if (result) {
				if (typeof result === 'string') {
					results.push({ reason: result });
				} else {
					results.push(...result);
				}
			}
		}

		if ('skillRequirements' in requirement) {
			const insufficientLevels = [];
			for (const [skillName, level] of objectEntries(requirement.skillRequirements)) {
				if (user.skillsAsLevels[skillName] < level!) {
					insufficientLevels.push(`${level} ${skillName}`);
				}
			}
			if (insufficientLevels.length > 0) {
				results.push({
					reason: `You need these stats: ${insufficientLevels.join(', ')}.`
				});
			}
		}

		if ('clRequirement' in requirement) {
			if (!user.cl.has(requirement.clRequirement)) {
				const missingItems = Array.isArray(requirement.clRequirement)
					? requirement.clRequirement
							.filter(i => !user.cl.has(i))
							.map(itemNameFromID)
							.join(', ')
					: requirement.clRequirement.clone().remove(user.cl);
				results.push({
					reason: `You need ${missingItems} in your CL.`
				});
			}
		}

		if ('kcRequirement' in requirement) {
			const kcs = userStats.monster_scores as ItemBank;
			const missingMonsterNames = [];
			for (const [id, amount] of Object.entries(requirement.kcRequirement)) {
				if (!kcs[id] || kcs[id] < amount) {
					missingMonsterNames.push(`${amount}x ${effectiveMonsters.find(m => m.id === parseInt(id))!.name}`);
				}
			}
			if (missingMonsterNames.length > 0) {
				results.push({
					reason: `You need the following KC's: ${missingMonsterNames.join(', ')}.`
				});
			}
		}

		if ('qpRequirement' in requirement) {
			if (user.QP < requirement.qpRequirement) {
				results.push({
					reason: `You need ${requirement.qpRequirement} QP.`
				});
			}
		}

		if ('lapsRequirement' in requirement) {
			const laps = userStats.laps_scores as ItemBank;
			for (const [id, amount] of Object.entries(requirement.lapsRequirement)) {
				if (!laps[id] || laps[id] < amount) {
					results.push({
						reason: `You need ${amount}x laps in the ${
							Agility.Courses.find(i => i.id.toString() === id)!.name
						} agility course.`
					});
				}
			}
		}

		if ('sacrificedItemsRequirement' in requirement) {
			const sacBank = new Bank().add(userStats.sacrificed_bank as ItemBank);
			if (!sacBank.has(requirement.sacrificedItemsRequirement)) {
				results.push({
					reason: `You need to have sacrificed these items: ${requirement.sacrificedItemsRequirement}.`
				});
			}
		}

		if ('favour' in requirement) {
			const insufficientFavour = [];
			for (const [house, favour] of objectEntries(requirement.favour)) {
				if (user.kourendFavour[house] < favour!) {
					insufficientFavour.push(`${favour}% favour in ${house}`);
				}
			}
			if (insufficientFavour.length > 0) {
				results.push({
					reason: `You need these favour: ${insufficientFavour.join(', ')}.`
				});
			}
		}

		if ('minigames' in requirement) {
			const insufficientMinigames = [];
			for (const [minigame, score] of objectEntries(requirement.minigames)) {
				if (minigames[minigame] < score!) {
					insufficientMinigames.push(`${score}x ${minigame}`);
				}
			}
			if (insufficientMinigames.length > 0) {
				results.push({
					reason: `You need these minigames scores: ${insufficientMinigames.join(', ')}.`
				});
			}
		}

		if ('bitfieldRequirement' in requirement) {
			if (!user.bitfield.includes(requirement.bitfieldRequirement)) {
				const bitName = BitFieldData[requirement.bitfieldRequirement].name;
				results.push({
					reason: `You need: ${bitName}.`
				});
			}
		}

		if ('diaryRequirement' in requirement) {
			const unmetDiaries = (
				await Promise.all(
					requirement.diaryRequirement.map(async ([diary, tier]) => ({
						has: await userhasDiaryTier(user, diariesObject[diary][tier]),
						tierName: `${tier} ${diariesObject[diary].name}`
					}))
				)
			).filter(i => !i.has[0]);
			if (unmetDiaries.length > 0) {
				results.push({
					reason: `You need to finish these achievement diaries: ${unmetDiaries
						.map(i => i.tierName)
						.join(', ')}.`
				});
			}
		}

		if ('OR' in requirement) {
			const orResults = await Promise.all(
				requirement.OR.map(req =>
					this.checkSingleRequirement(req, { user, userStats, minigames, stashUnits, stats })
				)
			);
			if (!orResults.some(i => i.length === 0)) {
				results.push({
					reason: `You need to meet one of these requirements:\n${orResults.map((res, index) => {
						return `${index + 1}. ${res.join(', ')})}`;
					})}`
				});
			}
		}

		return results;
	}

	async check(user: MUser) {
		const userStats = await prisma.userStats.upsert({
			where: {
				user_id: BigInt(user.id)
			},
			create: {
				user_id: BigInt(user.id)
			},
			update: {}
		});
		const minigames = await user.fetchMinigames();
		const stashUnits = await getParsedStashUnits(user.id);
		const stats = new MUserStats(userStats);

		const requirementResults = this.requirements.map(async i => ({
			result: await this.checkSingleRequirement(i, { user, userStats, minigames, stashUnits, stats }),
			requirement: i
		}));

		const results = await Promise.all(requirementResults);
		const flatResults = results.flat();

		const totalRequirements = this.requirements.length;
		const metRequirements = results.filter(i => i.result.length === 0).length;
		const completionPercentage = calcWhatPercent(metRequirements, totalRequirements);

		return {
			hasAll: results.length === 0,
			reasonsDoesnt: results
				.filter(i => i.result.length > 0)
				.map(i => `${i.requirement.name}: ${i.result.map(t => t.reason).join(', ')}`),
			rendered: `- ${flatResults.map(i => i.result).join('\n- ')}`,
			totalRequirements,
			metRequirements,
			completionPercentage
		};
	}
}
