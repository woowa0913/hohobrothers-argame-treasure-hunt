import React, { useState, useEffect, useRef } from 'react';
import { Star, Award } from 'lucide-react';
import { processFrame } from '../utils/arEngine';

const COLOR_THEMES = {
  '빨강': { text: 'text-rose-500', border: 'border-rose-500', bg: 'bg-rose-500/20', fill: 'bg-rose-500' },
  '파랑': { text: 'text-blue-500', border: 'border-blue-500', bg: 'bg-blue-500/20', fill: 'bg-blue-500' },
  '노랑': { text: 'text-amber-400', border: 'border-amber-400', bg: 'bg-amber-400/20', fill: 'bg-amber-400' },
  '초록': { text: 'text-emerald-500', border: 'border-emerald-500', bg: 'bg-emerald-500/20', fill: 'bg-emerald-500' },
  'default': { text: 'text-yellow-400', border: 'border-yellow-400', bg: 'bg-yellow-400/20', fill: 'bg-yellow-400' }
};

export default function GameBoard({ videoRef, mission, calibrationScale, onCompleteMission, onTimeOut, gameScore, capturedTreasures }) {
  const [fillRatio, setFillRatio] = useState(0);
  const [colorMatched, setColorMatched] = useState(false);
  const [timeLeft, setTimeLeft] = useState(mission.timeLimit || 30);
  const [isSuccess, setIsSuccess] = useState(false);

  const canvasRef = useRef(null);
  const requestRef = useRef(null);

  const theme = COLOR_THEMES[mission.color] || COLOR_THEMES['default'];

  useEffect(() => {
    setTimeLeft(mission.timeLimit || 30);
    setIsSuccess(false);
    setFillRatio(0);
    setColorMatched(false);
  }, [mission]);

  // 실시간 카메라 분석 루프
  useEffect(() => {
    let active = true;

    const analyze = () => {
      if (!active) return;
      if (videoRef.current && canvasRef.current && window.cv && !isSuccess) {
        const result = processFrame(
          videoRef.current,
          canvasRef.current,
          null, 
          mission,
          calibrationScale
        );
        setFillRatio(result.fillRatio);
        setColorMatched(result.colorMatched);

        // 영역 채움 및 색상 매칭 완료 판정
        if (result.fillRatio >= 65 && result.colorMatched) {
          setIsSuccess(true);
          // 캡처된 보물 크롭 이미지 주소(result.cropDataUrl)도 콜백에 실어서 전달
          onCompleteMission(result.fillRatio, result.cropDataUrl);
        }
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
  }, [mission, calibrationScale, isSuccess]);

  // 카운트다운 타이머
  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeOut(fillRatio);
      return;
    }
    if (isSuccess) return;

    const timer = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, isSuccess]);

  const getOverlayStyle = () => {
    const sizePercentage = mission.sizePercent || 15;
    const finalPercent = sizePercentage * calibrationScale * 1.8;
    
    return {
      width: `${Math.min(75, finalPercent)}vh`,
      height: `${Math.min(75, finalPercent)}vh`,
      maxWidth: '480px',
      maxHeight: '480px',
    };
  };

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none z-10">
      
      <canvas ref={canvasRef} className="hidden" />

      {/* 상단 미션 바 */}
      <div className="absolute top-6 left-12 right-12 flex flex-col items-center pointer-events-none z-20">
        <div className="bg-slate-950/90 border-4 border-slate-700/85 px-10 py-6 rounded-[35px] shadow-2xl flex flex-col items-center max-w-4xl w-full text-center">
          
          {/* 타이머 바 */}
          <div className="w-full h-5 bg-slate-800 rounded-full overflow-hidden border-2 border-slate-700 mb-4">
            <div 
              className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 8 ? 'bg-rose-500 animate-pulse' : 'bg-amber-400'}`}
              style={{ width: `${(timeLeft / (mission.timeLimit || 30)) * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-4 justify-center">
            <span className="text-4xl">⭐</span>
            <span className="text-5xl md:text-7xl font-black tracking-tight Noto text-white">
              {mission.color ? (
                <>
                  <span className={`${theme.text} text-6xl md:text-8xl mr-3 font-black`}>{mission.color}색</span>
                  보물을 가져와!
                </>
              ) : (
                <>
                  <span className="text-teal-400 text-6xl md:text-8xl mr-3 font-black">{mission.title}</span>
                  상자에 맞춰봐!
                </>
              )}
            </span>
          </div>

          {mission.color && (
            <div className="mt-3">
              <span className={`text-xl font-black ${colorMatched ? 'text-emerald-400' : 'text-slate-400'} Noto`}>
                {colorMatched ? "👍 우와! 똑같은 색이야!" : "👀 비슷한 색깔을 찾고 있어!"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 중앙 타겟 영역 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div 
          className={`border-[8px] border-dashed transition-all duration-200 relative flex items-center justify-center ${
            isSuccess 
              ? 'border-emerald-400 bg-emerald-500/35 scale-105 shadow-2xl' 
              : fillRatio > 25 
              ? `${theme.border} ${theme.bg} animate-pulse` 
              : 'border-white bg-black/20'
          } ${mission.shape === 'circle' ? 'rounded-full' : 'rounded-[40px]'}`}
          style={getOverlayStyle()}
        >
          <div 
            className={`absolute bottom-0 left-0 right-0 transition-all duration-200 ${theme.fill} opacity-40`}
            style={{ 
              height: `${fillRatio}%`, 
              borderRadius: mission.shape === 'circle' ? '0 0 9999px 9999px' : '0 0 32px 32px' 
            }}
          />
          
          <div className="bg-slate-950/90 px-6 py-3 rounded-2xl border-4 border-slate-700/80 flex flex-col items-center">
            <span className="text-3xl font-black text-white Outfit">{fillRatio}%</span>
            <span className="text-xs text-slate-400 font-bold Noto">보물 채우기</span>
          </div>
        </div>
      </div>

      {/* 우측 레이아웃: 현재 획득 점수 및 획득한 보물 사진 리스트 (크롭 갤러리) */}
      <div className="absolute top-6 right-12 z-20 flex flex-col items-end gap-4 pointer-events-auto">
        {/* 점수판 */}
        <div className="bg-amber-400 text-slate-950 px-8 py-4 rounded-3xl border-4 border-amber-600 shadow-xl font-black flex items-center gap-3">
          <span className="text-3xl">🏆</span>
          <span className="text-4xl Outfit">{gameScore}</span>
        </div>

        {/* 찾은 보물 크롭 목록 스택 (점수판 아래 세로로 누적 노출) */}
        {capturedTreasures && capturedTreasures.length > 0 && (
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2 py-2 items-end">
            <p className="text-xs font-black text-slate-300 Noto bg-slate-950/80 px-3 py-1.5 rounded-full border border-slate-700/50">
              찾아낸 보물함 💎
            </p>
            {capturedTreasures.map((treasure, idx) => (
              <div 
                key={idx} 
                className="w-20 h-20 bg-slate-900 border-4 border-yellow-400/80 rounded-2xl overflow-hidden shadow-2xl relative group transform hover:scale-105 transition-all rotate-2"
              >
                <img 
                  src={treasure.image} 
                  alt="보물 캡처" 
                  className="w-full h-full object-cover scale-x-[-1]" 
                />
                <div className="absolute bottom-0 inset-x-0 bg-yellow-400/90 text-slate-950 text-[9px] font-black text-center py-0.5 Noto">
                  {treasure.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 미션 클리어 성공 오버레이 */}
      {isSuccess && (
        <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center backdrop-blur-sm z-30 transition-all duration-300">
          <div className="bg-emerald-400 text-slate-950 p-8 rounded-full mb-6 animate-bounce border-8 border-white shadow-2xl">
            <Star size={80} fill="currentColor" />
          </div>
          <h4 className="text-6xl md:text-8xl font-black text-emerald-400 Noto drop-shadow-lg">
            참 잘했어요! 👏
          </h4>
          <p className="text-2xl text-slate-200 mt-4 font-bold Noto">다음 보물을 찾아볼까요?</p>
        </div>
      )}

    </div>
  );
}
