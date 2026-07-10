import { useState, useEffect, useRef } from 'react';

export function useWebcam() {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isOpenCVReady, setIsOpenCVReady] = useState(false);
  const videoRef = useRef(null);

  // OpenCV.js 준비 상태 확인
  useEffect(() => {
    let interval;
    const checkOpenCV = () => {
      if (window.cv && window.cv.Mat && window.cv.imread) {
        setIsOpenCVReady(true);
        if (interval) clearInterval(interval);
        return true;
      }
      return false;
    };

    if (!checkOpenCV()) {
      // 만약 아직 로드가 다 안됐다면 window.Module 이벤트를 함께 대기하거나 주기적으로 폴링
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          setIsOpenCVReady(true);
        };
      }
      interval = setInterval(checkOpenCV, 200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const startWebcam = async () => {
    if (stream && stream.active) {
      if (videoRef.current && videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn("Play interrupted:", e);
        }
      }
      return stream;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: 1.777777778,
          facingMode: 'user'
        },
        audio: false
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // 메타데이터가 완전히 올라온 시점에 명시적으로 play() 트리거
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
          } catch (e) {
            console.error("Video element play request failed:", e);
          }
        };
      }
      
      setError(null);
      return mediaStream;
    } catch (err) {
      console.error("Camera access failed:", err);
      setError(err.name || "CameraError");
      throw err;
    }
  };

  const stopWebcam = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  return {
    videoRef,
    stream,
    error,
    isOpenCVReady,
    startWebcam,
    stopWebcam
  };
}
