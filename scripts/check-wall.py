"""Browserprüfung der Steinmauer (Spec 2026-11-18-stone-wall-design.md) und der Gegner-Geschosse.

Nutzt die Hilfsfunktionen aus check-combos.py (frisches Spiel je Szenengruppe). Der Entwicklungsserver muss
laufen (Standard: Port 5174, überschreibbar mit ELEMENTS_TEST_URL). Screenshots landen in artifacts/.
"""
import importlib.util
from pathlib import Path

from playwright.sync_api import Browser, Page, sync_playwright

_spec = importlib.util.spec_from_file_location('check_combos', Path(__file__).with_name('check-combos.py'))
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)
ev, new_game, place, OUTPUT = cc.ev, cc.new_game, cc.place, cc.OUTPUT

WALL_STATE = '() => testScene.elements.wall.currentState'


def aim(page: Page, wx: float, wy: float) -> None:
    s = ev(page, '([x, y]) => window.toScreen(x, y)', [wx, wy])
    page.mouse.move(s['x'], s['y'])


def grow_wall(page: Page, hold_ms: int = 900, dx: float = 130, dy: float = 0) -> None:
    """Erdmodus, Maus dx/dy Pixel vom Spieler entfernt, rechte Taste halten und loslassen."""
    me = ev(page, '() => window.player()')
    aim(page, me['x'] + dx, me['y'] + dy)
    page.keyboard.press('1')
    page.mouse.down(button='right')
    page.wait_for_timeout(hold_ms)
    page.mouse.up(button='right')
    page.wait_for_timeout(150)


def wall_box(page: Page) -> dict:
    return ev(page, """() => { const b = testScene.elements.wall.wallBody; return b && {
        x: b.position.x, y: b.position.y, w: b.bounds.max.x - b.bounds.min.x, h: b.bounds.max.y - b.bounds.min.y,
        vx: b.velocity.x, vy: b.velocity.y, mass: b.mass }; }""")


def park_enemies(page: Page) -> None:
    """Gegner hoch über die Szene setzen und einfrieren: kein Autoschuss, nichts im Weg."""
    ev(page, """() => { for (let i = 0; i < 3; i++) {
        testScene.matter.body.setPosition(enemy(i).body, { x: enemy(i).body.position.x, y: 300 });
        enemy(i).freeze(600000);
    } }""")
    page.wait_for_timeout(200)


def scene_wall(browser: Browser) -> None:
    page, errors = new_game(browser)
    e0 = ev(page, '() => enemyPos(0)')
    park_enemies(page)
    place(page, e0['x'] - 250, 871)
    me = ev(page, '() => window.player()')

    # 1. Wachsen mit Pose, Screenshot mitten im Aufstieg.
    aim(page, me['x'] + 130, me['y'])
    page.keyboard.press('1')
    page.mouse.down(button='right')
    page.wait_for_timeout(300)
    assert ev(page, WALL_STATE) == 'growing', ev(page, WALL_STATE)
    page.screenshot(path=str(OUTPUT / 'wand-wachsen.png'))
    page.wait_for_timeout(1500)
    page.mouse.up(button='right')
    page.wait_for_timeout(200)
    box = wall_box(page)
    assert ev(page, WALL_STATE) == 'standing' and box, ev(page, WALL_STATE)
    assert abs(box['h'] - 160) < 3 and abs(box['w'] - 38.4) < 2, box
    assert box['mass'] > 15000, box
    assert 64 <= box['x'] - me['x'] <= 200, (box['x'], me['x'])
    page.screenshot(path=str(OUTPUT / 'wand-steht.png'))
    print(f"Wand: bändigt in Aufstiegsanimation, steht {box['w']:.0f}x{box['h']:.0f} px, {box['mass']:.0f} kg, "
          f"{(box['x'] - me['x']) / 32:.1f} m vor dem Spieler.", flush=True)

    # 2. Luftstoß schleudert die Wand (Kombo über die Erd-Substanz).
    ev(page, '() => gustAt(testScene.elements.wall.wallBody, testScene.elements.wall.wallBody.position.x + 300, testScene.elements.wall.wallBody.position.y - 20)')
    page.wait_for_timeout(120)
    pushed = wall_box(page)
    assert pushed['vx'] > 3, pushed
    print(f"Luft: Stoß beschleunigt die Wand ({pushed['vx'] * 60 / 32:.1f} m/s).", flush=True)
    assert errors == [], errors
    page.close()


def scene_aufladung_ziel(browser: Browser) -> None:
    """Je länger gehalten, desto höher; die Mauer entsteht am Boden unter der Maus (auch weit weg und aus der Luft anvisiert)."""
    page, errors = new_game(browser)
    park_enemies(page)
    e0 = ev(page, '() => enemyPos(0)')
    place(page, e0['x'] - 250, 871)
    me = ev(page, '() => window.player()')
    heights = {}
    for label, hold in (('kurz', 450), ('mittel', 850), ('voll', 1800)):
        # Maus 8,75 m entfernt und 3 m über dem Boden: die Mauer steht trotzdem unter der Maus am Boden.
        grow_wall(page, hold, dx=280, dy=-96)
        box = wall_box(page)
        assert box and ev(page, WALL_STATE) == 'standing', (label, ev(page, WALL_STATE))
        assert abs(box['x'] - (me['x'] + 280)) < 3, (label, box['x'], me['x'] + 280)
        heights[label] = box['h']
        ev(page, '() => { testScene.elements.wall.lifetimeEndsAt = 0 }')
        page.wait_for_function("() => testScene.elements.wall.currentState === 'idle'", timeout=15000)
        ev(page, '() => { testScene.elements.wall.cooldownEndsAt = 0 }')
    assert heights['kurz'] < heights['mittel'] < heights['voll'], heights
    assert abs(heights['voll'] - 160) < 3 and heights['kurz'] >= 32, heights
    print(f"Aufladung: Höhen {heights['kurz']:.0f} / {heights['mittel']:.0f} / {heights['voll']:.0f} px (kurz / mittel / voll = 5 m), "
          "Wand steht 8,75 m weit unter der Maus am Boden.", flush=True)
    # Reichweite: weiter weg als 10 m wird auf 10 m geklemmt.
    grow_wall(page, 700, dx=450, dy=0)
    box = wall_box(page)
    assert box and abs(box['x'] - (me['x'] + 320)) < 3, (box and box['x'], me['x'] + 320)
    print('Reichweite: Ziel jenseits von 10 m wird auf 10 m begrenzt.', flush=True)
    assert errors == [], errors
    page.close()


def launched_rock(page: Page) -> dict:
    """Wartet, bis ein Erdblock fliegt, und liest Ort und Tempo sofort nach dem Start."""
    page.wait_for_function("() => { const r = sys().registry.ofKind('earth')[0]; return r && r.body.speed > 1 }", timeout=5000)
    return ev(page, """() => { const r = sys().registry.ofKind('earth')[0]; return {
        x: r.body.position.x, y: r.body.position.y, vx: r.body.velocity.x, vy: r.body.velocity.y, edge: r.edgeM }; }""")


def scene_erdblock_ziel(browser: Browser) -> None:
    """Erdblock (linke Taste): Stelle am Boden unter der Maus, Wurfrichtung durch Mausbewegung nach dem Drücken."""
    page, errors = new_game(browser)
    park_enemies(page)
    e0 = ev(page, '() => enemyPos(0)')
    place(page, e0['x'] - 250, 871)
    me = ev(page, '() => window.player()')
    page.keyboard.press('1')

    def press_at(dx: float, dy: float) -> None:
        aim(page, me['x'] + dx, me['y'] + dy)
        page.mouse.down()

    # 1. Klick ohne Mausbewegung: Block steigt 6 m weiter vorn auf und fliegt geradeaus vom Spieler weg.
    press_at(192, 40)
    page.wait_for_timeout(40)
    page.mouse.up()
    rock = launched_rock(page)
    assert abs(rock['x'] - (me['x'] + 192)) < 40, (rock['x'], me['x'] + 192)
    assert rock['vx'] > 2 and rock['vy'] < 0.5, rock
    print(f"Erdblock: Klick am Boden 6 m voraus, Block fliegt vom Spieler weg (vx {rock['vx'] * 60 / 32:.1f} m/s).", flush=True)
    ev(page, 'window.clearWorld')
    page.wait_for_timeout(1500)

    # 2. Gehalten, dann Maus hoch nach rechts oben bewegt: Wurf zur Maus.
    press_at(224, 40)
    page.wait_for_timeout(300)
    aim(page, me['x'] + 424, me['y'] - 200)
    page.wait_for_timeout(60)
    page.mouse.up()
    rock = launched_rock(page)
    assert abs(rock['x'] - (me['x'] + 224)) < 40 and rock['vx'] > 2 and rock['vy'] < -2, rock
    print(f"Erdblock: nach dem Drücken zur Maus gezielt (vx {rock['vx']:.1f}, vy {rock['vy']:.1f} px/Schritt, nach oben).", flush=True)
    ev(page, 'window.clearWorld')
    page.wait_for_timeout(1500)

    # 3. Volle Ladung 9 m voraus: Felsen von 1,5 m.
    press_at(288, 40)
    page.wait_for_timeout(2600)
    page.mouse.up()
    rock = launched_rock(page)
    assert abs(rock['edge'] - 1.5) < 0.05 and abs(rock['x'] - (me['x'] + 288)) < 45, rock
    print(f"Erdblock: voll geladener Felsen ({rock['edge']:.1f} m) 9 m voraus aufgestiegen.", flush=True)
    ev(page, 'window.clearWorld')
    page.wait_for_timeout(1500)

    # 4. Reichweite: weiter als 10 m wird auf 10 m begrenzt.
    press_at(450, 40)
    page.wait_for_timeout(40)
    page.mouse.up()
    rock = launched_rock(page)
    assert rock['x'] - me['x'] <= 330, rock
    print(f"Erdblock: Reichweite auf 10 m begrenzt (Block bei {(rock['x'] - me['x']) / 32:.1f} m).", flush=True)
    assert errors == [], errors
    page.close()


def scene_schutz(browser: Browser) -> None:
    page, errors = new_game(browser)
    e0 = ev(page, '() => enemyPos(0)')
    park_enemies(page)
    place(page, e0['x'] - 250, 871)
    hp0 = ev(page, '() => testScene.player.health.current')

    # 3. Ohne Wand trifft ein Geschoss den Spieler.
    me = ev(page, '() => window.player()')
    ev(page, '([x, y]) => testScene.shots.fireAt({ x: x + 150, y }, { x, y })', [me['x'], me['y']])
    page.wait_for_timeout(1200)
    hp1 = ev(page, '() => testScene.player.health.current')
    assert hp1 == hp0 - 6, (hp0, hp1)
    print(f'Geschoss: trifft den Spieler ohne Wand ({hp0} -> {hp1} LP).', flush=True)

    # 4. Mit Wand fängt sie das Geschoss ab und verliert Haltbarkeit.
    page.wait_for_timeout(1000)
    grow_wall(page)
    assert ev(page, WALL_STATE) == 'standing'
    box = wall_box(page)
    me = ev(page, '() => window.player()')
    ev(page, '([x, y, wy]) => testScene.shots.fireAt({ x: x + 200, y: wy }, { x: me_x(), y: wy })'.replace('me_x()', 'window.player().x'),
       [box['x'], box['y'], box['y']])
    page.wait_for_timeout(1500)
    hp2 = ev(page, '() => testScene.player.health.current')
    health = ev(page, '() => testScene.elements.wall.wallHealth')
    assert hp2 == hp1 and health == 54, (hp1, hp2, health)
    page.screenshot(path=str(OUTPUT / 'wand-schutz.png'))
    print(f'Schutz: Geschoss prallt an der Wand ab (Haltbarkeit {health}/60, Spieler unverletzt).', flush=True)

    # 5. Zehn Treffer zerbrechen sie, danach gilt die Abklingzeit.
    for _ in range(9):
        ev(page, '([x, y]) => testScene.shots.fireAt({ x: x + 200, y }, { x: window.player().x, y })', [box['x'], box['y']])
        page.wait_for_timeout(260)
    page.wait_for_timeout(900)
    assert ev(page, WALL_STATE) == 'idle' and wall_box(page) is None, ev(page, WALL_STATE)
    print('Zerfall: nach 10 Treffern bricht die Wand.', flush=True)
    assert errors == [], errors
    page.close()


def scene_tritt(browser: Browser) -> None:
    page, errors = new_game(browser)
    e0 = ev(page, '() => enemyPos(0)')
    place(page, e0['x'] - 200, 871)
    park_enemies(page)
    grow_wall(page)
    assert ev(page, WALL_STATE) == 'standing'
    box = wall_box(page)
    # Gegner mitten in die Flugbahn der Wand setzen.
    ev(page, '([x, y]) => testScene.matter.body.setPosition(enemy(0).body, { x: x + 130, y }); ', [box['x'], box['y'] - 10])
    hp0 = ev(page, '() => enemy(0).health.current')
    aim(page, box['x'] + 300, box['y'] - 10)
    page.mouse.down(button='right')
    page.wait_for_timeout(60)
    page.mouse.up(button='right')
    page.wait_for_timeout(250)
    page.screenshot(path=str(OUTPUT / 'wand-tritt.png'))
    thrown = wall_box(page)
    assert ev(page, WALL_STATE) == 'thrown' and thrown['vx'] > 3, (ev(page, WALL_STATE), thrown)
    print(f"Tritt: Wand fliegt los ({thrown['vx'] * 60 / 32:.1f} m/s).", flush=True)
    page.wait_for_timeout(1500)
    hp1 = ev(page, '() => enemy(0).health.current')
    assert hp1 < hp0, (hp0, hp1)
    print(f'Tritt: Wucht verletzt den Gegner ({hp0} -> {hp1} LP).', flush=True)
    # Versinken: Lebensdauer verkürzen, die Wand ist danach weg.
    ev(page, '() => { testScene.elements.wall.lifetimeEndsAt = 0 }')
    page.wait_for_function("() => testScene.elements.wall.currentState === 'idle'", timeout=15000)
    print('Versinken: abgelaufene Wand sinkt in den Boden.', flush=True)
    assert errors == [], errors
    page.close()


def scene_gegner_schuss(browser: Browser) -> None:
    page, errors = new_game(browser)
    e0 = ev(page, '() => enemyPos(0)')
    place(page, e0['x'] - 200, 871)
    hp0 = ev(page, '() => testScene.player.health.current')
    seen = 0
    for _ in range(80):
        page.wait_for_timeout(100)
        seen = max(seen, ev(page, '() => testScene.shots.count'))
        if seen:
            break
    assert seen >= 1, 'Gegner schießt nicht'
    page.wait_for_timeout(3000)
    print(f'Gegner: schießt selbstständig (Geschosse gesehen: {seen}).', flush=True)
    assert errors == [], errors
    page.close()


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for scene in (scene_wall, scene_aufladung_ziel, scene_erdblock_ziel, scene_schutz, scene_tritt, scene_gegner_schuss):
            scene(browser)
        print('Alle Wandprüfungen bestanden.', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
