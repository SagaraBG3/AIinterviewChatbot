// @/utils/voice-activity-detection.ts
export class VAD {
    private audioContext: AudioContext;
    private analyser: AnalyserNode;
    private source: MediaStreamAudioSourceNode;
    private options: {
      minNoiseLevel?: number;
      maxNoiseLevel?: number;
      averageNoiseDb?: number;
    };
    private speakingCallback?: (data: any) => void;
    private silentCallback?: () => void;
    private animationFrameId?: number;
  
    constructor({
      audioContext, 
      source, 
      options = {},
      onSpeaking,
      onSilent
    }: {
      audioContext: AudioContext,
      source: MediaStreamAudioSourceNode,
      options?: {
        minNoiseLevel?: number;
        maxNoiseLevel?: number;
        averageNoiseDb?: number;
      },
      onSpeaking?: (data: any) => void,
      onSilent?: () => void
    }) {
      this.audioContext = audioContext;
      this.source = source;
      this.options = {
        minNoiseLevel: options.minNoiseLevel || 0.3,
        maxNoiseLevel: options.maxNoiseLevel || 0.7,
        averageNoiseDb: options.averageNoiseDb || -50
      };
      this.speakingCallback = onSpeaking;
      this.silentCallback = onSilent;
  
      this.setupAnalyser();
    }
  
    private setupAnalyser() {
      this.analyser = this.audioContext.createAnalyser();
      this.source.connect(this.analyser);
      this.analyser.fftSize = 2048;
    }
  
    on(event: 'speaking' | 'silent', callback: (data?: any) => void) {
      if (event === 'speaking') {
        this.speakingCallback = callback;
      } else if (event === 'silent') {
        this.silentCallback = callback;
      }
      this.startMonitoring();
    }
  
    private startMonitoring() {
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
  
      const checkVoiceActivity = () => {
        this.analyser.getByteTimeDomainData(dataArray);
        
        // Simple voice activity detection
        const volume = this.calculateVolume(dataArray);
        const isSpeaking = this.isVoiceDetected(volume);
  
        if (isSpeaking && this.speakingCallback) {
          this.speakingCallback({ 
            volume, 
            timestamp: Date.now() 
          });
        } else if (!isSpeaking && this.silentCallback) {
          this.silentCallback();
        }
  
        // Continue monitoring
        this.animationFrameId = requestAnimationFrame(checkVoiceActivity);
      };
  
      this.animationFrameId = requestAnimationFrame(checkVoiceActivity);
    }
  
    private calculateVolume(dataArray: Uint8Array): number {
      const normalizedData = dataArray.map(sample => (sample - 128) / 128);
      const sumSquared = normalizedData.reduce((sum, sample) => sum + sample * sample, 0);
      return Math.sqrt(sumSquared / dataArray.length);
    }
  
    private isVoiceDetected(volume: number): boolean {
      const { minNoiseLevel, maxNoiseLevel } = this.options;
      return volume > (minNoiseLevel || 0.3) && volume < (maxNoiseLevel || 0.7);
    }
  
    destroy() {
      // Cancel any ongoing animation frame
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
      }
  
      // Disconnect audio nodes
      if (this.source) {
        this.source.disconnect();
      }
      if (this.analyser) {
        this.analyser.disconnect();
      }
    }
  }
  
  export default {
    VAD
  };