"""Szenische Browserprüfung der Element-Kombos (Spec 2026-11-18-element-combos-design.md).

Wie check-reactions.py: baut Szenen über die Testhilfen im Spiel auf und nutzt die vorhandene
Python-Playwright-Installation. Der Entwicklungsserver muss laufen (Standard: Port 5174,
überschreibbar mit ELEMENTS_TEST_URL). Jede Szenengruppe startet ein frisches Spiel.
"""
import os
from pathlib import Path
from typing import Any

from playwright.sync_api import Browser, Page, sync_playwright

OUTPUT = Path(__file__).resolve().parents[1] / 'artifacts'
OUTPUT.mkdir(exist_ok=True)
URL = os.environ.get('ELEMENTS_TEST_URL', 'http://127.0.0.1:5174/')
FIRE_MAX_J = 4.5e6

HELPERS = """() => {
    window.testScene = window.elementsGame.scene.getScene('GameScene');
    window.sys = () => testScene.elements.system;
    window.count = (kind) => sys().registry.count(kind);
    window.player = () => ({ x: testScene.player.body.position.x, y: testScene.player.body.position.y });
    window.enemy = (i) => testScene.enemies[i];
    window.enemyPos = (i) => ({ x: enemy(i).body.position.x, y: enemy(i).body.position.y });
    window.toScreen = (wx, wy) => {
        const cam = testScene.cameras.main;
        const rect = document.querySelector('canvas').getBoundingClientRect();
        const s = rect.width / 960;
        return { x: rect.left + (wx - cam.scrollX) * s, y: rect.top + (wy - cam.scrollY) * s };
    };
    // Erdblock mit Kantenlänge edgeM (32 px je m) und Starttemperatur anlegen.
    window.makeRock = (x, y, edgeM, tempC) => {
        const px = edgeM * 32;
        const body = testScene.matter.add.rectangle(x, y, px, px, { label: 'rock', mass: edgeM ** 3 * 1800, friction: 0.65 });
        const shape = testScene.add.rectangle(x, y, px, px, 0x947653);
        testScene.matter.add.gameObject(shape, body);
        const rock = sys().materials.earth.adopt(body, shape, 0, edgeM);
        if (tempC !== undefined) rock.temperatureC = tempC;
        return rock;
    };
    // Windstoß-Impuls direkt über das Reaktionssystem (wie ein Windstoß mit voller Stärke).
    window.gustAt = (body, tx, ty, strength = 1) => {
        const dx = tx - body.position.x, dy = ty - body.position.y, len = Math.hypot(dx, dy) || 1;
        return sys().applyWind(body, { x: dx / len, y: dy / len }, strength, 'gust');
    };
    window.clearWorld = () => { for (const s of sys().registry.all()) sys().remove(s); };
    window.tornadoes = () => [...testScene.elements.air.tornado.tornadoes];
    window.countDetonations = () => {
        window.det = 0;
        const fire = sys().materials.fire;
        const original = fire.detonate.bind(fire);
        fire.detonate = (...args) => { window.det += 1; return original(...args); };
    };
}"""


def ev(page: Page, script: str, arg: Any = None) -> Any:
    return page.evaluate(script, arg) if arg is not None else page.evaluate(script)


def new_game(browser: Browser) -> tuple[Page, list[str]]:
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors: list[str] = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL, timeout=15000)
    page.wait_for_function("document.querySelector('canvas') !== null")
    page.get_by_role('button', name='Spiel starten').click()
    page.wait_for_function("async () => window.elementsGame.scene.isActive('GameScene')")
    page.evaluate(HELPERS)
    page.wait_for_timeout(900)
    return page, errors


def place(page: Page, x: float, y: float) -> None:
    page.evaluate('([x, y]) => testScene.travel(x, y)', [x, y])
    page.wait_for_timeout(400)


def click(page: Page, wx: float, wy: float, hold_ms: int = 30) -> None:
    s = ev(page, '([x, y]) => window.toScreen(x, y)', [wx, wy])
    page.mouse.move(s['x'], s['y'])
    page.mouse.down()
    page.wait_for_timeout(hold_ms)
    page.mouse.up()


def wet_enemy(page: Page, index: int) -> None:
    """Vier Wassertropfen aus nächster Nähe auf den Gegner (macht ihn nass)."""
    pos = ev(page, '(i) => enemyPos(i)', index)
    ev(page, '([x, y]) => { for (let k = 0; k < 4; k++) sys().materials.water.spawnDroplet(x - 50 - k * 8, y, 0, 14); }',
       [pos['x'], pos['y']])
    page.wait_for_timeout(450)


def scene_wucht_meteor(browser: Browser) -> None:
    page, errors = new_game(browser)
    # 1. Wucht: kleiner Block bleibt beim Festwert, ein schwerer trifft härter.
    e0 = ev(page, '() => enemyPos(0)')
    place(page, e0['x'] - 150, 871)
    e0 = ev(page, '() => enemyPos(0)')
    ev(page, '([x, y]) => { window.small = makeRock(x - 90, y, 0.5); }', [e0['x'], e0['y']])
    page.wait_for_timeout(100)
    ev(page, '([x, y]) => gustAt(small.body, x, y)', [e0['x'], e0['y']])
    page.wait_for_timeout(900)
    loss_small = 30 - ev(page, '() => enemy(0).health.current')
    assert 10 <= loss_small <= 20, f'kleiner Block: Verlust {loss_small} (Festwert 15 erwartet)'
    print(f'Wucht: kleiner Block (18 m/s) nimmt {loss_small} LP (Untergrenze greift).', flush=True)

    ev(page, '() => clearWorld()')
    e1 = ev(page, '() => enemyPos(1)')
    place(page, e1['x'] - 150, 871)
    e1 = ev(page, '() => enemyPos(1)')
    ev(page, '([x, y]) => { window.big = makeRock(x - 90, y, 1.5); }', [e1['x'], e1['y']])
    page.wait_for_timeout(100)
    ev(page, '([x, y]) => gustAt(big.body, x, y)', [e1['x'], e1['y']])
    page.wait_for_timeout(1200)
    alive_big = ev(page, '() => enemy(1).health.alive')
    hp_big = ev(page, '() => enemy(1).health.current')
    assert not alive_big or hp_big <= 5, f'großer Block: Gegner lebt mit {hp_big} LP'
    page.screenshot(path=str(OUTPUT / 'kombo-wucht.png'))
    print(f'Wucht: schwerer Block (1,5 m) trifft härter (Gegner lebt: {alive_big}, LP {hp_big}).', flush=True)

    # 2. Meteor: glühender schneller Block explodiert einmal pro Erhitzung.
    ev(page, '() => clearWorld()')
    e2 = ev(page, '() => enemyPos(2)')
    place(page, e2['x'] - 150, 871)
    e2 = ev(page, '() => enemyPos(2)')
    ev(page, '([x, y]) => { countDetonations(); window.meteor = makeRock(x - 90, y, 0.5, 900); }', [e2['x'], e2['y']])
    page.wait_for_timeout(100)
    ev(page, '([x, y]) => gustAt(meteor.body, x, y)', [e2['x'], e2['y']])
    page.wait_for_timeout(900)
    detonations = ev(page, '() => window.det')
    spent = ev(page, '() => meteor.meteorSpent')
    temp = ev(page, '() => meteor.temperatureC')
    assert detonations == 1, f'Meteor: {detonations} Explosionen statt 1'
    assert spent and temp < 700, f'Meteor: spent={spent}, Temperatur {temp:.0f} °C'
    page.screenshot(path=str(OUTPUT / 'kombo-meteor.png'))
    ev(page, '() => gustAt(meteor.body, meteor.body.position.x + 200, meteor.body.position.y - 5)')
    page.wait_for_timeout(1200)
    assert ev(page, '() => window.det') == 1, 'Meteor zündete ohne neue Wärme erneut'
    print(f'Meteor: genau eine Explosion, Block danach bei {temp:.0f} °C und verbraucht.', flush=True)
    assert errors == [], errors
    page.close()


def scene_nass_kaelte(browser: Browser) -> None:
    """Hagel-Kette: Wasser macht nass, Windstoß fesselt, Frostschutz verhindert Dauerfessel."""
    page, errors = new_game(browser)
    e = ev(page, '() => enemyPos(0)')
    place(page, e['x'] - 100, 871)
    page.keyboard.press('3')
    wet_enemy(page, 0)
    label = ev(page, '() => enemy(0).healthText.text')
    assert 'NASS' in label, f'Gegner nicht nass: {label!r}'
    # Kälte: Windstoß auf den nassen Gegner.
    page.keyboard.press('4')
    e = ev(page, '() => enemyPos(0)')
    click(page, e['x'], e['y'])
    page.wait_for_timeout(250)
    assert ev(page, '() => enemy(0).isFrozen'), 'nasser Gegner im Windstoß nicht gefesselt'
    t_first = ev(page, '() => testScene.time.now')
    page.screenshot(path=str(OUTPUT / 'kombo-nass-eis.png'))
    print('Hagel-Kette: Wasser macht nass, Windstoß fesselt den Gegner.', flush=True)
    # Frostschutz: nach dem Auftauen erneut nass + Windstoß fesselt nicht.
    for _ in range(40):
        page.wait_for_timeout(100)
        if not ev(page, '() => enemy(0).isFrozen'):
            break
    assert not ev(page, '() => enemy(0).isFrozen'), 'Gegner taute nicht auf'
    e = ev(page, '() => enemyPos(0)')
    place(page, e['x'] - 100, 871)
    page.keyboard.press('3')
    wet_enemy(page, 0)
    assert 'NASS' in ev(page, '() => enemy(0).healthText.text'), 'zweite Nässe fehlt'
    page.keyboard.press('4')
    page.wait_for_timeout(800)  # Abklingzeit des Windstoßes
    e = ev(page, '() => enemyPos(0)')
    click(page, e['x'], e['y'])
    page.wait_for_timeout(250)
    assert not ev(page, '() => enemy(0).isFrozen'), 'Frostschutz greift nicht (Dauerfessel)'
    print('Frostschutz: erneute Fessel kurz nach dem Auftauen bleibt aus.', flush=True)
    # Positivkontrolle: nach Ablauf des Frostschutzes (4,6 s nach der ersten Fessel) fesselt derselbe Ablauf wieder.
    for _ in range(80):
        if ev(page, '() => testScene.time.now') - t_first > 5000:
            break
        page.wait_for_timeout(100)
    e = ev(page, '() => enemyPos(0)')
    place(page, e['x'] - 100, 871)
    page.keyboard.press('3')
    wet_enemy(page, 0)
    page.keyboard.press('4')
    page.wait_for_timeout(800)
    e = ev(page, '() => enemyPos(0)')
    click(page, e['x'], e['y'])
    page.wait_for_timeout(250)
    assert ev(page, '() => enemy(0).isFrozen'), 'nach Ablauf des Frostschutzes fesselt der Windstoß nicht mehr'
    print('Frostschutz: nach Ablauf fesselt der Windstoß wieder (Kontrolle).', flush=True)
    # Trocknen: eine Feuerexplosion auf einen nassen Gegner entfernt Nass.
    e1 = ev(page, '() => enemyPos(1)')
    place(page, e1['x'] - 100, 871)
    page.keyboard.press('3')
    wet_enemy(page, 1)
    assert 'NASS' in ev(page, '() => enemy(1).healthText.text'), 'Gegner 1 nicht nass'
    e1 = ev(page, '() => enemyPos(1)')
    ev(page, '([x, y]) => sys().materials.fire.detonate({ x, y }, 1e6)', [e1['x'], e1['y']])
    page.wait_for_timeout(250)
    assert 'NASS' not in ev(page, '() => enemy(1).healthText.text'), 'Feuer trocknete den Gegner nicht'
    print('Trocknen: Feuerexplosion entfernt Nass.', flush=True)
    assert errors == [], errors
    page.close()


def start_tornado(page: Page) -> dict[str, float]:
    """Voll geladenen Wirbel vor der Figur auslösen und seine Geometrie lesen."""
    place(page, 500, 871)
    page.keyboard.press('4')
    me = ev(page, '() => window.player()')
    click(page, me['x'] + 220, me['y'] - 10, hold_ms=2300)
    page.wait_for_timeout(300)
    tornado = ev(page, '() => { const t = tornadoes()[0]; return t && { x: t.x, y: t.y, h: t.height, r: t.radius }; }')
    assert tornado, 'kein Wirbel entstanden'
    return tornado


def scene_salve(browser: Browser) -> None:
    page, errors = new_game(browser)
    t = start_tornado(page)
    cy = t['y'] - t['h'] * 0.53
    ev(page, '([x, y]) => { window.r1 = makeRock(x - 6, y, 0.5); window.r2 = makeRock(x + 6, y + 8, 0.5); }', [t['x'], cy])
    page.wait_for_timeout(700)
    captured = ev(page, '() => tornadoes()[0]?.captured.size ?? 0')
    assert captured >= 1, f'Wirbel fing keinen Block ({captured})'
    page.wait_for_timeout(500)  # Abklingzeit des geladenen Luftangriffs (1000 ms) abwarten
    me = ev(page, '() => window.player()')
    click(page, me['x'] + 300, me['y'] - 60)
    page.wait_for_timeout(200)
    remaining = ev(page, '() => tornadoes().length')
    speeds = ev(page, '() => [r1, r2].map((r) => r.body.speed)')
    velocities = ev(page, '() => [r1, r2].map((r) => ({ x: r.body.velocity.x, y: r.body.velocity.y }))')
    assert remaining == 0, 'Wirbel endete nicht nach der Salve'
    assert max(speeds) > 5, f'Blöcke fliegen nicht (px/Schritt): {speeds}'
    # Richtung: zur Maus (rechts, leicht nach oben), nicht in die Umlaufrichtung des Wirbels.
    assert all(v['x'] > 0 for v in velocities), f'Salve fliegt nicht zur Maus: {velocities}'
    page.screenshot(path=str(OUTPUT / 'kombo-salve.png'))
    print(f'Salve: {captured} Block/Blöcke gefangen, Wirbel entladen, Tempo {max(speeds):.1f} px/Schritt.', flush=True)
    assert errors == [], errors
    page.close()


def scene_feuerwirbel(browser: Browser) -> None:
    page, errors = new_game(browser)
    ev(page, '() => countDetonations()')
    t = start_tornado(page)
    cy = t['y'] - t['h'] * 0.53
    ev(page, """([x, y, q]) => {
        window.vrock = makeRock(x + 10, y + 6, 0.5);
        window.ball = sys().materials.fire.spawn({ x, y }, { x: 0, y: 0 }, q);
    }""", [t['x'], cy, FIRE_MAX_J])
    page.wait_for_timeout(700)
    assert ev(page, '() => window.count("fire")') == 1, 'Feuerball verschwand im Wirbel'
    assert ev(page, '() => ball.captured'), 'Feuerball wurde nicht gefangen'
    assert ev(page, '() => window.det') == 0, 'Feuerball explodierte im Wirbel'
    temp = ev(page, '() => vrock.temperatureC')
    assert temp > 80, f'Block im Feuerwirbel nicht erhitzt ({temp:.0f} °C)'
    page.screenshot(path=str(OUTPUT / 'kombo-feuerwirbel.png'))
    print(f'Feuerwirbel: Ball gefangen, keine Explosion, Block bei {temp:.0f} °C.', flush=True)
    for _ in range(60):
        page.wait_for_timeout(100)
        if ev(page, '() => tornadoes().length') == 0:
            break
    page.wait_for_timeout(300)
    assert ev(page, '() => window.count("fire")') == 0, 'Feuerball nach Wirbelende noch da'
    assert ev(page, '() => window.det') == 0, 'Feuerball explodierte beim Wirbelende'
    print('Feuerwirbel: Wirbelende löscht den Ball ohne Explosion.', flush=True)
    assert errors == [], errors
    page.close()


def scene_budget_marker(browser: Browser) -> None:
    page, errors = new_game(browser)
    place(page, 420, 871)
    # Budget: viele Tropfen auf einmal; Gesamtbudget 240 darf nie überschritten werden.
    me = ev(page, '() => window.player()')
    ev(page, '([x, y]) => { for (let i = 0; i < 300; i++) sys().materials.water.spawnDroplet(x + 40 + (i % 20) * 3, y - 200 - (i % 7) * 4, -1.4, 6) }',
       [me['x'], me['y']])
    # Höchstwert direkt nach dem Spawn messen (später werden Tropfen zu Pfützen, die nicht zum Budget zählen).
    peak = 0
    fps_samples: list[float] = []
    for _ in range(20):
        peak = max(peak, ev(page, '() => sys().registry.budgetCount()'))
        fps_samples.append(ev(page, '() => testScene.game.loop.actualFps'))
        page.wait_for_timeout(60)
    budget, fps = peak, min(fps_samples)
    assert budget > 100, f'Budgetprobe misst nichts (Höchstwert {budget})'
    assert budget <= 240, f'Körperbudget überschritten: {budget}'
    print(f'Budget: Höchstwert {budget} dynamische Körper (Deckel 240), niedrigste Bildrate {fps:.0f} fps.', flush=True)
    assert fps >= 40, f'Bildrate zu niedrig: {fps:.0f} fps'
    # Windmarkierung nur im Luftmodus.
    ev(page, '() => clearWorld()')
    me = ev(page, '() => window.player()')
    ev(page, '([x, y]) => { window.mrock = makeRock(x + 110, y - 10, 0.5); }', [me['x'], me['y']])
    page.wait_for_timeout(400)
    s = ev(page, '([x, y]) => window.toScreen(x, y)', [me['x'] + 110, me['y'] - 10])
    page.mouse.move(s['x'], s['y'])
    page.keyboard.press('1')
    page.wait_for_timeout(250)
    commands_other = ev(page, '() => testScene.elements.windMarker.graphics.commandBuffer?.length ?? -1')
    page.keyboard.press('4')
    page.wait_for_timeout(250)
    commands_air = ev(page, '() => testScene.elements.windMarker.graphics.commandBuffer?.length ?? -1')
    page.screenshot(path=str(OUTPUT / 'kombo-windmarkierung.png'))
    assert commands_air != -1, 'Graphics.commandBuffer nicht lesbar (Phaser-Version?)'
    assert commands_air > 0 and commands_other == 0, f'Markierung: Luft {commands_air}, andere {commands_other}'
    print(f'Windmarkierung: nur im Luftmodus ({commands_air} Zeichenbefehle, sonst {commands_other}).', flush=True)
    assert errors == [], errors
    page.close()


def scene_erde_leicht(browser: Browser) -> None:
    """Metall und Sand sind leicht zu erzeugen; der dicke Block lässt sich weit schleudern."""
    page, errors = new_game(browser)
    me = ev(page, '() => window.player()')
    fire = """([x, y]) => sys().materials.fire.spawn({ x: x - 70, y }, { x: 1, y: 0, length: () => 1 }, %s)""" % 0.3e6

    # Kleiner Block: schon der kleinste Feuerball macht Metall.
    ev(page, '([x, y]) => { window.small = makeRock(x + 140, y - 10, 0.5); }', [me['x'], me['y']])
    page.wait_for_timeout(700)
    pos = ev(page, '() => ({ x: small.body.position.x, y: small.body.position.y })')
    ev(page, fire, [pos['x'], pos['y']])
    page.wait_for_timeout(900)
    assert ev(page, "() => window.count('earth')") == 0 and ev(page, "() => window.count('metal')") == 1,         ev(page, "() => ({ earth: count('earth'), metal: count('metal'), fire: count('fire') })")
    print('Metall: ein kleinster Feuerball macht den kleinen Block zu Metall.', flush=True)

    # Dicker Block: 3 bis 4 kleinste Feuerbälle.
    ev(page, 'window.clearWorld')
    ev(page, '([x, y]) => { window.thick = makeRock(x + 160, y - 30, 1.5); }', [me['x'], me['y']])
    page.wait_for_timeout(900)
    pos = ev(page, '() => ({ x: thick.body.position.x, y: thick.body.position.y })')
    balls = 0
    while balls < 6 and ev(page, "() => window.count('earth')") == 1:
        ev(page, fire, [pos['x'], pos['y']])
        balls += 1
        page.wait_for_timeout(700)
    assert ev(page, "() => window.count('metal')") == 1, ev(page, "() => ({ earth: count('earth'), metal: count('metal') })")
    assert 3 <= balls <= 4, f'{balls} Feuerbälle'
    print(f'Metall: dicker Block nach {balls} kleinsten Feuerbällen.', flush=True)

    # Dicker Block: 3 bis 4 Tropfen zu Sand.
    ev(page, 'window.clearWorld')
    ev(page, '([x, y]) => { window.thick = makeRock(x + 160, y - 30, 1.5); }', [me['x'], me['y']])
    page.wait_for_timeout(900)
    pos = ev(page, '() => ({ x: thick.body.position.x, y: thick.body.position.y })')
    drops = 0
    while drops < 8 and ev(page, "() => window.count('earth')") == 1:
        ev(page, '([x, y]) => sys().materials.water.spawnDroplet(x, y - 70, Math.PI / 2, 8)', [pos['x'], pos['y']])
        drops += 1
        page.wait_for_timeout(450)
    page.wait_for_timeout(300)
    assert ev(page, "() => window.count('sand')") >= 4, ev(page, "() => ({ earth: count('earth'), sand: count('sand') })")
    assert 3 <= drops <= 5, f'{drops} Tropfen'
    print(f'Sand: dicker Block nach {drops} Tropfen.', flush=True)

    # Dicker Block: der Windstoß schleudert ihn weit.
    ev(page, 'window.clearWorld')
    ev(page, '([x, y]) => { window.thick = makeRock(x + 160, y - 30, 1.5); }', [me['x'], me['y']])
    page.wait_for_timeout(900)
    ev(page, '() => gustAt(thick.body, thick.body.position.x + 300, thick.body.position.y - 20)')
    speed_ms = ev(page, '() => Math.hypot(thick.body.velocity.x, thick.body.velocity.y) * 60 / 32')
    assert speed_ms > 9, f'{speed_ms:.1f} m/s'
    print(f'Luft: dicker Block fliegt mit {speed_ms:.1f} m/s los.', flush=True)
    assert errors == [], errors
    page.close()


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for scene in (scene_wucht_meteor, scene_nass_kaelte, scene_salve, scene_feuerwirbel, scene_budget_marker, scene_erde_leicht):
            scene(browser)
        print('Alle Kombos geprüft.', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
