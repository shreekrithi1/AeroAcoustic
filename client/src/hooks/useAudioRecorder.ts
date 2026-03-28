import { useState, useRef, useCallback } from 'react';
import { bufferToWave } from '../utils/audioEncoder';

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      setAnalyser(analyserNode);
      source.connect(analyserNode);
      
      // We use ScriptProcessor for direct buffer access (deprecated but reliable for raw PCM)
      // or AudioWorklet for modern apps. For this demo, ScriptProcessor is easier to setup.
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      audioChunksRef.current = [];
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        audioChunksRef.current.push(new Float32Array(inputData));
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      setIsRecording(true);
      setAudioBlob(null);
    } catch (err) {
      console.error("Microphone access denied:", err);
      alert("Microphone access is required for lung analysis.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    
    setIsRecording(false);
    
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }

    // Process chunks into one buffer
    const totalLength = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.length, 0);
    const fullBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      fullBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    if (audioContextRef.current) {
        const audioBuffer = audioContextRef.current.createBuffer(1, fullBuffer.length, audioContextRef.current.sampleRate);
        audioBuffer.getChannelData(0).set(fullBuffer);
        
        const wavBlob = bufferToWave(audioBuffer, fullBuffer.length);
        setAudioBlob(wavBlob);
        
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
  }, [isRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    audioBlob,
    analyser
  };
};
