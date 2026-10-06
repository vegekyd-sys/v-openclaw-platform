import { AVATAR_POSES } from './avatar-state.mjs';

// Image loading is independent of speech, microphone and tool execution.
export function createAvatarRenderer({ image, previous, load, reducedMotion = () => false, onPose = () => {} }) {
  let version = 0, desired = null, closed = false, fade = null;
  return {
    async show(pose) {
      if (closed || desired === pose || !Object.hasOwn(AVATAR_POSES, pose)) return;
      desired = pose;
      const request = ++version;
      let src;
      try { src = await load(AVATAR_POSES[pose]); } catch { src = null; }
      if (closed || request !== version) return;
      if (!src) { desired = null; return; } // Keep the last good image; permit retry.
      fade?.cancel(); fade = null;
      if (previous && !reducedMotion() && image.getAttribute('src') !== src && typeof previous.animate === 'function') {
        previous.src = image.src; previous.hidden = false;
        image.src = src;
        const current = fade = previous.animate([{opacity:1},{opacity:0}], {duration:340,easing:'ease-out'});
        current.onfinish = () => { if (fade === current) { previous.hidden = true; fade = null; } };
      } else { image.src = src; if (previous) previous.hidden = true; }
      onPose(pose);
    },
    dispose() { closed = true; ++version; fade?.cancel(); if (previous) previous.hidden = true; },
  };
}
export function mountAvatar(document, window) {
  const cache = new Map();
  const load = file => {
    if (!cache.has(file)) cache.set(file, new Promise(resolve => {
      const preload = new window.Image();
      preload.onload = () => resolve(`./assets/${file}`);
      preload.onerror = () => { cache.delete(file); resolve(null); };
      preload.src = `./assets/${file}`;
    }));
    return cache.get(file);
  };
  const renderer = createAvatarRenderer({ image:document.getElementById('avatar'), previous:document.getElementById('avatarPrevious'), load,
    reducedMotion:() => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    onPose:pose => { document.body.dataset.avatarPose = pose; } });
  void renderer.show('idle');
  // Warm the small fixed set before any tasks start; no timers or random poses.
  for (const file of Object.values(AVATAR_POSES)) void load(file);
  window.addEventListener('pagehide', () => renderer.dispose(), {once:true});
  return renderer;
}
