#!/usr/bin/env python3
"""Generate SmartBuy *candidates* for review from official public Shopify JSON if available.

Run with Python 3 and `pip install requests`. Does not download any photos or mark matches verified.
"""
import csv, re, difflib, pathlib, requests, json, sys
BASE=pathlib.Path(__file__).resolve().parent
DATA=list(csv.DictReader((BASE/'product_image_links_200.csv').open(encoding='utf-8-sig')))
s=requests.Session();s.headers.update({'User-Agent':'Mozilla/5.0 (compatible; ProductImagesReview/1.0)'})
products=[]
for page in range(1,18):
 try:
  r=s.get('https://smartbuy-me.com/products.json',params={'limit':250,'page':page},timeout=30)
  r.raise_for_status(); batch=r.json().get('products',[])
 except Exception as e:
  print('Shopify catalogue unavailable:', str(e));break
 if not batch:break
 products.extend(batch);print('Catalogue page',page,'items',len(batch))
 if len(batch)<250:break
if not products:
 print('No products loaded. Ask Codex to inspect product pages with browser and manually resolve images.');sys.exit(0)
def norm(v):return ' '.join(re.findall(r'[a-z0-9]+',v.casefold()))
def score(a,b):
 a=norm(a);b=norm(b)
 aa=set(a.split());bb=set(b.split());common=len(aa & bb)/max(len(aa|bb),1)
 return .6*difflib.SequenceMatcher(None,a,b).ratio()+.4*common
out=[]
for item in DATA:
 if item['store']!='SmartBuy':continue
 cand=sorted(((score(item['product_title'],p.get('title','')),p) for p in products),key=lambda x:x[0],reverse=True)[:2]
 if not cand:continue
 (v,p)=cand[0];runner=cand[1][0] if len(cand)>1 else 0
 images=p.get('images') or []
 image=(images[0].get('src','') if images and isinstance(images[0],dict) else (images[0] if images else ''))
 # Never auto-approve even when score is high.
 out.append({'id':item['id'],'asked_product':item['product_title'],'matched_product':p.get('title',''),
  'similarity_score':round(v,3),'lead_over_second':round(v-runner,3),
  'product_page':'https://smartbuy-me.com/products/'+p.get('handle',''),
  'candidate_image_url':image,'status':'NEEDS_VISUAL_REVIEW_AND_VARIANT_CHECK'})
keys=list(out[0]) if out else []
if out:
 with (BASE/'smartbuy_candidates_for_review.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=keys);w.writeheader();w.writerows(out)
 print('Wrote',len(out),'SmartBuy candidates. NONE are automatically verified.')
