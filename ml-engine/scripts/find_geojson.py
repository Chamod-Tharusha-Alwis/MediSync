import urllib.request
import re

url = "https://html.duckduckgo.com/html/?q=site:github.com+%22districts.geojson%22+%22sri+lanka%22"
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req).read().decode('utf-8')
    
    # We'll just look for standard paths like 'raw.githubusercontent.com/.../districts.geojson'
    matches = re.findall(r'href="([^"]+)"', html)
    for m in matches:
        if 'github.com' in m and 'districts' in m.lower() and 'geojson' in m.lower():
            raw_url = m.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
            print("Found:", raw_url)
except Exception as e:
    print(e)
