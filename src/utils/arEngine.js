// 미션 카드에 따른 분석을 수행하는 AR 엔진 (OpenCV.js 기반)

export function isColorMatch(h, s, v, colorName) {
  switch (colorName) {
    case '빨강':
      return ((h >= 0 && h <= 15) || (h >= 165 && h <= 180)) && s >= 30 && v >= 30;
    case '파랑':
      return h >= 85 && h <= 140 && s >= 30 && v >= 30;
    case '노랑':
      return h >= 14 && h <= 34 && s >= 35 && v >= 40;
    case '초록':
      return h >= 35 && h <= 90 && s >= 20 && v >= 25;
    case '주황':
      return h >= 8 && h <= 22 && s >= 40 && v >= 45;
    default:
      return false;
  }
}

export function isSkinColor(h, s, v) {
  // 아시아인 피부색 톤을 포함해 손/신체 필터링 범위를 최적화
  return h >= 0 && h <= 20 && s >= 20 && s <= 165 && v >= 35;
}

export function processFrame(
  videoElement, 
  canvasElement, 
  bgImageData, // 대기 상태에서 촬영한 배경 이미지 데이터
  mission, 
  calibrationScale = 1.0, 
  centerXPercent = 0.5
) {
  if (!window.cv || !videoElement || !canvasElement) {
    return { fillRatio: 0, colorMatched: false, cropDataUrl: null, detectedRect: null };
  }

  const cv = window.cv;
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (width === 0 || height === 0) {
    return { fillRatio: 0, colorMatched: false, detectedRect: null };
  }

  canvasElement.width = width;
  canvasElement.height = height;

  const ctx = canvasElement.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, width, height);

  const shape = mission.shape || 'circle';
  const sizeMultiplier = calibrationScale; 
  const sizePercentage = mission.sizePercent || 15; 
  // 점선 가이드 상자의 타겟 픽셀 크기 계산
  const pixelSize = Math.round(Math.min(width, height) * (sizePercentage / 100) * sizeMultiplier * 1.5);

  const centerX = Math.round(width * centerXPercent);
  const centerY = Math.round(height * 0.68); 
  
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

  const outerLimitRadius = Math.round(pixelSize * 1.5 / 2);
  let outerOverlapPixels = 0;

  // 물체 감지용 Bounding Box 경계값 초기화
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let detectedForegroundCount = 0;

  const xStart = centerXPercent === 0.5 ? 0 : centerXPercent < 0.5 ? 0 : Math.round(width / 2);
  const xEnd = centerXPercent === 0.5 ? width : centerXPercent < 0.5 ? Math.round(width / 2) : width;

  // 배경 데이터 배열 추출
  const bgData = bgImageData ? bgImageData.data : null;

  for (let y = 0; y < height; y += 4) {
    for (let x = xStart; x < xEnd; x += 4) {
      const idx = (y * width + x) * 4;
      const hsvIdx = (y * width + x) * 3;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const h = hsv.data[hsvIdx];     
      const s = hsv.data[hsvIdx + 1]; 
      const v = hsv.data[hsvIdx + 2]; 

      // 1. 신체(피부색) 필터링
      if (isSkinColor(h, s, v)) {
        continue;
      }

      // 2. 배경 대비 변화량(RGB 유클리드 거리) 계산
      let isChanged = true;
      if (bgData) {
        const bgR = bgData[idx];
        const bgG = bgData[idx + 1];
        const bgB = bgData[idx + 2];
        const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
        isChanged = dist > 42; // 차이가 42 이상이면 유의미한 변화(움직인 물체)로 판정
      }

      // 어두운 영역이나 무채색 노이즈 방지용 최소 채도/명도
      const isForeground = isChanged && s > 15 && v > 30;

      if (isForeground) {
        let isValidForeground = true;
        if (mission.color) {
          isValidForeground = isColorMatch(h, s, v, mission.color);
        }

        if (isValidForeground) {
          // 타켓 검사 윈도우 내부 혹은 가이드 영역 근처에 있는 픽셀만 사각형 산출에 반영
          const searchMargin = pixelSize * 1.2;
          if (x >= centerX - searchMargin && x <= centerX + searchMargin &&
              y >= centerY - searchMargin && y <= centerY + searchMargin) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            detectedForegroundCount++;
          }

          // 1) 가이드 영역 내부 픽셀 카운트
          if (inMissionArea(x, y)) {
            overlappingPixels += 16;
            if (mission.color) {
              matchingColorPixels += 16;
            }
          } else {
            // 2) 가이드 외곽 이탈 픽셀 카운트
            const dx = x - centerX;
            const dy = y - centerY;
            if (dx * dx + dy * dy > outerLimitRadius * outerLimitRadius) {
              outerOverlapPixels += 16;
            }
          }
        }
      }
    }
  }

  let fillRatio = 0;
  let colorMatched = false;
  let detectedRect = null;

  // 전경 물체 감지 시 크기 판정 수행
  const hasDetectedObject = detectedForegroundCount > 25 && minX < maxX && minY < maxY;

  if (hasDetectedObject) {
    const objW = maxX - minX;
    const objH = maxY - minY;

    detectedRect = {
      x: Math.round((minX / width) * 100),
      y: Math.round((minY / height) * 100),
      width: Math.round((objW / width) * 100),
      height: Math.round((objH / height) * 100)
    };

    if (!mission.color) {
      // **[크기 미션 판정 (옵션 B)]**
      // 감지 영역 내부 채움률 계산 (새롭게 물체로 채워진 비율 %)
      const baseRatio = (overlappingPixels / areaPixelCount) * 100;
      fillRatio = Math.max(0, Math.min(100, Math.round(baseRatio)));
      colorMatched = true; // 크기 전용 미션은 색상 자동 매칭 성공 처리
    } else {
      // **[색상 & 혼합 미션 판정]**
      // 영역 내부 채움률 계산 (감점 패널티 가산)
      const baseRatio = (overlappingPixels / areaPixelCount) * 100;
      const penaltyRatio = (outerOverlapPixels / areaPixelCount) * 5;
      fillRatio = Math.max(0, Math.min(100, Math.round(baseRatio - penaltyRatio)));

      const targetMatchRatio = 0.30;
      colorMatched = overlappingPixels > 5 && (matchingColorPixels / overlappingPixels) >= targetMatchRatio;
    }
  } else {
    fillRatio = 0;
    colorMatched = false;
  }

  let cropDataUrl = null;
  // 크기 미션 성공 임계치를 30%로 조정하여 난이도를 극도로 단순화
  const successThreshold = mission.color ? 45 : 30;

  if (fillRatio >= successThreshold && colorMatched) {
    try {
      const tempCanvas = document.createElement('canvas');
      const halfSize = Math.round(pixelSize / 2);
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
    cropDataUrl,
    detectedRect
  };
}
