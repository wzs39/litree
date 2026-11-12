import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-infobars',
            ]
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 800},
            locale='zh-CN',
        )
        page = await context.new_page()
        await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
        
        try:
            print('Navigating...')
            resp = await page.goto('https://zhuanlan.zhihu.com/p/2093649877205108399', wait_until='networkidle', timeout=30000)
            print('Response status:', resp.status if resp else 'None')
            print('Current URL:', page.url)
            print('Page title:', await page.title())
            content = await page.content()
            print('Content length:', len(content))
            with open('C:/Users/qwe/.dsh/agy-unlock/.agents/teamwork/explorer_survey_1/playwright_stealth.html', 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            print('Error in stealth:', e)
        finally:
            await browser.close()

asyncio.run(run())
