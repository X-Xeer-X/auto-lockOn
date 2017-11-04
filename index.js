/*
	version 1.0
	Update : 2017-11-04
	자동으로 락온을 잡아줍니다.
*/

const skills = [
	67299764, // 사제 힐 IX
	67159864, // 정령 힐 X
	67198964, // 정령 정화
];

const CHECK_DISTANCE = 900; // 최대거리
const CHECK_HP = 1; // 기준 이상 피는 무시

module.exports = function autoLockOn(dispatch) {
	let enabled = false;
	let me = {
		playerId: null,
		location: {},
	};

	let members = [];

	//사제 정령만 활성화 시킴
	dispatch.hook('S_LOGIN', 2, event => {
		const { playerId, model } = event;
		const job = model % 100 - 1;

		me.playerId = playerId;
		enabled = job === 6 || job === 7 ? true : false;
	});

	/*******************************************************
	 * 파티관련
	 *******************************************************/

	// 파티에서 나가면 초기화
	dispatch.hook('S_LEAVE_PARTY', 1, event => {
		if (!enabled) return;
		members = [];
	});

	// 파티리스트 받으면
	dispatch.hook('S_PARTY_MEMBER_LIST', 5, event => {
		if (!enabled) return;
		for (const member of event.members) {
			members.push({
				hp: 0,
				cid: member.cid,
				playerId: member.playerId,
				location: { x: 0, y: 0, z: 0 },
			});
		}
	});

	// 파티원 체력 변동이 있으면
	dispatch.hook('S_PARTY_MEMBER_CHANGE_HP', 3, event => {
		if (!enabled) return;
		if (event.playerId == me.playerId) return; // 나일경우

		const { playerId, currentHp, maxHp } = event;
		const memberIndex = members.findIndex(x => x.playerId === playerId);

		if (memberIndex >= 0) members[memberIndex].hp = currentHp / maxHp;
	});

	/*********************************************************
	 * 위치관련
	 ********************************************************/

	// 내 위치
	dispatch.hook('C_PLAYER_LOCATION', 1, event => {
		if (!enabled) return;

		me.location = {
			x: event.x1,
			y: event.y1,
			z: event.z1,
		};
	});

	// 유져 위치
	dispatch.hook('S_USER_LOCATION', 1, event => {
		if (!enabled) return;
		const cid = event.target;
		const memberIndex = members.findIndex(x => cid.equals(x.cid));

		if (memberIndex < 0) return; // 파티원이 아닌경우

		members[memberIndex].location = {
			x: event.x1,
			y: event.y1,
			z: event.z1,
		};
	});

	/*********************************************************
	 * 스킬관련
	 ********************************************************/

	dispatch.hook('C_START_SKILL', 1, async event => {
		if (!enabled) return;

		const skill = event.skill;
		let sortMembers = [];

		if (!skills.includes(skill)) return;

		// 거리순으로 정렬, 기준거리, 기준HP 필터
		sortMembers = members
			.sort((a, b) => getDistance(a) - getDistance(b))
			.filter(x => getDistance(x) <= CHECK_DISTANCE && x.hp > 0);

		if (skill !== 67198964) {
			//정화가 아닐경우 HP체크 필터 추가
			sortMembers = sortMembers.filter(x => x.hp <= CHECK_HP && x.hp > 0);
		}

		// 해당하는 맴버가 없다면
		if (sortMembers.length === 0) return;

		await sleep(100); // 이것 없으면 락온 안잡힘

		// 거리순으로 최대 4명
		for (let i = 0; i < Math.min(4, sortMembers.length); i++) {
			dispatch.toServer('C_CAN_LOCKON_TARGET', 1, {
				target: sortMembers[i].cid,
				unk: 0,
				skill,
			});
		}
	});

	dispatch.hook('C_CAN_LOCKON_TARGET', 1, event => {
		dispatch.toClient(
			'S_CAN_LOCKON_TARGET',
			1,
			Object.assign({ ok: true }, event)
		);
	});

	/*********************************************************
	 * 보조함수
	 ********************************************************/

	function getDistance(member) {
		let distance = CHECK_DISTANCE + 1;

		const x = me.location.x - member.location.x;
		const y = me.location.y - member.location.y;
		const z = me.location.z - member.location.z;

		// √((x1-x2)^2 + (y1-y2)^2 + (z1-z2)^2)
		distance = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2) + Math.pow(z, 2));

		return Math.min(distance, CHECK_DISTANCE + 1);
	}

	function sleep(ms) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				resolve();
			}, ms);
		});
	}
};
