import React, { useState, useEffect, useRef } from 'react';
import { useWebcam } from './hooks/useWebcam';
import { generateMissionPool } from './utils/missions';
import GameBoard from './components/GameBoard';
import { RefreshCw, CameraOff, Volume2, VolumeX } from 'lucide-react';

// BGM 재생 목록 설정
const BGM_PLAYLIST = [
  '/hoho_brothers.mp3',
  '/hoho_brothers_2.mp3'
];

export default function App() {
  const { videoRef, isOpenCVReady, startWebcam, stopWebcam, stream, error } = useWebcam();
  
  const [gameState, setGameState] = useState('LOBBY'); 
  const [missionPool, setMissionPool] = useState([]);
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [gameScore, setGameScore] = useState(0);
  const [calibrationScale, setCalibrationScale] = useState(1.1);
  const [capturedTreasures, setCapturedTreasures] = useState([]);

  const [clearedCount, setClearedCount] = useState(0);
  const [fillRatios, setFillRatios] = useState([]);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('ar_treasure_high_score') || '0', 10);
  });

  // 오디오 관련 재생 상태 관리
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5); // 기본 볼륨 50%
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const audioRef = useRef(null);

  // BGM 초기화 및 제어
  useEffect(() => {
    // Audio 객체 생성
    audioRef.current = new Audio(BGM_PLAYLIST[currentTrackIndex]);
    audioRef.current.volume = volume;
    audioRef.current.muted = isMuted;

    // 노래가 끝나면 다음 트랙 자동 재생 설정
    const handleTrackEnd = () => {
      const nextIndex = (currentTrackIndex + 1) % BGM_PLAYLIST.length;
      setCurrentTrackIndex(nextIndex);
    };

    audioRef.current.addEventListener('ended', handleTrackEnd);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeEventListener('ended', handleTrackEnd);
      }
    };
  }, [currentTrackIndex]);

  // 볼륨 및 음소거 변경 실시간 동기화
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const initGame = async () => {
    const pool = generateMissionPool();
    setMissionPool(pool);
    setCurrentMissionIndex(0);
    setGameScore(0);
    setClearedCount(0);
    setFillRatios([]);
    setCapturedTreasures([]);
    setGameState('PLAYING');
    
    // 로비 터치 인터랙션 시점에 노래 강제 재생 시작
    playBGM();

    try {
      const activeStream = await startWebcam();
      if (videoRef.current && activeStream) {
        videoRef.current.srcObject = activeStream;
        await videoRef.current.play();
      }
    } catch (e) {
      console.warn("Failed to automatically play video stream:", e);
    }
  };

  const playBGM = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(err => {
        console.warn("Autoplay block bypassed during user click:", err);
      });
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  useEffect(() => {
    startWebcam().catch(err => {
      console.warn("Initial autoplay blocked. Waiting for lobby interaction.");
    });
    return () => {
      stopWebcam();
    };
  }, []);

  const handleCompleteMission = (ratio, cropDataUrl) => {
    const scoreGain = Math.round(100 + ratio);
    const currentMission = missionPool[currentMissionIndex];

    setGameScore(prev => prev + scoreGain);
    setClearedCount(prev => prev + 1);
    setFillRatios(prev => [...prev, ratio]);

    if (cropDataUrl) {
      setCapturedTreasures(prev => [
        ...prev, 
        { 
          image: cropDataUrl, 
          name: currentMission.title || '보물' 
        }
      ]);
    }

    playBeep(600, 0.15);
    setTimeout(() => playBeep(800, 0.2), 150);

    setTimeout(() => {
      moveToNextMission();
    }, 1500);
  };

  const handleTimeOut = (finalRatio) => {
    const scoreGain = Math.round(finalRatio);
    if (scoreGain > 0) {
      setGameScore(prev => prev + scoreGain);
      setFillRatios(prev => [...prev, finalRatio]);
    }
    playBeep(250, 0.3);
    moveToNextMission();
  };

  const moveToNextMission = () => {
    if (currentMissionIndex + 1 < missionPool.length) {
      setCurrentMissionIndex(prev => prev + 1);
    } else {
      endGame();
    }
  };

  const endGame = () => {
    setGameState('RESULT');
    if (gameScore > highScore) {
      setHighScore(gameScore);
      localStorage.setItem('ar_treasure_high_score', gameScore.toString());
    }
  };

  const playBeep = (freq, duration) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col justify-between font-sans select-none">
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-0"
        style={{ opacity: 1 }} 
      />

      {/* 좌측 상단 음악 제어기 (볼륨 & 음소거) */}
      <div className="absolute top-6 left-12 z-20 bg-slate-950/90 border-4 border-slate-700/80 px-4 py-3 rounded-2xl flex items-center gap-3 pointer-events-auto">
        <button 
          onClick={toggleMute}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-yellow-400 transition active:scale-95"
        >
          {isMuted ? <VolumeX size={24} /> : <Volume2 size={24} />}
        </button>
        
        {/* 아동 친화적 넓직한 볼륨 슬라이더 */}
        <div className="flex flex-col w-24">
          <input 
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="w-full accent-yellow-400 cursor-pointer h-2 bg-slate-700 rounded-lg appearance-none"
          />
        </div>
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/95 z-50 p-6">
          <div className="max-w-xl w-full bg-slate-900 border-4 border-rose-500/80 p-8 rounded-[40px] shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <CameraOff size={40} />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-black Noto text-white">카메라를 켤 수 없어요!</h2>
              <p className="text-sm text-slate-300 leading-relaxed Noto">
                브라우저 보안 규칙으로 인해 카메라 사용이 거부되었습니다.<br />
                아래 해결 방법을 확인해 주세요.
              </p>
            </div>

            <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 text-left space-y-3 text-xs leading-relaxed text-slate-300 Noto">
              <p>📌 <b>해결 방법:</b></p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Vite 개발용 IP가 아닌 <b><span className="text-yellow-400">http://localhost:5173</span></b> 주소로 직접 입력하여 접속해 주세요.</li>
                <li>브라우저 주소창 왼쪽의 <b>[자물쇠/설정] 아이콘</b>을 눌러 카메라 권한을 <b>허용</b>으로 변경해 주세요.</li>
                <li>다른 앱(줌, 디스코드 등)에서 카메라를 이미 쓰고 있다면 해당 앱을 종료해 주세요.</li>
              </ul>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl transition active:scale-[0.98] Noto"
            >
              새로고침하고 다시 시도
            </button>
          </div>
        </div>
      )}

      {/* LOBBY 화면 */}
      {gameState === 'LOBBY' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm z-40 p-4">
          <div className="max-w-xl w-full bg-slate-900/90 border-4 border-slate-700/80 p-10 rounded-[50px] shadow-2xl text-center space-y-8">
            <span className="text-8xl animate-bounce inline-block">🎁</span>
            <div className="space-y-3">
              <h2 className="text-5xl font-extrabold tracking-tight Noto text-white">
                보물찾기 AR
              </h2>
              <p className="text-lg text-slate-300 font-bold Noto">
                주호와 서호를 위한 쉽고 재미있는 보물찾기 놀이!
              </p>
            </div>

            <button
              onClick={initGame}
              className="w-full py-6 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 text-3xl font-black rounded-3xl shadow-xl active:scale-[0.98] transition Noto border-b-8 border-amber-600"
            >
              게임 시작하기!
            </button>
          </div>
        </div>
      )}

      {/* PLAYING 화면 */}
      {gameState === 'PLAYING' && missionPool[currentMissionIndex] && (
        <GameBoard
          videoRef={videoRef}
          mission={missionPool[currentMissionIndex]}
          calibrationScale={calibrationScale}
          onCompleteMission={handleCompleteMission}
          onTimeOut={handleTimeOut}
          gameScore={gameScore}
          capturedTreasures={capturedTreasures}
        />
      )}

      {/* RESULT 화면 */}
      {gameState === 'RESULT' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm z-40 p-4">
          <div className="max-w-xl w-full bg-slate-900/90 border-4 border-slate-700/80 p-10 rounded-[50px] shadow-2xl text-center space-y-8">
            <span className="text-8xl animate-bounce inline-block">👑</span>
            <div className="space-y-3">
              <h2 className="text-4xl font-black Noto text-white">대단해요! 최고에요!</h2>
              <p className="text-lg text-slate-300 font-bold Noto">모든 보물을 다 찾았어요!</p>
            </div>

            <div className="bg-slate-950/60 p-8 rounded-3xl border-2 border-slate-800 space-y-4">
              <p className="text-2xl text-slate-300 Noto">
                얻은 점수: <span className="text-4xl font-mono font-black text-yellow-400">{gameScore}점</span>
              </p>
              <p className="text-lg text-slate-400 Noto">
                성공한 개수: <span className="text-2xl font-bold text-teal-400">{clearedCount}개</span>
              </p>

              {capturedTreasures.length > 0 && (
                <div className="flex gap-2 justify-center flex-wrap mt-2 max-h-36 overflow-y-auto p-1 bg-slate-900 rounded-xl">
                  {capturedTreasures.map((t, idx) => (
                    <div key={idx} className="w-12 h-12 border-2 border-yellow-400 rounded-lg overflow-hidden relative">
                      <img src={t.image} alt={t.name} className="w-full h-full object-cover scale-x-[-1]" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={initGame}
              className="w-full py-6 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-slate-950 text-2xl font-black rounded-3xl shadow-xl active:scale-[0.98] transition Noto border-b-8 border-emerald-600"
            >
              한 번 더 하기!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
