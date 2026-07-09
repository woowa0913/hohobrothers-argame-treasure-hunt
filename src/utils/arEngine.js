// 미션 카드에 따른 분석을 수행하는 AR 엔진 (OpenCV.js 기반)

// RGB를 HSV로 변환 후 지정된 색상 범위 내에 드는지 판정하는 헬퍼 함수
export function isColorMatch(h, s, v, colorName) {
  // 아이들 방 조명 상황 및 원거리 TV 환경을 고려하여 색상 검출 범위를 여유롭게 버퍼링
  switch (colorName) {
    case '빨강':
      return ((h >= 0 && h <= 12) || (h >= 168 && h <= 180)) && s >= 45 && v >= 35;
    case '파랑':
      return h >= 90 && h <= 135 && s >= 45 && v >= 35;
    case '노랑':
      return h >= 14 && h <= 36 && s >= 55 && v >= 60;
    case '초록':
      return h >= 38 && h <= 88 && s >= 35 && v >= 35;
    default:
      return false;
  }
}

// 신체 부위(사람의 피부톤)를 걸러내기 위한 HSV 범위 판별 헬퍼
// 피부색 영역 판정을 정밀화하여 일반 무채색/어두운색 물체와 오버랩을 최소화
export function isSkinColor(h, s, v) {
  return h >= 3 && h <= 17 && s >= 40 && s <= 150 && v >= 50;
}

// 캘리브레이션용 배경 차분(Background Subtraction) 및 전경/색상 인식 알고리즘
export function processFrame(videoElement, canvasElement, bgMat, mission, calibrationScale = 1.0) {
  if (!window.cv || !videoElement || !canvasElement) return { fillRatio: 0, colorMatched: false, cropDataUrl: null };

  const cv = window.cv;
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (width === 0 || height === 0) return { fillRatio: 0, colorMatched: false };

  canvasElement.width = width;
  canvasElement.height = height;

  const ctx = canvasElement.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, width, height);

  // 미션 도형 정보
  const shape = mission.shape || 'circle';
  const sizeMultiplier = calibrationScale; 
  const sizePercentage = mission.sizePercent || 15; 
  const pixelSize = Math.round(Math.min(width, height) * (sizePercentage / 100) * sizeMultiplier * 1.5);

  const centerX = Math.round(width / 2);
  const centerY = Math.round(height / 2);
  
  let inMissionArea = (x, y) => false;
  let areaPixelCount = 0;

  if (shape === 'circle') {
    const radius = Math.round(pixelSize / 2);
    inMissionArea = (x, y) => {
      const dx = x - centerX;
      const dy = y - centerY;
      return dx * dx + dy * dy <= radius * radius;
    };
    areaPixelCount = Math.PI * radius * radius;
  } else {
    const half = Math.round(pixelSize / 2);
    const startX = centerX - half;
    const endX = centerX + half;
    const startY = centerY - half;
    const endY = centerY + half;
    inMissionArea = (x, y) => {
      return x >= startX && x <= endX && y >= startY && y <= endY;
    };
    areaPixelCount = pixelSize * pixelSize;
  }

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let src = cv.imread(canvasElement);
  let hsv = new cv.Mat();
  cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  let overlappingPixels = 0;
  let matchingColorPixels = 0;

  const halfSize = Math.round(pixelSize / 2);
  const startX = Math.max(0, centerX - halfSize);
  const endX = Math.min(width - 1, centerX + halfSize);
  const startY = Math.max(0, centerY - halfSize);
  const endY = Math.min(height - 1, centerY + halfSize);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      if (inMissionArea(x, y)) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const hsvIdx = (y * width + x) * 3;
        const h = hsv.data[hsvIdx];     
        const s = hsv.data[hsvIdx + 1]; 
        const v = hsv.data[hsvIdx + 2]; 

        // 1. 피부톤 예외 조건
        if (isSkinColor(h, s, v)) {
          continue;
        }

        // 2. 전경 물체 감도 상향 조정: 무채색(검은색 컵, 흰 책 등) 및 저채도 물체 감지를 위해 최소 Saturation(s) 임계값을 12로, 명도(v) 임계값을 30으로 대폭 인하
        const isForeground = s > 12 && v > 30;

        if (isForeground) {
          overlappingPixels++;
          if (mission.color) {
            if (isColorMatch(h, s, v, mission.color)) {
              matchingColorPixels++;
            }
          }
        }
      }
    }
  }

  const fillRatio = Math.min(100, Math.round((overlappingPixels / areaPixelCount) * 100));
  
  let colorMatched = false;
  if (mission.color) {
    const targetMatchRatio = 0.35;
    colorMatched = overlappingPixels > 10 && (matchingColorPixels / overlappingPixels) >= targetMatchRatio;
  } else {
    colorMatched = true;
  }

  let cropDataUrl = null;
  if (fillRatio >= 65 && colorMatched) {
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = pixelSize;
      tempCanvas.height = pixelSize;
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.drawImage(
        canvasElement,
        centerX - halfSize,
        centerY - halfSize,
        pixelSize,
        pixelSize,
        0,
        0,
        pixelSize,
        pixelSize
      );
      cropDataUrl = tempCanvas.toDataURL('image/jpeg', 0.6);
    } catch (e) {
      console.warn("Failed to crop treasure image:", e);
    }
  }

  src.delete();
  hsv.delete();

  return {
    fillRatio,
    colorMatched,
    cropDataUrl
  };
}
