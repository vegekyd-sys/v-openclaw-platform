// A controlled synthetic user microphone, transported as actual audio RTP.
// It never sends data-channel transcript, assistant content or backend events.
export const USER_PCM_SOURCE = "(" + function installSyntheticUserPcm() {
  const p = globalThis.__sharedH5Smoke;
  p.userClips = [];
  p.syntheticMicrophoneEnergyWindows = [];
  p.syntheticMicrophoneSources = [];
  p.playUserPcm = async (base64, label) => {
    const pc = p.pcs.at(-1);
    const pcIndex = p.pcs.length - 1;
    const sender = pc?.getSenders().find((value) => value.track?.kind === "audio");
    if (!sender || pc.connectionState !== "connected") return { error: "Connected real audio sender required" };
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const context = new AudioContext();
    const owned = { context, sender, previousTrack: sender.track, pc };
    p.syntheticMicrophoneSources.push(owned);
    try {
    const buffer = await context.decodeAudioData(bytes.buffer);
    const destination = context.createMediaStreamDestination();
    const source = context.createBufferSource();
    const analyser = context.createAnalyser();
    const gain = context.createGain();
    gain.gain.value = 0;
    analyser.fftSize = 1024;
    source.buffer = buffer;
    source.connect(destination);
    source.connect(analyser); analyser.connect(gain); gain.connect(context.destination);
    const previousTrack = sender.track;
    const track = destination.stream.getAudioTracks()[0];
    Object.assign(owned, { source, track });
    await context.resume();
    await sender.replaceTrack(track);
    const clip = { label, at: Date.now(), durationSeconds: buffer.duration, pcIndex, endedAt: null };
    owned.clip = clip;
    p.userClips.push(clip);
    const samples = new Float32Array(analyser.fftSize);
    owned.timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      if (rms > .005) p.syntheticMicrophoneEnergyWindows.push({ at: Date.now(), rms, label, pcIndex });
    }, 100);
    source.onended = () => {
      clip.endedAt = Date.now();
      clearInterval(owned.timer);
      const restore = pc.connectionState !== "closed" && sender.track === track ?
        sender.replaceTrack(previousTrack).catch(() => {}) : Promise.resolve();
      void restore.finally(() => { track.stop(); void context.close().catch(() => {}); });
    };
    source.start();
    return { ...clip };
    } catch (error) {
      clearInterval(owned.timer);
      try { owned.source?.stop(); } catch {}
      if (pc.connectionState !== "closed" && owned.track && sender.track === owned.track) {
        await sender.replaceTrack(owned.previousTrack).catch(() => {});
      }
      owned.track?.stop();
      await context.close().catch(() => {});
      return { error: error instanceof Error ? error.message : String(error) };
    }
  };
  p.stopUserPcm = async () => {
    for (const owned of p.syntheticMicrophoneSources) {
      clearInterval(owned.timer);
      try { owned.source?.stop(); } catch {}
      owned.track?.stop();
      await owned.context.close().catch(() => {});
    }
  };
}.toString() + ")()";
