# CLIP ViT-B/32 (веса openai): отпечаток из 512 чисел для каждой миниатюры -> <папка>/emb.npy + ids.json
# Запуск: python embed.py <рабочая папка>   (нужны torch, open_clip_torch, pillow; хватает процессора, ~10 минут)
import os, sys, json, torch, open_clip, numpy as np
from PIL import Image
D = sys.argv[1]
model, _, pre = open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')
model.eval(); torch.set_num_threads(os.cpu_count())
files = sorted(f for f in os.listdir(os.path.join(D, 'thumbs')) if f.endswith('.jpg'))
ids, embs, B = [], [], 64
for k in range(0, len(files), B):
    batch, names = [], []
    for f in files[k:k + B]:
        try: batch.append(pre(Image.open(os.path.join(D, 'thumbs', f)).convert('RGB'))); names.append(f[:-4].replace('_', '#'))
        except Exception as e: print('bad', f, e)
    with torch.no_grad():
        e = model.encode_image(torch.stack(batch)); e = e / e.norm(dim=-1, keepdim=True)
    embs.append(e.numpy().astype(np.float32)); ids += names
    if k % 640 == 0: print(k, len(files), flush=True)
np.save(os.path.join(D, 'emb.npy'), np.concatenate(embs)); json.dump(ids, open(os.path.join(D, 'ids.json'), 'w'))
print('done', len(ids))
