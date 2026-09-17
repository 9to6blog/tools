import type { PixelSettings } from './types';

export const OUTPUT_PRESETS = [
  { id: 'grass', group: '자연 · 식물', label: '짧은 풀 한 포기', width: 16, height: 16, note: '바닥에 흩뿌리는 작은 풀 장식. 여러 포기를 그릴 때는 더 큰 영역을 선택하세요.' },
  { id: 'tall-grass', group: '자연 · 식물', label: '키 큰 풀 · 풀숲', width: 32, height: 32, note: '32px 바닥 한 칸에 놓는 풀숲이나 갈대 묶음.' },
  { id: 'flower', group: '자연 · 식물', label: '꽃 · 작은 버섯', width: 16, height: 24, note: '꽃잎과 줄기, 버섯의 갓과 줄기를 구분하는 세로형 장식.' },
  { id: 'bush', group: '자연 · 식물', label: '덤불 · 낮은 관목', width: 48, height: 32, note: '옆으로 퍼지는 관목, 작은 화단과 울타리 앞 덤불.' },
  { id: 'sapling', group: '자연 · 식물', label: '어린 나무 · 작은 나무', width: 48, height: 64, note: '가느다란 줄기와 작은 수관. 작은 정원과 거리 장식용.' },
  { id: 'tree', group: '자연 · 식물', label: '일반 나무', width: 64, height: 96, note: '수관과 줄기가 모두 보이는 나무 한 그루. 32px 타일 기준 2×3칸.' },
  { id: 'pine', group: '자연 · 식물', label: '침엽수 · 키 큰 나무', width: 96, height: 160, note: '소나무, 전나무처럼 세로로 긴 실루엣. 32px 타일 기준 3×5칸.' },
  { id: 'large-tree', group: '자연 · 식물', label: '큰 나무 · 고목', width: 128, height: 192, note: '넓은 수관, 굵은 줄기와 뿌리의 형태를 담는 큰 오브젝트.' },
  { id: 'rock', group: '자연 · 식물', label: '돌 · 작은 바위', width: 32, height: 24, note: '길가에 배치할 돌 한 개. 바닥과 맞닿는 면을 짧게 표현합니다.' },
  { id: 'boulder', group: '자연 · 식물', label: '큰 바위 · 광석', width: 64, height: 48, note: '채광용 바위, 큰 암석과 덩어리 형태의 지형 장식.' },
  { id: 'small-character', group: '캐릭터', label: '작은 캐릭터', width: 24, height: 32, note: '단순한 얼굴과 의상을 가진 작은 NPC·몬스터 한 개.' },
  { id: 'character', group: '캐릭터', label: '기본 RPG 캐릭터', width: 32, height: 48, note: '머리·몸·다리를 구분하는 기본 사람형 캐릭터.' },
  { id: 'large-character', group: '캐릭터', label: '상세 캐릭터 · 큰 몬스터', width: 48, height: 64, note: '의상과 장비를 더 명확히 표현할 수 있는 크기.' },
  { id: 'action-character', group: '캐릭터', label: '무기 액션용 캐릭터 영역', width: 96, height: 96, note: '무기·효과가 움직일 여유를 포함하는 영역. 동작 시트 생성은 캐릭터 스프라이트 탭에서 설정합니다.' },
  { id: 'item', group: '소품 · 아이템', label: '아이템 · 재료 아이콘', width: 16, height: 16, note: '열매, 광석 조각, 작은 재료처럼 간단한 인벤토리 아이콘.' },
  { id: 'weapon', group: '소품 · 아이템', label: '검 · 지팡이', width: 16, height: 48, note: '세로로 긴 무기 한 개. 도끼처럼 옆으로 넓은 무기는 가로를 늘리세요.' },
  { id: 'chest', group: '소품 · 아이템', label: '상자 · 항아리', width: 32, height: 32, note: '보물상자, 통, 항아리와 한 칸 크기의 작은 소품.' },
  { id: 'furniture', group: '소품 · 아이템', label: '책상 · 의자 · 가구', width: 64, height: 48, note: '가구의 상판과 다리가 함께 보이는 가로형 오브젝트.' },
  { id: 'door', group: '건물 · 구조물', label: '문 · 세로 간판', width: 32, height: 64, note: '건물 입구나 기둥형 간판에 쓸 세로 영역.' },
  { id: 'hut', group: '건물 · 구조물', label: '작은 오두막 · 창고', width: 128, height: 128, note: '단순한 지붕, 문과 창문을 갖춘 작은 건물 한 채.' },
  { id: 'house', group: '건물 · 구조물', label: '일반 주택 · 상점', width: 192, height: 160, note: '문·창문·지붕을 구분하는 중간 크기 건물.' },
  { id: 'hanok', group: '건물 · 구조물', label: '한옥 · 넓은 건물', width: 256, height: 192, note: '기와지붕, 기둥과 창문을 표현하는 가로형 건물. 32px 기준 8×6칸.' },
  { id: 'tower', group: '건물 · 구조물', label: '탑 · 다층 건물', width: 256, height: 384, note: '층 구분과 긴 실루엣이 필요한 대형 구조물.' },
  { id: 'ground', group: '타일 · 효과', label: '바닥 타일 한 칸', width: 32, height: 32, note: '잔디·흙·돌바닥 한 칸을 그리는 영역입니다.' },
  { id: 'atlas', group: '타일 · 효과', label: '타일 시트 전체 · 8×6칸', width: 256, height: 192, note: '32px 기준 8열×6행의 전체 영역. 이 프리셋 자체가 타일을 자동 분할하지는 않습니다.' },
  { id: 'effect', group: '타일 · 효과', label: '작은 마법 · 타격 효과', width: 32, height: 32, note: '작은 불꽃, 반짝임과 타격 효과 한 장.' },
  { id: 'large-effect', group: '타일 · 효과', label: '폭발 · 큰 마법 효과', width: 64, height: 64, note: '퍼지는 불꽃·연기·마법진의 여유를 포함하는 영역.' },
] as const;
export type OutputPreset = typeof OUTPUT_PRESETS[number];
export function applyOutputPreset(settings: PixelSettings, preset: OutputPreset): PixelSettings {
  return { ...settings, width: preset.width, height: preset.height, size: Math.max(preset.width, preset.height), padding: 0, exportSet: 'selected' };
}
