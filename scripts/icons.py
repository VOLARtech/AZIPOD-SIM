# Renders the PWA icons from public/favicon.svg (needs Playwright + Chromium).
import asyncio, pathlib
from playwright.async_api import async_playwright
root = pathlib.Path(__file__).resolve().parent.parent
svg = (root / 'public/favicon.svg').read_text()
out = root / 'public/icons'
async def render(page, size, name, maskable=False):
    # maskable: full-bleed background, artwork inside the 80 % safe zone
    inner = svg.replace('rx="96"', 'rx="0"') if maskable else svg
    scale = 0.72 if maskable else 1
    html = f"""<html><body style='margin:0;background:{'#06121a' if maskable else 'transparent'}'>
      <div style='width:{size}px;height:{size}px;display:flex;align-items:center;justify-content:center'>
      <div style='width:{size*scale}px;height:{size*scale}px'>{inner.replace('<svg ', f'<svg width="{size*scale}" height="{size*scale}" ')}</div></div></body></html>"""
    await page.set_viewport_size({'width': size, 'height': size})
    await page.set_content(html)
    await page.screenshot(path=str(out / name), omit_background=not maskable)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await render(pg, 192, 'icon-192.png')
        await render(pg, 512, 'icon-512.png')
        await render(pg, 512, 'icon-maskable-512.png', True)
        await render(pg, 180, 'apple-touch-icon.png', True)
        await b.close()
asyncio.run(main())
