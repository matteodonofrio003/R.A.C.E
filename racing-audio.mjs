/* Procedural racing audio. No downloads; enabled only by a user gesture. */
export class RacingAudio {
  constructor() { this.context = null; this.enabled = false; this.volume = .35; this.gear = 1; }
  async toggle() {
    if (!this.context) this.create();
    await this.context.resume();
    this.enabled = !this.enabled;
    if (!this.enabled) this.silence();
    return this.enabled;
  }
  create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const c = this.context = new AudioContext();
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.ratio.value = 8;
    this.master = c.createGain(); this.master.gain.value = 0;
    this.master.connect(compressor); compressor.connect(c.destination);
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1200; filter.Q.value = .7;
    filter.connect(this.master); this.filter = filter;
    this.engine = [1, .5, 2.01].map((ratio, i) => {
      const oscillator = c.createOscillator(), gain = c.createGain();
      oscillator.type = i === 1 ? 'triangle' : 'sawtooth';
      gain.gain.value = [.045, .085, .015][i];
      oscillator.connect(gain); gain.connect(filter); oscillator.start();
      return { oscillator, ratio };
    });
    const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buffer; noise.loop = true;
    this.wind = c.createGain(); this.wind.gain.value = 0;
    const windFilter = c.createBiquadFilter();
    windFilter.type = 'lowpass'; windFilter.frequency.value = 700;
    noise.connect(windFilter); windFilter.connect(this.wind); this.wind.connect(this.master);
    this.gravel = c.createGain(); this.gravel.gain.value = 0;
    const gravelFilter = c.createBiquadFilter();
    gravelFilter.type = 'bandpass'; gravelFilter.frequency.value = 1900; gravelFilter.Q.value = .4;
    noise.connect(gravelFilter); gravelFilter.connect(this.gravel); this.gravel.connect(this.master);
    this.shift = c.createGain(); this.shift.gain.value = 0;
    noise.connect(this.shift); this.shift.connect(this.master); noise.start();
    this.tyre = c.createOscillator(); this.tyre.type = 'sine'; this.tyre.frequency.value = 850;
    this.squeal = c.createGain(); this.squeal.gain.value = 0;
    this.tyre.connect(this.squeal); this.squeal.connect(this.master); this.tyre.start();
  }
  silence() {
    if (this.context) this.master.gain.setTargetAtTime(0, this.context.currentTime, .03);
  }
  update({ rpm, speed, steer, gear, offtrack, active }) {
    if (!this.context) return;
    const t = this.context.currentTime;
    const set = (param, value, time = .06) => param.setTargetAtTime(value, t, time);
    set(this.master.gain, this.enabled && active ? this.volume : 0);
    // Four ignition events per revolution approximate a V8 exhaust note.
    for (const { oscillator, ratio } of this.engine) set(oscillator.frequency, rpm / 60 * 4 * ratio);
    set(this.filter.frequency, 650 + rpm * .32);
    set(this.wind.gain, .12 * Math.min(speed / 300, 1));
    set(this.gravel.gain, offtrack ? Math.min(speed / 90, 1) * .2 : 0);
    set(this.squeal.gain, !offtrack ? Math.max(0, Math.abs(steer) * speed / 140 - .35) * .018 : 0);
    set(this.tyre.frequency, 750 + Math.abs(steer) * 280);
    if (gear !== this.gear && active && this.enabled) {
      this.shift.gain.cancelScheduledValues(t);
      this.shift.gain.setValueAtTime(.10, t);
      this.shift.gain.exponentialRampToValueAtTime(.0001, t + .10);
    }
    this.gear = gear;
  }
  close() { this.context?.close(); }
}
