// Original, synthesized game cues. No recorded or third-party audio assets.
class SoundManager {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private active = true;
  private noise: AudioBuffer | null = null;
  private lastClick = -Infinity;
  get enabled(){return this.active;}
  set enabled(value:boolean){
    if(this.active===value)return;
    this.active=value;
    if(this.ctx&&this.bus){
      const t=this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setTargetAtTime(value?0.72:0,t,0.012);
    }
  }
  private getCtx(): AudioContext | null {
    if (!this.active || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
        this.bus=this.ctx.createGain();
        this.bus.gain.value=0.72;
        const limiter=this.ctx.createDynamicsCompressor();
        limiter.threshold.value=-14;limiter.ratio.value=8;limiter.attack.value=.003;limiter.release.value=.09;
        this.bus.connect(limiter);limiter.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch { return null; }
  }
  private glide(from:number,to:number,duration:number,type:OscillatorType='sine',volume=.11,delay=0){
    const ctx=this.getCtx();if(!ctx||!this.bus)return;
    const t=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(Math.max(30,to),t+duration*.85);
    gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(volume,t+Math.min(.012,duration*.2));gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(this.bus);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+duration+.01);
  }
  private sweep(duration=.24,from=400,to=2400,volume=.055,delay=0){
    const ctx=this.getCtx();if(!ctx||!this.bus)return;
    if(!this.noise){this.noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.5),ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}
    const t=ctx.currentTime+delay,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=this.noise;filter.type='bandpass';filter.Q.value=.9;filter.frequency.setValueAtTime(from,t);filter.frequency.exponentialRampToValueAtTime(to,t+duration);
    gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(volume,t+duration*.28);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.bus);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(t);source.stop(t+duration);
  }
  playClick(){
    if(!this.active)return;
    const now=typeof performance!=='undefined'?performance.now():Date.now();
    if(now-this.lastClick<65)return;this.lastClick=now;
    this.glide(910,610,.19,'triangle',.125);this.glide(245,120,.095,'sine',.10);this.sweep(.07,1800,700,.035);
  }
  playSelect(){this.glide(430,670,.20,'triangle',.13);this.glide(810,960,.115,'sine',.07,.07);}
  playNavigate(){this.sweep(.33,650,2900,.10);this.glide(250,185,.29,'sine',.12);}
  playDialog(){this.glide(590,430,.15,'triangle',.10);this.sweep(.16,2100,500,.045);}
  playSurprise(){this.sweep(.27,500,3200,.075);this.glide(420,550,.13,'triangle',.12);this.glide(810,1150,.22,'sine',.12,.12);}
  playCardDeal(){this.sweep(.40,2300,450,.09);this.glide(320,210,.22,'triangle',.13,.06);this.glide(710,490,.16,'sine',.07,.18);}
  playQuestionOpen(){this.sweep(.44,250,2600,.10);this.glide(270,420,.26,'triangle',.17);this.glide(565,815,.26,'sine',.13,.16);}
  playScoreCorrection(){this.glide(400,550,.13,'triangle',.12);this.glide(750,950,.21,'sine',.12,.11);}
  playTurnPass(){this.glide(375,240,.24,'triangle',.12);this.sweep(.16,1500,330,.045);}
  playStartRound(){this.sweep(.33,350,3400,.08);this.glide(360,490,.14,'triangle',.13);this.glide(620,860,.23,'sine',.13,.1);}
  playTick(urgent=false){this.glide(urgent?1050:690,urgent?900:590,.065,'triangle',urgent?.10:.045);}
  playTimeUp(){this.glide(360,190,.22,'triangle',.15);this.glide(245,130,.28,'triangle',.13,.16);}
  playReveal(){this.sweep(.41,400,3300,.085);this.glide(415,575,.18,'triangle',.17);this.glide(740,980,.27,'sine',.13,.14);}
  playFoul(delay=0){this.glide(290,110,.40,'triangle',.2,delay);this.glide(165,88,.26,'sine',.11,delay+.11);this.sweep(.23,1500,240,.04,delay);}
  playCorrect(delay=0){this.glide(465,620,.13,'triangle',.15,delay);this.glide(740,920,.16,'sine',.16,delay+.09);this.glide(1140,1320,.20,'sine',.12,delay+.20);this.sweep(.22,800,3300,.04,delay+.04);}
  playVictory(){this.playCorrect();this.glide(600,840,.20,'triangle',.15,.39);this.glide(970,1450,.39,'sine',.14,.55);}
}
export const soundFX = new SoundManager();
