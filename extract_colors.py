import urllib.request
from PIL import Image
from collections import Counter
import io
import math

url = 'https://lh3.googleusercontent.com/aida/AP1WRLtIynO5rF18aXcC1CIAac8MJnAqj8eIIfBqJRruGLQHZ_R8hiiyXGVgFfwbNNaTK_VDO5sSUyBXfSG_VOaZdS-dxqxRH3mPprppCWyxSMe3IZz06P1W_NMPIIS0WHRpNe3tO6173eh7y4jRweuBFdsWZkdWXmJqgEzA-tw6LANGIgpQJ-YrOZJT-lwU_S-O7rM8D-P8-s-xAkt01EdGN8S-l1yvpAqaDKjioDe5moQEgmaYWaAHmy5BTQ'
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    img_data = response.read()

img = Image.open(io.BytesIO(img_data)).convert('RGB')
img = img.resize((150, 150))

pixels = list(img.getdata())

def is_grayscale(r, g, b, threshold=20):
    return abs(r-g) < threshold and abs(g-b) < threshold and abs(r-b) < threshold

def is_too_light_or_dark(r, g, b):
    avg = (r + g + b) / 3
    return avg < 30 or avg > 225

colors = []
for p in pixels:
    if not is_grayscale(*p) and not is_too_light_or_dark(*p):
        # Round to nearest 10 to group similar colors
        r = int(round(p[0] / 10.0) * 10)
        g = int(round(p[1] / 10.0) * 10)
        b = int(round(p[2] / 10.0) * 10)
        colors.append((r,g,b))

cnt = Counter(colors)
for color, count in cnt.most_common(10):
    print(f'#{color[0]:02x}{color[1]:02x}{color[2]:02x} : {count}')
