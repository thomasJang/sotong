// 중복 없는 귀여운 동물 캐릭터 닉네임 생성기
const ADJECTIVES = [
  '용감한', '지혜로운', '행복한', '호기심많은', '다정한',
  '친절한', '재빠른', '성실한', '씩씩한', '따뜻한',
  '차분한', '창의적인', '열정적인', '침착한', '유쾌한',
  '긍정적인', '든든한', '영리한', '꿈꾸는', '빛나는',
  '온화한', '유연한', '진중한', '상냥한', '쾌활한',
  '멋진', '발랄한', '똑똑한', '명랑한', '평화로운',
  '기운찬', '부지런한', '센스있는', '솔직한', '자유로운'
];

const ANIMALS = [
  { name: '사자', icon: '🦁' },
  { name: '호랑이', icon: '🐯' },
  { name: '여우', icon: '🦊' },
  { name: '판다', icon: '🐼' },
  { name: '코알라', icon: '🐨' },
  { name: '아기곰', icon: '🐻' },
  { name: '토끼', icon: '🐰' },
  { name: '다람쥐', icon: '🐿️' },
  { name: '고양이', icon: '🐱' },
  { name: '강아지', icon: '🐶' },
  { name: '펭귄', icon: '🐧' },
  { name: '올빼미', icon: '🦉' },
  { name: '수달', icon: '🦦' },
  { name: '비버', icon: '🦫' },
  { name: '돌고래', icon: '🐬' },
  { name: '고래', icon: '🐳' },
  { name: '사슴', icon: '🦌' },
  { name: '기린', icon: '🦒' },
  { name: '얼룩말', icon: '🦓' },
  { name: '코끼리', icon: '🐘' },
  { name: '캥거루', icon: '🦘' },
  { name: '쿼카', icon: '🐹' },
  { name: '너구리', icon: '🦝' },
  { name: '고슴도치', icon: '🦔' },
  { name: '물개', icon: '🦭' },
  { name: '알파카', icon: '🦙' },
  { name: '플라밍고', icon: '🦩' },
  { name: '앵무새', icon: '🦜' },
  { name: '원숭이', icon: '🐵' },
  { name: '거북이', icon: '🐢' }
];

export function generateUniqueCharacter(existingNames = new Set()) {
  // 가능한 모든 조합 셔플
  const candidates = [];
  for (const adj of ADJECTIVES) {
    for (const animal of ANIMALS) {
      const fullName = `${adj} ${animal.name}`;
      if (!existingNames.has(fullName)) {
        candidates.push({ name: fullName, icon: animal.icon });
      }
    }
  }

  if (candidates.length > 0) {
    // 랜덤 선택
    const index = Math.floor(Math.random() * candidates.length);
    return candidates[index];
  }

  // 만약 35 x 30 = 1050가지 조합이 모두 소진된 경우 접미사 번호 추가
  let counter = 1;
  while (true) {
    const randomAnimal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const randomAdj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const candidateName = `${randomAdj} ${randomAnimal.name} #${counter}`;
    if (!existingNames.has(candidateName)) {
      return { name: candidateName, icon: randomAnimal.icon };
    }
    counter++;
  }
}
