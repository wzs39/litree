import urllib.request
from bs4 import BeautifulSoup

url = 'https://zhuanlan.zhihu.com/p/2093649877205108399'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

try:
    req = urllib.request.Request(url, headers=headers)
    resp = urllib.request.urlopen(req, timeout=10)
    html = resp.read().decode('utf-8')
    print('Length:', len(html))
    soup = BeautifulSoup(html, 'html.parser')
    text = soup.get_text(separator='\n\n')
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    with open('C:/Users/qwe/.dsh/agy-unlock/.agents/teamwork/explorer_survey_1/raw_zhihu.txt', 'w', encoding='utf-8') as f:
        f.write('\n\n'.join(lines))
    print('Successfully saved raw_zhihu.txt')
except Exception as e:
    print('Error:', e)
