import { avatarPicture, avatarVariants } from './avatar-catalog.mjs';
import { AVATAR_POSES, AVATAR_SEQUENCES } from './avatar-state.mjs';

export const MAX_REACTION_DWELL_MS = 5000;
export const THINKING_POSE_DWELL_MS = MAX_REACTION_DWELL_MS;

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
      onPose(pose, frame);
    },
    dispose() { closed = true; ++version; fade?.cancel(); if (previous) previous.hidden = true; },
  };
}

export function mountAvatar(document, window) {
  const small = window.matchMedia('(max-width: 900px)').matches || window.navigator.connection?.saveData;
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cache = new Map(), decoded = new Set();
  const load = file => {
    const url = './assets/' + (small ? file.replace('-512.webp','-256.webp') : file);
    if (!cache.has(url)) cache.set(url, new Promise(resolve => {
      const preload = new window.Image();
      preload.onload = async () => { try { await preload.decode?.(); decoded.add(file); resolve(url); } catch { cache.delete(url); resolve(null); } };
      preload.onerror = () => { cache.delete(url); resolve(null); };
      preload.src = url;
    }));
    return cache.get(url);
  };
  let anchor = null, displayed = null, task = 'idle', disposed = false;
  let timer, deadline, lastPictureAt = -Infinity, recent = [], phase = 0, fallback = 'listen-5';
  const connected = () => ['connected','ending'].includes(document.body.dataset.callState);
  const fileFor = id => { const p=avatarPicture(id);return p && AVATAR_SEQUENCES[p.scene][p.frame]; };
  const clearTimers = () => {clearTimeout(timer);clearTimeout(deadline);};
  const chooseVariation = () => {
    const reaction=anchor??displayed,id=reaction?.id;
    const ids=[...avatarVariants(id),id].filter(id=>id&&!(reaction.family==='attentive'&&reaction.dialogue!=='welcome'&&avatarPicture(id).dialogue==='welcome'));
    const fresh=ids.filter(id=>id!==displayed?.id&&!recent.slice(-2).includes(id));
    return fresh[phase%fresh.length] ?? ids.find(id=>id!==displayed?.id)
      ?? (displayed?.id==='listen-5'?'listen-3':'listen-5');
  };
  const show = id => {const p=avatarPicture(id);if(p&&!disposed&&!document.hidden)void renderer.show(p.scene,p.frame);};
  const schedule = () => {
    clearTimers();if(disposed||document.hidden||!connected()||!displayed)return;
    const next=chooseVariation();void load(fileFor(next));
    // Preload one compatible neighbor. Start the swap early enough to decode;
    // if its download stalls, use an already decoded calm listening portrait.
    const remaining=Math.max(0,MAX_REACTION_DWELL_MS-(Date.now()-lastPictureAt));
    const dwell=4200-(anchor??displayed).energy*400+[0,-250,200][phase%3];
    timer=setTimeout(()=>show(next),Math.max(0,Math.min(remaining-500,dwell-(Date.now()-lastPictureAt))));
    deadline=setTimeout(()=>{
      if(Date.now()-lastPictureAt<MAX_REACTION_DWELL_MS)return;
      const neutral=displayed?.id==='listen-5'?'listen-3':'listen-5';
      if(decoded.has(fileFor(neutral)))show(neutral);
    },remaining);
  };
  const renderer = createAvatarRenderer({image:document.getElementById('avatar'),previous:document.getElementById('avatarPrevious'),load,
    reducedMotion:reduced,onPose:(pose,frame)=>{
      document.body.dataset.avatarPose=pose;
      displayed=avatarPicture(pose==='idle'?'idle':`${pose}-${frame}`);lastPictureAt=Date.now();
      recent.push(displayed.id);recent=recent.slice(-4);phase++;
      document.getElementById('avatar').alt=displayed.label;
      document.body.dataset.avatarReaction=displayed.id;
      schedule();
    }});
  const render = () => {
    clearTimers();if(disposed)return;
    if(!connected()){
      anchor=null;recent=[];delete document.body.dataset.avatarAttention;
      delete document.body.dataset.avatarReaction;show('idle');return;
    }
    // Tiny neutral safety pair, not a download of the entire gallery.
    void load(fileFor('listen-5'));void load(fileFor('listen-3'));
    if(!displayed||displayed.id==='idle')show(anchor?.id??fallback);
    else schedule();
  };
  const observer = new window.MutationObserver(render);
  observer.observe(document.body,{attributes:true,attributeFilter:['data-call-state']});
  document.addEventListener('visibilitychange',render);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener?.('change',render);
  const dispose = () => {disposed=true;clearTimers();observer.disconnect();document.removeEventListener('visibilitychange',render);motion.removeEventListener?.('change',render);renderer.dispose();};
  window.addEventListener('pagehide',dispose,{once:true});
  render();
  return {
    context(){return {currentPicture:displayed?.id??null,reactionPicture:anchor?.id??displayed?.id??null};},
    select(value){
      const id=typeof value==='string'?value:value?.picture,picture=avatarPicture(id);
      if(!picture||picture.id==='idle'||disposed||!connected())return;
      delete document.body.dataset.avatarAttention;
      // HOLD preserves the semantic reaction, including its variation phase.
      // Duplicate captions/choices must never extend one frame's deadline.
      if(anchor?.id===picture.id){schedule();return;}
      anchor=picture;show(id);
    },
    attend(){
      if(disposed||!connected())return;
      document.body.dataset.avatarAttention='user';
      // A new caption must not erase the last meaningful reaction while
      // the cosmetic decision is in flight. Neutral is an initial fallback.
      if(!anchor){fallback='listen-5';show('listen-5');}
    },
    show(activity){
      const next=Object.hasOwn(AVATAR_POSES,activity)?activity:'idle';
      if(next===task)return;task=next;fallback=task==='idle'?'listen-5':`${task}-0`;
      // Real work supplies a fallback until a contextual reaction arrives;
      // it cannot erase an empathic response to the person speaking.
      if(!anchor&&connected())show(fallback);
    },
    expression(value){
      if(!anchor&&connected()&&['focused','curious','bright','calm'].includes(value))show(value==='curious'?'listen-1':'listen-5');
    },dispose,
  };
}
