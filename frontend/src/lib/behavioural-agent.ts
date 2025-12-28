// Behavioural Biometrics JS Agent
// Captures typing patterns, mouse movements, and device fingerprint

interface KeystrokeEvent {
  timestamp: number;
  key: string;
}

interface MouseEvent {
  x: number;
  y: number;
  timestamp: number;
}

class BehaviouralAgent {
  private keystrokeTimings: number[] = [];
  private mouseMovements: MouseEvent[] = [];
  private startTime: number = Date.now();
  private deviceFingerprint: string = '';

  constructor() {
    this.initialize();
  }

  private initialize() {
    this.deviceFingerprint = this.generateDeviceFingerprint();
    this.startTime = Date.now();
    this.setupEventListeners();
  }

  private generateDeviceFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Device fingerprint', 2, 2);
    }
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL(),
    ].join('|');
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(36);
  }

  private setupEventListeners() {
    // Keystroke timing
    let lastKeyTime = Date.now();
    document.addEventListener('keydown', (e) => {
      const now = Date.now();
      const timing = now - lastKeyTime;
      this.keystrokeTimings.push(timing);
      lastKeyTime = now;
    });

    // Mouse movement
    document.addEventListener('mousemove', (e) => {
      this.mouseMovements.push({
        x: e.clientX,
        y: e.clientY,
        timestamp: Date.now(),
      });
    });
  }

  public getData() {
    return {
      keystrokeTimings: this.keystrokeTimings.slice(-50), // Last 50 keystrokes
      mouseMovements: this.mouseMovements.slice(-100), // Last 100 movements
      deviceFingerprint: this.deviceFingerprint,
    };
  }

  public reset() {
    this.keystrokeTimings = [];
    this.mouseMovements = [];
    this.startTime = Date.now();
  }
}

export const behaviouralAgent = new BehaviouralAgent();

