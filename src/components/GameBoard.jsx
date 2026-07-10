import React, { useState, useEffect, useRef } from 'react';
import { Star, Camera } from 'lucide-react';
import { processFrame } from '../utils/arEngine';

const COLOR_THEMES = {
  '빨강': { text: 'text-rose-500', border: 'border-rose-500', bg: 'bg-rose-500/20', fill: 'bg-rose-500' },
  '파랑': { text: 'text-blue-500', border: 'border-blue-500', bg: 'bg-blue-500/20', fill: 'bg-blue-500' },
  '노랑': { text: 'text-amber-400', border: 'border-amber-400', bg: 'bg-amber-400/20', fill: 'bg-amber-400' },
  '초록': { text: 'text-emerald-500', border: 'border-emerald-500', bg: 'bg-emerald-500/20', fill: 'bg-emerald-500' },
  '주황': { text: 'text-orange-500', border: 'border-orange-500', bg: 'bg-orange-500/20', fill: 'bg-orange-500' },
  '검정': { text: 'text-slate-400', border: 'border-slate-500', bg: 'bg-slate-500/20', fill: 'bg-slate-700' },
  'default': { text: 'text-yellow-400', border: 'border-yellow-400', bg: 'bg-yellow-400/20', fill: 'bg-yellow-400' }
};

export default function GameBoard({ 
  videoRef, 
  mission, 
  calibrationScale, 
  onCompleteMission, 
  onTimeOut, 
  gameScore, 
  capturedTreasures,
  centerXPercent = 0.5, 
  playerLabel = "", 
  isVersusMode = false
}) {
  const [fillRatio, setFillRatio] = useState(0);
  const [colorMatched, setColorMatched] = useState(false);
  const [timeLeft, setTimeLeft] = useState(mission.timeLimit || 30);
  const [isSuccess, setIsSuccess] = useState(false);
  const [detectedRect, setDetectedRect] = useState(null);

  // 배경 차분(Background Subtraction)용 오프라인 배경 이미지 버퍼 상태
  const [bgImageData, setBgImageData] = useState(null);
  const [isBgCapturing, setIsBgCapturing] = useState(true);
  const [bgCountdown, setBgCountdown] = useState(2); // 2초 카운트다운

  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const isCompletedRef = useRef(false);

  const theme = COLOR_THEMES[mission.color] || COLOR_THEMES['default'];

  // 미션이 바뀔 때마다 배경 초기화 및 카운트다운 트리거
  useEffect(() => {
    setTimeLeft(mission.timeLimit || 30);
    setIsSuccess(false);
    isCompletedRef.current = false;
    setFillRatio(0);
    setColorMatched(false);
    setDetectedRect(null);

    setBgImageData(null);
    setIsBgCapturing(true);
    setBgCountdown(2);
  }, [mission]);

  // 배경 캡처 카운트다운 타이머
  useEffect(() => {
    if (!isBgCapturing) return;

    if (bgCountdown <= 0) {
      // 0초에 도달하면 현재 카메라 화면을 배경(bgImageData)으로 스냅샷 저장
      if (videoRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        
        if (canvas.width > 0 && canvas.height > 0) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setBgImageData(snapshot);
          setIsBgCapturing(false);
        }
      }
      return;
    }

    const timer = setTimeout(() => {
      setBgCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [bgCountdown, isBgCapturing]);

  // 실시간 분석 루프
  useEffect(() => {
    let active = true;

    const analyze = () => {
      if (!active) return;
      // 배경 캡처 중이 아닐 때에만 영상 매칭 분석 루프 실행
      if (videoRef.current && canvasRef.current && window.cv && !isSuccess && !isCompletedRef.current && !isBgCapturing && bgImageData) {
        const result = processFrame(
          videoRef.current,
          canvasRef.current,
          bgImageData, // 촬영된 배경 버퍼 주입
          mission,
          calibrationScale,
          centerXPercent
        );
        
        setFillRatio(result.fillRatio);
        setColorMatched(result.colorMatched);
        setDetectedRect(result.detectedRect);

        // 합격 임계치: 색상이 있는 미션은 45%, 순수 크기 미션은 30% 영역 채움 일치 (옵션 B)
        const successThreshold = mission.color ? 45 : 30;

        if (result.fillRatio >= successThreshold && result.colorMatched && !isCompletedRef.current) {
          isCompletedRef.current = true;
          setIsSuccess(true);
          onCompleteMission(result.fillRatio, result.cropDataUrl);
        }
      } else {
        setDetectedRect(null);
      }
      requestRef.current = requestAnimationFrame(analyze);
    };

    requestRef.current = requestAnimationFrame(analyze);

    return () => {
      active = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [mission, calibrationScale, isSuccess, centerXPercent, isBgCapturing, bgImageData]);

  // 타이머
  useEffect(() => {
    if (isBgCapturing) return; // 배경 등록 동안에는 타이머 멈춤
    if (timeLeft <= 0) {
      if (!isCompletedRef.current) {
        isCompletedRef.current = true;
        onTimeOut(fillRatio);
      }
      return;
    }
    if (isSuccess) return;

    const timer = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, isSuccess, isBgCapturing]);

  const getOverlayStyle = () => {
    const sizePercentage = mission.sizePercent || 15;
    const sizeFactor = isVersusMode ? 1.3 : 1.8;
    const finalPercent = sizePercentage * calibrationScale * sizeFactor;
    
    return {
      width: `${Math.min(isVersusMode ? 45 : 75, finalPercent)}vh`,
      height: `${Math.min(isVersusMode ? 45 : 75, finalPercent)}vh`,
      maxWidth: isVersusMode ? '240px' : '480px',
      maxHeight: isVersusMode ? '240px' : '480px',
    };
  };

  return (
    <div className={`relative h-full flex flex-col justify-between select-none pointer-events-none z-10 ${isVersusMode ? 'w-1/2 border-r-4 border-dashed border-slate-700/50' : 'w-full'}`}>
      
      <canvas ref={canvasRef} className="hidden" />

      {/* 1. 실시간 보물 바운딩 테두리 */}
      {detectedRect && !isSuccess && !isBgCapturing && (
        <div 
          className="absolute border-4 border-dashed border-yellow-400 bg-yellow-400/10 rounded-2xl transition-all duration-75 flex items-start justify-end p-2 z-15 pointer-events-none"
          style={{
            left: isVersusMode 
              ? `${Math.max(0, Math.min(100, (100 - detectedRect.x - detectedRect.width) * 2 - (centerXPercent > 0.5 ? 100 : 0)))}%`
              : `${Math.max(0, Math.min(100, 100 - detectedRect.x - detectedRect.width))}%`,
            top: `${Math.max(0, Math.min(100, detectedRect.y))}%`,
            width: `${Math.max(2, Math.min(100, detectedRect.width * (isVersusMode ? 2 : 1)))}%`,
            height: `${Math.max(2, Math.min(100, detectedRect.height))}%`
          }}
        >
          <span className="bg-yellow-400 text-slate-950 font-black text-[9px] px-1.5 py-0.5 rounded shadow Noto">
            물체 감지 중! 📦
          </span>
        </div>
      )}

      {/* 2. 상단 미션 안내 스크린 */}
      <div className="w-full flex flex-col items-center pointer-events-none z-20 px-4 pt-4">
        <div className="bg-slate-950/90 border-4 border-slate-700/85 px-4 py-3 rounded-[24px] shadow-2xl flex flex-col items-center w-full text-center">
          
          {playerLabel && (
            <div className={`px-4 py-1 rounded-full text-xs font-black mb-2 text-white ${centerXPercent < 0.5 ? 'bg-indigo-600' : 'bg-rose-600'}`}>
              {playerLabel}
            </div>
          )}

          <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700 mb-2">
            <div 
              className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 8 ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`}
              style={{ width: `${(timeLeft / (mission.timeLimit || 30)) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-2 justify-center flex-wrap">
            <span className="text-xl">⭐</span>
            <span className={`${isVersusMode ? 'text-xl md:text-2xl' : 'text-3xl md:text-5xl'} font-black tracking-tight Noto text-white`}>
              {mission.color ? (
                <>
                  <span className={`${theme.text} ${isVersusMode ? 'text-2xl md:text-3xl' : 'text-4xl md:text-6xl'} mr-1 font-black`}>{mission.color}색</span>
                  보물을 가져와!
                </>
              ) : (
                <>
                  <span className="text-teal-400 ${isVersusMode ? 'text-2xl md:text-3xl' : 'text-4xl md:text-6xl'} mr-1 font-black">{mission.title}</span>
                  상자에 맞춰봐!
                </>
              )}
            </span>
          </div>

          {mission.color && (
            <div className="mt-1">
              <span className={`text-xs font-black ${colorMatched ? 'text-emerald-400' : 'text-slate-400'} Noto`}>
                {colorMatched ? "👍 우와! 똑같은 색이야!" : "👀 비슷한 색깔을 찾고 있어!"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. 중앙 타겟 영역 및 채움 게이지 */}
      <div className="absolute inset-x-0 bottom-1/4 flex items-center justify-center pointer-events-none z-10">
        <div 
          className={`border-[6px] border-dashed transition-all duration-200 relative flex items-center justify-center ${
            isSuccess 
              ? 'border-emerald-400 bg-emerald-500/35 scale-105 shadow-2xl' 
              : fillRatio > 20 
              ? `${theme.border} ${theme.bg} animate-pulse` 
              : 'border-white bg-black/20'
          } ${mission.shape === 'circle' ? 'rounded-full' : 'rounded-[30px]'}`}
          style={getOverlayStyle()}
        >
          <div 
            className={`absolute bottom-0 left-0 right-0 transition-all duration-200 ${theme.fill} opacity-40`}
            style={{ 
              height: `${fillRatio}%`, 
              borderRadius: mission.shape === 'circle' ? '0 0 9999px 9999px' : '0 0 24px 24px' 
             }}
          />
          
          <div className="bg-slate-950/90 px-4 py-2 rounded-xl border-2 border-slate-700/80 flex flex-col items-center">
            <span className="text-2xl font-black text-white Outfit">{fillRatio}%</span>
            <span className="text-[10px] text-slate-400 font-bold Noto">보물 채우기</span>
          </div>
        </div>
      </div>

      {/* 배경 촬영 대기(Calibration) 모달 오버레이 */}
      {isBgCapturing && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-16 h-16 bg-yellow-400/20 text-yellow-400 rounded-full flex items-center justify-center mb-4 animate-pulse">
            <Camera size={32} />
          </div>
          <h5 className="text-xl md:text-2xl font-black Noto text-white">📷 {playerLabel || "플레이어"} 배경 촬영 준비</h5>
          <p className="text-xs text-slate-300 mt-2 max-w-xs leading-relaxed Noto">
            물건과 몸을 가이드 밖으로 치우고 잠시 기다려 주세요! {bgCountdown}초 후 배경을 촬영합니다.
          </p>
          <div className="text-4xl font-extrabold text-yellow-400 Outfit mt-4 animate-ping">
            {bgCountdown}
          </div>
        </div>
      )}

      {/* 우측 하단 획득 점수 및 보물함 */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2 pointer-events-auto">
        <div className="bg-amber-400 text-slate-950 px-4 py-2 rounded-2xl border-2 border-amber-600 shadow-xl font-black flex items-center gap-2">
          <span className="text-xl">🏆</span>
          <span className="text-2xl Outfit">{gameScore}</span>
        </div>

        {capturedTreasures && capturedTreasures.length > 0 && (
          <div className="flex gap-1.5 max-w-[40vw] overflow-x-auto p-1 bg-slate-950/80 rounded-xl border border-slate-700/50">
            {capturedTreasures.map((treasure, idx) => (
              <div 
                key={idx} 
                className="w-10 h-10 bg-slate-900 border-2 border-yellow-400/80 rounded-lg overflow-hidden shadow relative flex-shrink-0"
              >
                <img 
                  src={treasure.image} 
                  alt="보물" 
                  className="w-full h-full object-cover scale-x-[-1]" 
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 성공 이펙트 */}
      {isSuccess && (
        <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center backdrop-blur-sm z-30 transition-all duration-300">
          <div className="bg-emerald-400 text-slate-950 p-4 rounded-full mb-3 animate-bounce border-4 border-white shadow-2xl">
            <Star size={40} fill="currentColor" />
          </div>
          <h4 className="text-3xl md:text-5xl font-black text-emerald-400 Noto drop-shadow-lg text-center">
            참 잘했어요! 👏
          </h4>
        </div>
      )}

    </div>
  );
}
