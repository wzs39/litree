import urllib.request, urllib.parse
from bs4 import BeautifulSoup

def query_baidu(q):
    url = 'https://www.baidu.com/s?wd=' + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
    try:
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        print(f'Baidu results for {q}:')
        for div in soup.find_all('div', class_='result'):
            h3 = div.find('h3')
            if h3:
                print('  Title:', h3.get_text().strip())
    except Exception as e:
        print('Baidu error:', e)

query_baidu('2093649877205108399')
query_baidu('zhuanlan.zhihu.com/p/2093649877205108399')
