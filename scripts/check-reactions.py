"""Szenische Browserprüfung der Elementreaktionen. Nutzt die vorhandene Python-Playwright-Installation."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

OUTPUT = Path(__file__).resolve().parents[1] / 'artifacts'
OUTPUT.mkdir(exist_ok=True)

HELPERS = """() => {
    window.testScene = window.elementsGame.scene.getScene('GameScene');
    window.sys = () => testScene.elements.system;
    window.count = (kind) => sys().registry.count(kind);
    window.labels = () => { const m = {}; for (const s of sys().registry.all()) m[s.body.label] = (m[s.body.label] || 0) + 1; return m; };
    window.toScreen = (wx, wy) => {
        const cam = testScene.cameras.main;
        const rect = document.querySelector('canvas').getBoundingClientRect();
        const s = rect.width / 960;
        return { x: rect.left + (wx - cam.scrollX) * s, y: rect.top + (wy - cam.scrollY) * s };
    };
    window.player = () => ({ x: testScene.player.body.position.x, y: testScene.player.body.position.y });
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('ELEMENTS_TEST_URL', 'http://127.0.0.1:5174/'), timeout=15000)
    page.wait_for_function("document.querySelector('canvas') !== null")
    page.wait_for_function("async () => window.elementsGame.scene.isActive('GameScene')")
    page.evaluate(HELPERS)
    page.wait_for_timeout(900)

    def click(wx, wy, hold_ms=30):
        s = page.evaluate('([x, y]) => window.toScreen(x, y)', [wx, wy])
        page.mouse.move(s['x'], s['y'])
        page.mouse.down()
        page.wait_for_timeout(hold_ms)
        page.mouse.up()

    def place(x, y):
        page.evaluate('([x, y]) => testScene.travel(x, y)', [x, y])
        page.wait_for_timeout(400)

    def labels():
        return page.evaluate('() => window.labels()')

    # 1. Wasser löscht Feuer: Wasser vorlegen, Feuerball hinterher (Feuer ist schneller).
    place(300, 871)
    me = page.evaluate('() => window.player()')
    page.keyboard.press('3')
    click(me['x'] + 200, me['y'] - 40)
    page.wait_for_timeout(60)
    page.keyboard.press('2')
    click(me['x'] + 200, me['y'] - 40)
    extinguished = False
    for _ in range(14):
        page.wait_for_timeout(50)
        if page.evaluate("() => window.count('fire')") == 0:
            extinguished = True
            break
    assert extinguished, labels()
    page.screenshot(path=str(OUTPUT / 'reaktion-loeschen.png'))
    print('Wasser löscht Feuer.', flush=True)
    page.wait_for_timeout(2500)

    # 2. Pfütze und Eisfläche.
    place(250, 871)
    me = page.evaluate('() => window.player()')
    page.keyboard.press('3')
    for _ in range(10):
        click(me['x'] + 70, me['y'] + 60)
        page.wait_for_timeout(100)
    page.wait_for_timeout(1300)
    assert labels().get('puddle', 0) >= 1, labels()
    puddle = page.evaluate("() => { const q = sys().materials.puddle.all()[0]; return { x: q.x, y: q.y }; }")
    page.keyboard.press('4')
    for _ in range(3):
        click(puddle['x'], puddle['y'] - 2)
        page.wait_for_timeout(750)
    assert labels().get('ice-sheet', 0) >= 1, labels()
    page.screenshot(path=str(OUTPUT / 'reaktion-eis.png'))
    print('Luft friert Pfütze zur Eisfläche.', flush=True)

    # 3. Erde + Wasser → Sand.
    place(420, 871)
    me = page.evaluate('() => window.player()')
    page.keyboard.press('1')
    click(me['x'] + 40, me['y'] + 60)
    for i in range(40):
        page.wait_for_timeout(100)
        speed = page.evaluate("() => sys().registry.ofKind('earth')[0]?.body.speed ?? 99")
        if i > 5 and speed < 0.05:
            break
    rock = page.evaluate("() => { const r = sys().registry.ofKind('earth')[0]; return r && { x: r.body.position.x, y: r.body.position.y }; }")
    assert rock, labels()
    place(rock['x'] - 100, rock['y'] - 30)
    page.keyboard.press('3')
    for _ in range(10):
        click(rock['x'], rock['y'] - 4)
        page.wait_for_timeout(100)
    page.wait_for_timeout(600)
    assert page.evaluate("() => window.count('earth')") == 0 and page.evaluate("() => window.count('sand')") >= 4, labels()
    page.screenshot(path=str(OUTPUT / 'reaktion-sand.png'))
    print('Erde wird mit Wasser zu Sand.', flush=True)

    # 4. Sand + Feuer → Metall (geladener Feuerball).
    page.wait_for_timeout(1200)
    pile = page.evaluate("() => { const g = sys().registry.ofKind('sand'); const n = g.length; return { x: g.reduce((a, s) => a + s.body.position.x, 0) / n, y: g.reduce((a, s) => a + s.body.position.y, 0) / n }; }")
    place(pile['x'] - 110, pile['y'] - 30)
    page.keyboard.press('2')
    click(pile['x'], pile['y'], 2200)
    page.wait_for_timeout(900)
    assert page.evaluate("() => window.count('metal')") == 1, labels()
    page.screenshot(path=str(OUTPUT / 'reaktion-metall.png'))
    print('Sand schmilzt zu Metall.', flush=True)

    assert errors == [], errors
    print('Alle Reaktionen geprüft.', flush=True)
    browser.close()
