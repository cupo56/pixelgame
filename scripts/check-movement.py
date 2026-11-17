import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out = Path('artifacts')
out.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1280,'height':800})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:5174/')
    page.get_by_role("button", name="Spiel starten").click()
    page.wait_for_function("async () => window.elementsGame.scene.isActive('GameScene')")
    page.evaluate("async () => { window.s = window.elementsGame.scene.getScene('GameScene') }")
    page.wait_for_timeout(600)
    page.mouse.move(950,350)
    page.wait_for_timeout(200)
    page.screenshot(path=str(out/'character-aim.png'))
    def hold(k,ms):
        page.keyboard.down(k)
        page.wait_for_timeout(ms)
        page.keyboard.up(k)
        page.wait_for_timeout(70)
    def val(expr): return page.evaluate('() => '+expr)
    def reset():
        page.evaluate('s.travel(360,870)')
        page.wait_for_timeout(600)
    page.keyboard.down('Shift')
    page.keyboard.down('d')
    page.wait_for_timeout(800)
    walk=val('s.player.body.velocity.x*60/32')
    page.screenshot(path=str(out/'character-walk.png'))
    page.keyboard.up('Shift')
    page.keyboard.down('d')
    page.wait_for_timeout(800)
    run=val('s.player.body.velocity.x*60/32')
    print('State',val('({walk:s.player.keys.walk.isDown,run:s.player.keys.right.isDown,ground:s.player.grounded})'),errors,flush=True)
    page.screenshot(path=str(out/'character-run.png'))
    page.keyboard.up('d')
    assert 2 < walk < 2.4,walk
    assert 5.7 < run < 6.1,run
    page.wait_for_timeout(700)
    assert abs(val('s.player.body.velocity.x')) < .1
    def jump(ms):
        reset()
        start=val('s.player.body.position.y')
        page.evaluate('window.minY=10000; window.sample=()=>{minY=Math.min(minY,s.player.body.position.y)}; s.events.on("update",sample)')
        hold('Space',ms)
        page.wait_for_timeout(1100)
        height=start-val('minY')
        page.evaluate('s.events.off("update",sample)')
        return height
    short=jump(80)
    full=jump(550)
    assert full>short+5,(short,full)
    assert 24<full<35,full
    reset()
    for x,y in [(950,350),(100,350),(480,150),(480,600)]:
        page.mouse.move(x,y)
        page.wait_for_timeout(200)
        assert val('Number.isFinite(s.player.view.hand.x) && Number.isFinite(s.player.view.hand.y)')
        reach=val('s.player.view.hand.distance(s.player.view.shoulder)')
        assert 18<reach<22,reach
    page.mouse.move(1000,300)
    for key in ['1','2','3','4']:
        hold(key,150)
        page.mouse.down()
        page.wait_for_timeout(160)
        page.screenshot(path=str(out/('character-cast-'+key+'.png')))
        page.mouse.up()
        page.wait_for_timeout(700)
    reset()
    page.keyboard.down('Space')
    page.wait_for_timeout(220)
    page.screenshot(path=str(out/'character-jump.png'))
    page.keyboard.up('Space')
    assert not errors,errors
    print(json.dumps({'walk_ms':walk,'run_ms':run,'short_jump_px':short,'full_jump_px':full,'errors':errors}))
    browser.close()

