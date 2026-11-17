"""Browser smoke check. Uses the existing local Python Playwright installation."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUTPUT = Path(__file__).resolve().parents[1] / 'artifacts'
OUTPUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('ELEMENTS_TEST_URL', 'http://127.0.0.1:5174/'), timeout=15000)
    page.wait_for_function("document.querySelector('canvas') !== null")
    page.wait_for_function("async () => window.elementsGame.scene.isActive('GameScene')")
    page.evaluate("async () => { window.testScene = window.elementsGame.scene.getScene('GameScene') }")
    page.wait_for_timeout(900)

    def state():
        return page.evaluate("""() => ({
            x: testScene.player.body.position.x,
            y: testScene.player.body.position.y,
            found: [...testScene.found],
            region: testScene.hud.region,
            map: testScene.map.visible,
            element: testScene.elements.selectedElement
        })""")

    def hold(key, milliseconds):
        page.keyboard.down(key)
        page.wait_for_timeout(milliseconds)
        page.keyboard.up(key)

    def place(x, y):
        page.evaluate('([x,y]) => testScene.travel(x,y)', [x, y])
        page.wait_for_timeout(250)

    assert abs(state()['y'] - 871) < 5, state()
    print('Loaded camp.', flush=True)
    page.screenshot(path=str(OUTPUT / 'grenzland-lager.png'))
    page.keyboard.press('Tab', delay=80)
    page.wait_for_timeout(100)
    assert state()['map'] is True
    page.screenshot(path=str(OUTPUT / 'grenzland-karte.png'))
    page.keyboard.press('Tab', delay=80)

    # Walk the actual route from the camp into the grotto, without teleporting.
    page.evaluate("""() => {
        window.descentSamples = [];
        window.sampleDescent = () => {
            const p = testScene.player;
            if (p.body.position.x > 1510 && p.body.position.x < 2080) {
                descentSamples.push({grounded: p.grounded, landing: p.landing});
            }
        };
        testScene.events.on('postupdate', sampleDescent);
    }""")
    hold('d', 11000)
    descent = page.evaluate("() => { testScene.events.off('postupdate', sampleDescent); return descentSamples; }")
    assert len(descent) > 50 and all(p['grounded'] and p['landing'] == 0 for p in descent), descent
    assert 'grove' in state()['found'], state()
    assert 'cave' in state()['found'], state()
    assert state()['y'] > 1400, state()
    page.screenshot(path=str(OUTPUT / 'grenzland-grotte.png'))
    # Return up every stair with A alone; no jumping or running start required.
    cave_state = state()
    place(2140, 1448)
    hold('a', 4500)
    assert state()['x'] < 1480 and state()['y'] < 900, state()
    page.screenshot(path=str(OUTPUT / 'grenzland-treppe-oben.png'))
    place(cave_state['x'], cave_state['y'])
    # Reach the cave's return lift.
    if state()['x'] < 2475:
        page.keyboard.down('d')
        page.wait_for_function('testScene.player.body.position.x > 2475')
        page.keyboard.up('d')
    page.wait_for_timeout(700)
    page.keyboard.press('e', delay=80)
    page.wait_for_timeout(300)
    assert state()['y'] < 950, state()

    # Both neutral lift endpoints work, without requiring the air element.
    place(3020, 870)
    page.keyboard.press('1', delay=80)
    page.keyboard.press('e', delay=80)
    page.wait_for_timeout(300)
    assert state()['y'] < 430, state()
    page.keyboard.press('e', delay=80)
    page.wait_for_timeout(300)
    assert state()['y'] > 840, state()

    # Air column reaches above the islands without colliding with their underside.
    place(3310, 870)
    page.keyboard.press('4', delay=80)
    hold('Space', 2700)
    assert state()['y'] < 390, state()
    print('Wind route:', json.dumps(state()))

    # Test the neutral running jump across the actual 80px sky-island gap.
    place(3020, 390)
    page.keyboard.press('1', delay=80)
    page.keyboard.down('d')
    page.wait_for_function('testScene.player.body.position.x > 3245')
    page.keyboard.down('Space')
    page.wait_for_timeout(650)
    page.keyboard.up('Space')
    page.wait_for_function('testScene.player.body.position.x > 3570')
    page.keyboard.up('d')
    page.wait_for_timeout(200)
    assert 'sky' in state()['found'], state()
    assert state()['y'] < 450, state()
    page.screenshot(path=str(OUTPUT / 'grenzland-himmel.png'))

    # Exercise each existing attack after the scene changes.
    for key in ['1', '2', '3', '4']:
        page.keyboard.press(key, delay=80)
        page.mouse.click(1000, 350)
        page.wait_for_timeout(200)
    page.keyboard.press('r', delay=80)
    page.wait_for_timeout(350)
    assert abs(state()['x'] - 360) < 5, state()
    assert len(state()['found']) == 3, state()
    page.reload()
    page.wait_for_timeout(900)
    page.evaluate("async () => { window.testScene = window.elementsGame.scene.getScene('GameScene') }")
    assert len(state()['found']) == 3, state()
    assert not errors, errors
    print('PASS: camp, map, walking route, cave lift, sky lift, updraft, neutral island jump, four attacks, recall, persistence.')
    print(json.dumps(state(), ensure_ascii=False))
    browser.close()


