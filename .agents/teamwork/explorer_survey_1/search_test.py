import urllib.request, urllib.parse
from bs4 import BeautifulSoup

def query_google(q):
    url = 'https://www.google.com/search?q=' + urllib.parse.quote(q)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
    try:
        html = urllib.request.urlopen(req, timeout=10).read().decode('utf-8')
        soup = BeautifulSoup(html, 'html.parser')
        print(f'Google results for {q}:')
        for div in soup.find_all('div', class_='g'):
            h3 = div.find('h3')
            a = div.find('a')
            if h3 and a:
                print('  Title:', h3.get_text())
                print('  Link:', a.get('href'))
    except Exception as e:
        print('Google error:', e)

query_google('"2093649877205108399"')
query_google('site:zhihu.com/p/ 2093649877205108399')
