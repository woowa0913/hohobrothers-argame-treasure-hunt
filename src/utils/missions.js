// 미션 데이터를 정의하고 랜덤하게 셔플하여 스테이지를 제공하는 모듈

export const COLORS = ['빨강', '파랑', '노랑', '초록', '주황'];
export const SHAPES = ['circle', 'square'];

// 크기별 비율 정의 (화면 폭 대비 점선 지름/한 변 길이 비율 %)
export const SIZES = {
  '손톱만한 크기': { name: '손톱만한 크기', percent: 8, label: '동전, 단추 크기' },
  '주먹만한 크기': { name: '주먹만한 크기', percent: 18, label: '귤, 작은 공 크기' },
  '얼굴만한 크기': { name: '얼굴만한 크기', percent: 32, label: '쿠션, 큰 그릇 크기' }
};

// 미션 생성 및 풀 랜덤 셔플 함수
export function generateMissionPool() {
  const pool = [];

  // 1단계: 색상 단일 미션 (색상 4종)
  const step1 = COLORS.map(color => ({
    id: `step1_${color}`,
    step: 1,
    title: `${color} 보물`,
    instruction: `주변에서 [${color}색] 물건을 가져와 비춰보세요!`,
    color,
    shape: 'circle', // 기본 원형
    sizePercent: 20, // 색상 매칭 시 여유로운 영역 제공
    timeLimit: 25
  }));

  // 2단계: 크기 단일 미션 (크기 3종 * 도형 2종 = 6가지 조합)
  const step2 = [];
  Object.keys(SIZES).forEach(sizeKey => {
    SHAPES.forEach(shape => {
      const sizeObj = SIZES[sizeKey];
      step2.push({
        id: `step2_${sizeKey}_${shape}`,
        step: 2,
        title: `${sizeKey} 보물`,
        instruction: `화면의 점선 상자 [${shape === 'circle' ? '원형' : '사각형'}] 크기에 딱 맞는 물건을 올려놓으세요!`,
        color: null,
        shape,
        sizePercent: sizeObj.percent,
        timeLimit: 30
      });
    });
  });

  // 3단계: 색상+크기 혼합 미션 (색상 4종 * 크기 3종 = 12가지 중 랜덤 4종 선택 사용)
  const step3 = [];
  COLORS.forEach(color => {
    Object.keys(SIZES).forEach(sizeKey => {
      const sizeObj = SIZES[sizeKey];
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      step3.push({
        id: `step3_${color}_${sizeKey}_${shape}`,
        step: 3,
        title: `${color} + ${sizeKey} 보물`,
        instruction: `[${color}색]이면서 [${sizeKey}] 크기인 물건을 가져와 점선에 맞춰보세요!`,
        color,
        shape,
        sizePercent: sizeObj.percent,
        timeLimit: 35
      });
    });
  });

  // 단계별 셔플 적용 함수
  const shuffle = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // 각 단계별 랜덤 셔플 후 연결
  const shuffledStep1 = shuffle(step1);
  const shuffledStep2 = shuffle(step2);
  const shuffledStep3 = shuffle(step3).slice(0, 4); // 3단계는 4개만 추출

  return [...shuffledStep1, ...shuffledStep2, ...shuffledStep3];
}
