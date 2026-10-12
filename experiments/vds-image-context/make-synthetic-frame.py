# synthetic "video frame": smooth gradient scene + text + film grain -> big PNG like real frames
from PIL import Image, ImageDraw, ImageFont
import random, os
random.seed(7)
W,H=1080,1920
im=Image.new('RGB',(W,H))
px=im.load()
for y in range(H):
  for x in range(W):
    n=random.randint(-18,18)
    px[x,y]=(max(0,min(255,int(40+180*y/H)+n)),max(0,min(255,int(90+100*x/W)+n)),max(0,min(255,200-int(120*y/H)+n)))
d=ImageDraw.Draw(im)
d.rectangle([140,600,940,1300],fill=(250,240,220))
d.ellipse([300,700,780,1180],fill=(220,60,60))
try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',110)
except: f=ImageFont.load_default()
d.text((160,300),'RED CIRCLE',fill=(255,255,255),font=f)
d.text((200,1450),'CODE 7319',fill=(255,255,0),font=f)
os.makedirs('/tmp/vds-img',exist_ok=True)  # output dir on the probe host
im.save('/tmp/vds-img/frame-1080x1920.png')
s=im.copy(); s.thumbnail((1024,1024)); s.save('/tmp/vds-img/frame-1024.jpg',quality=85)
s=im.copy(); s.thumbnail((1568,1568)); s.save('/tmp/vds-img/frame-1568.jpg',quality=85)
for f in sorted(os.listdir('/tmp/vds-img')): print(f, os.path.getsize('/tmp/vds-img/'+f))
