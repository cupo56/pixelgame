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


def grow_wall(page: Page, hold_ms: int = 900) -> None:
    """Erdmodus, Maus 4 m vor dem Spieler, rechte Taste halten und loslassen."""
    me = ev(page, '() => window.player()')
    aim(page, me['x'] + 130, me['y'])
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
    page.wait_for_timeout(700)
    page.mouse.up(button='right')
    page.wait_for_timeout(200)
    box = wall_box(page)
    assert ev(page, WALL_STATE) == 'standing' and box, ev(page, WALL_STATE)
    assert abs(box['h'] - 80) < 2 and abs(box['w'] - 38.4) < 2, box
    assert box['mass'] > 5000, box
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
        for scene in (scene_wall, scene_schutz, scene_tritt, scene_gegner_schuss):
            scene(browser)
        print('Alle Wandprüfungen bestanden.', flush=True)
        browser.close()


if __name__ == '__main__':
    main()
