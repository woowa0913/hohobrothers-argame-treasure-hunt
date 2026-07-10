import React, { useState, useEffect, useRef } from 'react';
import { useWebcam } from './hooks/useWebcam';
import { generateMissionPool } from './utils/missions';
import GameBoard from './components/GameBoard';
import { RefreshCw, CameraOff, Volume2, VolumeX } from 'lucide-react';

const BGM_PLAYLIST = [
  '/hoho_brothers.mp3',
  '/hoho_brothers_2.mp3'
];

export default function App() {
  const { videoRef, isOpenCVReady, startWebcam, stopWebcam, stream, error } = useWebcam();
  
  const [gameState, setGameState] = useState('LOBBY'); 
  const [gameMode, setGameMode] = useState('COOP'); // 'COOP' (1인용/협동) 또는 'VERSUS' (2인용 대결)
  const [selectedMissionCount, setSelectedMissionCount] = useState(5); // 보물 찾기 개수 (3, 5, 10, 15)

  // 1인용 / 협동 모드 게임 상태
  const [missionPool, setMissionPool] = useState([]);
  const [currentMissionIndex, setCurrentMissionIndex] = useState(0);
  const [gameScore, setGameScore] = useState(0);
  const [capturedTreasures, setCapturedTreasures] = useState([]);
  const [clearedCount, setClearedCount] = useState(0);

  // 2인용 대결 모드용 개별 게임 상태
  const [p1MissionPool, setP1MissionPool] = useState([]);
  const [p2MissionPool, setP2MissionPool] = useState([]);
  const [p1MissionIndex, setP1MissionIndex] = useState(0);
  const [p2MissionIndex, setP2MissionIndex] = useState(0);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1Captured, setP1Captured] = useState([]);
  const [p2Captured, setP2Captured] = useState([]);
  const [winner, setWinner] = useState(null); // 'P1', 'P2', 'DRAW'

  const [calibrationScale] = useState(1.1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('ar_treasure_high_score') || '0', 10);
  });

  // 오디오 관련 재생 상태 관리
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5); 
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const audioRef = useRef(null);

  // BGM 초기화 및 제어
  useEffect(() => {
    // 이전 오디오 재생 멈춤
    if (audioRef.current) {
      audioRef.current.pause();
    }

    audioRef.current = new Audio(BGM_PLAYLIST[currentTrackIndex]);
    audioRef.current.volume = volume;
    audioRef.current.muted = isMuted;

    // 만약 이미 재생 중이었다면 트랙이 바뀌었을 때 이어서 바로 재생
    if (gameState === 'PLAYING') {
      audioRef.current.play().catch(err => {
        console.warn("Autoplay block pending user interaction:", err);
      });
    }

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
  }, [currentTrackIndex, gameState]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  const initGame = async (selectedMode) => {
    setGameMode(selectedMode);
    
    if (selectedMode === 'COOP') {
      const pool = generateMissionPool().slice(0, selectedMissionCount);
      setMissionPool(pool);
      setCurrentMissionIndex(0);
      setGameScore(0);
      setClearedCount(0);
      setCapturedTreasures([]);
    } else {
      // 2인용 대결모드는 각각 독립적인 셔플 미션을 부여
      setP1MissionPool(generateMissionPool().slice(0, selectedMissionCount));
      setP2MissionPool(generateMissionPool().slice(0, selectedMissionCount));
      setP1MissionIndex(0);
      setP2MissionIndex(0);
      setP1Score(0);
      setP2Score(0);
      setP1Captured([]);
      setP2Captured([]);
      setWinner(null);
    }
    
    setGameState('PLAYING');
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

  const handleGoToHome = () => {
    stopWebcam();
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setGameState('LOBBY');
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

  // [중복 획득 방지 적용] - 1인용 미션 완료 처리
  const handleCompleteMission = (ratio, cropDataUrl) => {
    const scoreGain = Math.round(100 + ratio);
    const currentMission = missionPool[currentMissionIndex];

    setGameScore(prev => prev + scoreGain);
    setClearedCount(prev => prev + 1);

    if (cropDataUrl) {
      setCapturedTreasures(prev => {
        // 동일한 보물(이름이 같은 보물)이 이미 도감에 수집되어 있다면 추가하지 않음
        const isDuplicate = prev.some(t => t.name === (currentMission.title || '보물'));
        if (isDuplicate) return prev;
        return [
          ...prev, 
          { 
            image: cropDataUrl, 
            name: currentMission.title || '보물' 
          }
        ];
      });
    }

    playBeep(600, 0.15);
    setTimeout(() => playBeep(800, 0.2), 150);

    setTimeout(() => {
      moveToNextMission();
    }, 1500);
  };

  // [중복 획득 방지 적용] - 2인용 Player 1 미션 완료 처리
  const handleCompleteP1 = (ratio, cropDataUrl) => {
    const scoreGain = Math.round(100 + ratio);
    const currentMission = p1MissionPool[p1MissionIndex];

    setP1Score(prev => prev + scoreGain);

    if (cropDataUrl) {
      setP1Captured(prev => {
        const isDuplicate = prev.some(t => t.name === (currentMission.title || '보물'));
        if (isDuplicate) return prev;
        return [
          ...prev,
          { image: cropDataUrl, name: currentMission.title || '보물' }
        ];
      });
    }

    playBeep(600, 0.15);
    setTimeout(() => {
      if (p1MissionIndex + 1 < p1MissionPool.length) {
        setP1MissionIndex(prev => prev + 1);
      } else {
        endVersusGame('P1');
      }
    }, 1500);
  };

  // [중복 획득 방지 적용] - 2인용 Player 2 미션 완료 처리
  const handleCompleteP2 = (ratio, cropDataUrl) => {
    const scoreGain = Math.round(100 + ratio);
    const currentMission = p2MissionPool[p2MissionIndex];

    setP2Score(prev => prev + scoreGain);

    if (cropDataUrl) {
      setP2Captured(prev => {
        const isDuplicate = prev.some(t => t.name === (currentMission.title || '보물'));
        if (isDuplicate) return prev;
        return [
          ...prev,
          { image: cropDataUrl, name: currentMission.title || '보물' }
        ];
      });
    }

    playBeep(700, 0.15);
    setTimeout(() => {
      if (p2MissionIndex + 1 < p2MissionPool.length) {
        setP2MissionIndex(prev => prev + 1);
      } else {
        endVersusGame('P2');
      }
    }, 1500);
  };

  const handleTimeOut = (finalRatio) => {
    const scoreGain = Math.round(finalRatio);
    if (scoreGain > 0) {
      setGameScore(prev => prev + scoreGain);
    }
    playBeep(250, 0.3);
    moveToNextMission();
  };

  const handleTimeOutP1 = (finalRatio) => {
    playBeep(250, 0.3);
    if (p1MissionIndex + 1 < p1MissionPool.length) {
      setP1MissionIndex(prev => prev + 1);
    } else {
      endVersusGame();
    }
  };

  const handleTimeOutP2 = (finalRatio) => {
    playBeep(250, 0.3);
    if (p2MissionIndex + 1 < p2MissionPool.length) {
      setP2MissionIndex(prev => prev + 1);
    } else {
      endVersusGame();
    }
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

  const endVersusGame = (firstFinishedPlayer = null) => {
    setGameState('RESULT');
    if (firstFinishedPlayer) {
      setWinner(firstFinishedPlayer);
      return;
    }

    // 둘 다 타임아웃 종료 시 스코어가 높은 사람이 승리
    if (p1Score > p2Score) {
      setWinner('P1');
    } else if (p2Score > p1Score) {
      setWinner('P2');
    } else {
      setWinner('DRAW');
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
              <h2 className="text-3xl font-black Noto text-white">카메라를 켤 수 없�      {/* LOBBY 화면: 모드 및 보물 개수 선택 */}
      {gameState === 'LOBBY' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm z-40 p-4">
          <div className="max-w-2xl w-full bg-slate-900/90 border-4 border-slate-700/80 p-10 rounded-[50px] shadow-2xl text-center space-y-8">
            <span className="text-8xl animate-bounce inline-block">🎁</span>
            <div className="space-y-3">
              <h2 className="text-5xl font-extrabold tracking-tight Noto text-white">
                보물찾기 AR
              </h2>
              <p className="text-lg text-slate-300 font-bold Noto">
                주호와 서호를 위한 쉽고 재미있는 보물찾기 놀이!
              </p>
            </div>

            {!isOpenCVReady ? (
              <div className="space-y-3">
                <div className="inline-block w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-yellow-400 font-bold Noto">
                  AR 엔진(OpenCV)을 준비하고 있어요. 잠시만 기다려 주세요...
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* 보물 개수 선택 버튼 그룹 */}
                <div className="space-y-3">
                  <p className="text-sm text-slate-400 font-bold Noto">🎯 찾을 보물 개수를 선택해 보세요:</p>
                  <div className="flex gap-2 justify-center">
                    {[3, 5, 10, 15].map((count) => (
                      <button
                        key={count}
                        onClick={() => setSelectedMissionCount(count)}
                        className={`px-6 py-3 rounded-2xl text-lg font-black transition active:scale-95 border-b-4 ${
                          selectedMissionCount === count
                            ? 'bg-yellow-400 text-slate-950 border-yellow-600'
                            : 'bg-slate-800 text-slate-300 border-slate-950 hover:bg-slate-700'
                        }`}
                      >
                        {count === 15 ? '전체 (15)' : `${count}개`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 flex-col sm:flex-row justify-center mt-6">
                  <button
                    onClick={() => initGame('COOP')}
                    className="flex-1 py-6 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-950 text-2xl font-black rounded-3xl shadow-xl active:scale-[0.98] transition Noto border-b-8 border-amber-600"
                  >
                    👦 1인용 (협동 놀이)
                  </button>
                  <button
                    onClick={() => initGame('VERSUS')}
                    className="flex-1 py-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white text-2xl font-black rounded-3xl shadow-xl active:scale-[0.98] transition Noto border-b-8 border-indigo-700"
                  >
                    ⚔️ 2인용 (대결 놀이)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PLAYING 화면 */}
      {gameState === 'PLAYING' && (
        <>
          {/* 게임 진행 중 상단 우측 홈으로 가기 버튼 */}
          <button
            onClick={handleGoToHome}
            className="absolute top-6 right-12 z-30 bg-slate-900 hover:bg-slate-800 border-4 border-slate-700 px-6 py-3 rounded-2xl text-yellow-400 font-black text-lg pointer-events-auto transition active:scale-95 shadow-xl flex items-center gap-2 Noto"
          >
            🏠 홈으로
          </button>
          
          <div className="absolute inset-0 w-full h-full flex flex-row">
            {gameMode === 'COOP' ? (
              missionPool[currentMissionIndex] && (
                <GameBoard
                  videoRef={videoRef}
                  mission={missionPool[currentMissionIndex]}
                  calibrationScale={calibrationScale}
                  onCompleteMission={handleCompleteMission}
                  onTimeOut={handleTimeOut}
                  gameScore={gameScore}
                  capturedTreasures={capturedTreasures}
                  centerXPercent={0.5}
                  isVersusMode={false}
                />
              )
            ) : (
              // 2인용 대결 (화면 좌/우 분할)
              <>
                {p1MissionPool[p1MissionIndex] && (
                  <GameBoard
                    videoRef={videoRef}
                    mission={p1MissionPool[p1MissionIndex]}
                    calibrationScale={calibrationScale}
                    onCompleteMission={handleCompleteP1}
                    onTimeOut={handleTimeOutP1}
                    gameScore={p1Score}
                    capturedTreasures={p1Captured}
                    centerXPercent={0.75} // 미러링 때문에 화면 왼쪽(P1)은 카메라 원본 우측(75%) 분석
                    playerLabel="👦 주호 (Player 1)"
                    isVersusMode={true}
                  />
                )}
                {p2MissionPool[p2MissionIndex] && (
                  <GameBoard
                    videoRef={videoRef}
                    mission={p2MissionPool[p2MissionIndex]}
                    calibrationScale={calibrationScale}
                    onCompleteMission={handleCompleteP2}
                    onTimeOut={handleTimeOutP2}
                    gameScore={p2Score}
                    capturedTreasures={p2Captured}
                    centerXPercent={0.25} // 미러링 때문에 화면 오른쪽(P2)은 카메라 원본 좌측(25%) 분석
                    playerLabel="👶 서호 (Player 2)"
                    isVersusMode={true}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* RESULT 화면 */}
      {gameState === 'RESULT' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm z-40 p-4">
          <div className="max-w-xl w-full bg-slate-900/90 border-4 border-slate-700/80 p-10 rounded-[50px] shadow-2xl text-center space-y-8">
            <span className="text-8xl animate-bounce inline-block">👑</span>
            
            {gameMode === 'COOP' ? (
              // 1인용 결과 화면
              <div className="space-y-6">
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
                    <div className="flex gap-2 justify-center flex-wrap mt-2 max-h-32 overflow-y-auto p-1 bg-slate-900 rounded-xl">
                      {capturedTreasures.map((t, idx) => (
                        <div key={idx} className="w-12 h-12 border-2 border-yellow-400 rounded-lg overflow-hidden relative">
                          <img src={t.image} alt={t.name} className="w-full h-full object-cover scale-x-[-1]" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // 2인용 대결 결과 화면
              <div className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-4xl font-black Noto text-white">
                    {winner === 'DRAW' ? "🤝 무승부입니다!" : winner === 'P1' ? "🏆 주호(P1) 승리!" : "🏆 서호(P2) 승리!"}
                  </h2>
                  <p className="text-lg text-slate-300 font-bold Noto">서로 정말 잘 찾았어요!</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-indigo-500/30">
                    <p className="font-bold text-indigo-400">👦 주호 점수</p>
                    <p className="text-3xl font-black text-white">{p1Score}점</p>
                  </div>
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-rose-500/30">
                    <p className="font-bold text-rose-400">👶 서호 점수</p>
                    <p className="text-3xl font-black text-white">{p2Score}점</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 flex-col sm:flex-row">
              <button
                onClick={handleGoToHome}
                className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xl rounded-3xl active:scale-[0.98] transition border-b-4 border-slate-950"
              >
                🏠 홈으로 가기
              </button>
              <button
                onClick={() => initGame(gameMode)}
                className="flex-1 py-4 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-500 hover:to-teal-600 text-slate-950 text-xl font-black rounded-3xl shadow-xl active:scale-[0.98] transition Noto border-b-4 border-emerald-600"
              >
                🔄 한 번 더 하기!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}ed-2xl border border-indigo-500/30">
                    <p className="font-bold text-indigo-400">👦 주호 점수</p>
                    <p className="text-3xl font-black text-white">{p1Score}점</p>
                  </div>
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-rose-500/30">
                    <p className="font-bold text-rose-400">👶 서호 점수</p>
                    <p className="text-3xl font-black text-white">{p2Score}점</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => initGame(gameMode)}
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
