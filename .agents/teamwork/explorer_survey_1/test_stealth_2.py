import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
            ]
        )
        context = await browser.new_context()
        page = await context.new_page()
        # mask webdriver
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        """)
        
        try:
            print('Loading...')
            page.on('response', lambda resp: print('URL response:', resp.status, resp.url[:80]))
            await page.goto('https://zhuanlan.zhihu.com/p/2093649877205108399', wait_until='networkidle', timeout=30000)
            await page.wait_for_timeout(3000)
            print('Final URL:', page.url)
            print('Title:', await page.title())
            content = await page.content()
            with open('C:/Users/qwe/.dsh/agy-unlock/.agents/teamwork/explorer_survey_1/zhihu_stealth_v2.html', 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            print('Error:', e)
        finally:
            await browser.close()

asyncio.run(run())
