import { AVATAR_POSES, AVATAR_SEQUENCES } from './avatar-state.mjs';

// Decode before swapping; old/failed downloads never resurrect retired tasks.
export function createAvatarRenderer({ image, previous, load, reducedMotion = () => false, onPose = () => {} }) {
  let version = 0, desired = null, closed = false, fade = null;
  return {
    async show(pose, frame = 0) {
      const file = AVATAR_SEQUENCES[pose]?.[frame];
      if (closed || !file || desired === file) return;
      desired = file;
      const request = ++version;
      let src;
      try { src = await load(file); } catch { src = null; }
      if (closed || request !== version) return;
      if (!src) { desired = null; return; }
      fade?.cancel(); fade = null;
      if (previous && !reducedMotion() && image.getAttribute('src') !== src && typeof previous.animate === 'function') {
        previous.src = image.src; previous.hidden = false;
        image.src = src;
        const current = fade = previous.animate([{opacity:1},{opacity:0}], {duration:280,easing:'ease-out'});
        current.onfinish = () => { if (fade === current) { previous.hidden = true; fade = null; } };
      } else { image.src = src; if (previous) previous.hidden = true; }
      onPose(pose);
    },
    dispose() { closed = true; ++version; fade?.cancel(); if (previous) previous.hidden = true; },
  };
}

export function mountAvatar(document, window) {
  const small = window.matchMedia('(max-width: 900px)').matches || window.navigator.connection?.saveData;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cache = new Map();
  const load = file => {
    const url = './assets/' + (small ? file.replace('-512.webp','-256.webp') : file);
    if (!cache.has(url)) cache.set(url, new Promise(resolve => {
      const preload = new window.Image();
      preload.onload = async () => { try { await preload.decode?.(); resolve(url); } catch { cache.delete(url); resolve(null); } };
      preload.onerror = () => { cache.delete(url); resolve(null); };
      preload.src = url;
    }));
    return cache.get(url);
  };
  const renderer = createAvatarRenderer({image:document.getElementById('avatar'),previous:document.getElementById('avatarPrevious'),load,
    reducedMotion:reduced,onPose:pose => {document.body.dataset.avatarPose = pose;}});
  let task = 'idle', pose = 'idle', frame = 0, timer, completionTimer, disposed = false;
  let complete = false, completionId = null, style = 'focused';
  const render = () => {
    if (disposed) return;
    clearTimeout(timer);
    const connected = ['connected','ending'].includes(document.body.dataset.callState);
    if (!connected) { complete = false; clearTimeout(completionTimer); }
    const next = task !== 'idle' ? task : connected ? complete ? 'complete' : 'listen' : 'idle';
    if (next !== pose) { pose = next; frame = style === 'bright' ? 4 : style === 'curious' ? 3 : 0; }
    if (pose === 'idle' || reduced()) frame = 0;
    if (!document.hidden) {
      void renderer.show(pose, frame);
      // Only the current frame and one neighbor are loaded, never the gallery.
      if (!reduced() && pose !== 'idle') {
        const files = AVATAR_SEQUENCES[pose];
        void load(files[(frame+1)%files.length]);
        timer = setTimeout(() => {frame=(frame+1)%files.length;render();}, pose === 'listen' ? 4600 : 2400);
      }
    }
  };
  const observer = new window.MutationObserver(render);
  observer.observe(document.body,{attributes:true,attributeFilter:['data-call-state']});
  document.addEventListener('visibilitychange',render);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener?.('change',render);
  render();
  const dispose = () => {disposed=true;clearTimeout(timer);clearTimeout(completionTimer);observer.disconnect();document.removeEventListener('visibilitychange',render);motion.removeEventListener?.('change',render);renderer.dispose();};
  window.addEventListener('pagehide',dispose,{once:true});
  return {
    show(activity, outcome) {
      const changed = task !== activity;
      task = Object.hasOwn(AVATAR_POSES, activity) ? activity : 'idle';
      if (outcome?.id && outcome.id !== completionId) {
        completionId = outcome.id;
        if (outcome.ok && task === 'idle') {complete=true;clearTimeout(completionTimer);completionTimer=setTimeout(()=>{complete=false;render();},3200);}
      }
      if (task !== 'idle') {complete=false;clearTimeout(completionTimer);}
      if (changed || outcome?.id) render();
    },
    expression(value) {
      if (!['focused','curious','bright','calm'].includes(value)) return;
      style = value;
      frame = value === 'bright' ? 4 : value === 'curious' ? 3 : value === 'calm' ? 5 : 0;
      render();
    }, dispose,
  };
}
