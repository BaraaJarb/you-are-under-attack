import asyncio, re
from playwright.async_api import async_playwright
BASE='http://localhost:8899'
async def block(route):
    u=route.request.url
    await (route.continue_() if u.startswith(BASE) else route.abort())
async def main():
    errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch()
        hctx=await b.new_context(viewport={'width':1366,'height':800})
        host=await hctx.new_page()
        host.on('pageerror',lambda e: errs.append('HOST '+str(e)))
        await host.route('**/*',block)
        await host.goto(BASE+'/host.html'); await host.wait_for_timeout(500)
        print('gate visible:', await host.is_visible('#vGate'))
        await host.fill('#pin','0000'); await host.click('#pinGo'); await host.wait_for_timeout(500)
        print('wrong pin keeps gate:', await host.is_visible('#vGate'), await host.inner_text('#pinErr'))
        await host.fill('#pin','1234'); await host.click('#pinGo'); await host.wait_for_timeout(700)
        print('setup visible:', await host.is_visible('#vSetup'))
        await host.click('#seg button[data-n="5"]'); await host.click('#openLobby'); await host.wait_for_timeout(600)
        print('lobby visible:', await host.is_visible('#vLobby'))
        # phones
        phones=[]
        for nm in ['Sara','Omar','Lina']:
            c=await b.new_context(viewport={'width':390,'height':780}, is_mobile=True, has_touch=True)
            pg=await c.new_page(); pg.on('pageerror',lambda e,n=nm: errs.append(n+' '+str(e)))
            await pg.route('**/*',block)
            await pg.goto(BASE+'/'); await pg.wait_for_timeout(500)
            await pg.fill('input.input',nm); await pg.click('button.btn'); await pg.wait_for_timeout(600)
            phones.append(pg)
        await host.wait_for_timeout(3200)
        print('host sees players:', await host.inner_text('#lobbyCount'), await host.inner_text('#chips'))
        await host.screenshot(path='e_lobby.png')
        await phones[0].screenshot(path='e_phone_wait.png')
        await host.click('#startDrill'); await host.wait_for_timeout(2500)
        print('phone sees incident incoming:', await phones[0].inner_text('h2'))
        await host.click('#main'); await host.wait_for_timeout(2500)   # start timer
        print('phone sees question:', (await phones[0].inner_text('.q')))
        # votes: Sara B (correct), Omar A, Lina B
        for pg,letter in zip(phones,[1,0,1]):
            await pg.locator('button.opt').nth(letter).tap(); await pg.wait_for_timeout(250)
        await phones[0].screenshot(path='e_phone_vote.png')
        await host.wait_for_timeout(3000)
        print('host voted cue:', await host.inner_text('#cue'))
        await host.screenshot(path='e_host_running.png')
        await host.keyboard.press('r'); await host.wait_for_timeout(2800)
        await host.screenshot(path='e_host_reveal.png')
        for i,pg in enumerate(phones): print('phone',i,'verdict:', (await pg.inner_text('.verdict')))
        await phones[1].screenshot(path='e_phone_reveal_wrong.png',full_page=True)
        await phones[0].screenshot(path='e_phone_reveal_ok.png',full_page=True)
        # go through the other 4 incidents quickly: Sara always right, Omar always wrong(A), Lina right
        ans=[2,0,3,0]  # correct indexes for incidents 2..5? (B,B,C,A) -> 1,1,2,0 ; use real keys
        keys=[1,1,2,0]
        for k in keys:
            await host.click('#main'); await host.wait_for_timeout(1700)  # Next incident
            await host.click('#main'); await host.wait_for_timeout(2300)  # start timer
            await phones[0].locator('button.opt').nth(k).tap()
            await phones[1].locator('button.opt').nth(3 if k!=3 else 0).tap()
            await phones[2].locator('button.opt').nth(k if k!=2 else 1).tap()
            await host.wait_for_timeout(500)
            await host.keyboard.press('r'); await host.wait_for_timeout(1800)
        print('last main label:', await host.inner_text('#main'))
        await host.click('#main'); await host.wait_for_timeout(1500)
        print('final visible:', await host.is_visible('#vFinal'))
        await host.wait_for_timeout(2000)
        await host.screenshot(path='e_host_final.png',full_page=True)
        await phones[0].wait_for_timeout(2500)
        await phones[0].screenshot(path='e_phone_final.png',full_page=True)
        print('phone0 final text:', (await phones[0].inner_text('.app'))[:140].replace('\n',' | '))
        print('podium:', (await host.inner_text('#podium')).replace('\n',' '))
        print('JS errors:', errs)
        await b.close()
asyncio.run(main())
