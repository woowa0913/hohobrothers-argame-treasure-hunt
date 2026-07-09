// 미션 카드에 따른 분석을 수행하는 AR 엔진 (OpenCV.js 기반)

export function isColorMatch(h, s, v, colorName) {
  switch (colorName) {
    case '빨강':
      return ((h >= 0 && h <= 12) || (h >= 168 && h <= 180)) && s >= 45 && v >= 35;
    case '파랑':
      return h >= 90 && h <= 135 && s >= 45 && v >= 35;
    case '노랑':
      return h >= 14 && h <= 28 && s >= 55 && v >= 60;
    case '초록':
      return h >= 29 && h <= 88 && s >= 30 && v >= 35;
    default:
      return false;
  }
}

export function isSkinColor(h, s, v) {
  return h >= 3 && h <= 17 && s >= 40 && s <= 150 && v >= 50;
}

export function processFrame(videoElement, canvasElement, bgMat, mission, calibrationScale = 1.0) {
  if (!window.cv || !videoElement || !canvasElement) return { fillRatio: 0, colorMatched: false, cropDataUrl: null, detectedRect: null };

  const cv = window.cv;
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  if (width === 0 || height === 0) return { fillRatio: 0, colorMatched: false, detectedRect: null };

  canvasElement.width = width;
  canvasElement.height = height;

  const ctx = canvasElement.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, width, height);

  const shape = mission.shape || 'circle';
  const sizeMultiplier = calibrationScale; 
  const sizePercentage = mission.sizePercent || 15; 
  const pixelSize = Math.round(Math.min(width, height) * (sizePercentage / 100) * sizeMultiplier * 1.5);

  const centerX = Math.round(width / 2);
  const centerY = Math.round(height * 0.58); 
  
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

  // 물체 크기 초과(벌점) 판정을 위한 외곽 바운딩 영역 정의
  // 점선 영역의 1.35배 영역을 초과하는 픽셀 검사용
  const outerLimitRadius = Math.round(pixelSize * 1.35 / 2);
  let outerOverlapPixels = 0;

  // 물체의 실시간 경계 상자(Bounding Box) 추적용 좌표
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;
  let detectedForegroundCount = 0;

  // 픽셀 분석을 미션 중심부의 1.8배 범위까지 넓혀 외곽 초과 감시 및 크롭 영역 매핑
  const maxSearchHalf = Math.round(pixelSize * 1.8 / 2);
  const startX = Math.max(0, centerX - maxSearchHalf);
  const endX = Math.min(width - 1, centerX + maxSearchHalf);
  const startY = Math.max(0, centerY - maxSearchHalf);
  const endY = Math.min(height - 1, centerY + maxSearchHalf);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const idx = (y * width + x) * 4;
      const hsvIdx = (y * width + x) * 3;
      const h = hsv.data[hsvIdx];     
      const s = hsv.data[hsvIdx + 1]; 
      const v = hsv.data[hsvIdx + 2]; 

      // 피부색 감지 시 건너뜀 (손 제외 기능 완벽 지원)
      if (isSkinColor(h, s, v)) {
        continue;
      }

      // 전경 물체 식별
      const isForeground = s > 12 && v > 30;

      if (isForeground) {
        // 물체 경계 상자 트래킹 업데이트
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        detectedForegroundCount++;

        // 1) 점선 영역 내부 픽셀 겹침
        if (inMissionArea(x, y)) {
          overlappingPixels++;
          if (mission.color) {
            if (isColorMatch(h, s, v, mission.color)) {
              matchingColorPixels++;
            }
          }
        } else {
          // 2) 점선 외부 1.35배 영역 밖으로 과도하게 침범한 경우
          const dx = x - centerX;
          const dy = y - centerY;
          if (dx * dx + dy * dy > outerLimitRadius * outerLimitRadius) {
            outerOverlapPixels++;
          }
        }
      }
    }
  }

  // 채움 비율 계산: 내부 채움률 - 외부 이탈 벌점율
  const baseRatio = (overlappingPixels / areaPixelCount) * 100;
  // 바깥으로 많이 삐져나가면 최종 채움률을 깎아버림 (1.35배 반경 밖 초과 픽셀 1개당 감점 가중치 적용)
  const penaltyRatio = (outerOverlapPixels / areaPixelCount) * 40; 
  const fillRatio = Math.max(0, Math.min(100, Math.round(baseRatio - penaltyRatio)));
  
  let colorMatched = false;
  if (mission.color) {
    const targetMatchRatio = 0.35;
    colorMatched = overlappingPixels > 10 && (matchingColorPixels / overlappingPixels) >= targetMatchRatio;
  } else {
    colorMatched = true;
  }

  // 실시간 보물 바운딩 박스 데이터 구성 (손 배제된 좌표)
  let detectedRect = null;
  if (detectedForegroundCount > 40) { // 노이즈 방지 최소 픽셀값
    detectedRect = {
      x: Math.round((minX / width) * 100),
      y: Math.round((minY / height) * 100),
      width: Math.round(((maxX - minX) / width) * 100),
      height: Math.round(((maxY - minY) / height) * 100)
    };
  }

  let cropDataUrl = null;
  if (fillRatio >= 65 && colorMatched) {
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
