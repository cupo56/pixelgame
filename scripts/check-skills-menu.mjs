/** Browser integration check; use a local Playwright install or PLAYWRIGHT_MODULE. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = fileURLToPath(new URL('../artifacts/', import.meta.url))
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const url = process.env.ELEMENTS_TEST_URL || 'http://127.0.0.1:5174/'
  const start = async () => {
    await page.locator('[data-action="play"]').click()
    await page.waitForFunction(() => window.elementsGame.scene.isActive('GameScene'))
    await page.evaluate(async () => {
      window.s = window.elementsGame.scene.getScene('GameScene')
      window.progression = (await import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/progression/Progression.ts')?.name || '/src/progression/Progression.ts')).progression
    })
    await page.waitForTimeout(150)
  }
  const get = element => page.evaluate(element => progression.get(element), element)
  const press = async key => { await page.keyboard.press(key, { delay: 80 }); await page.waitForTimeout(80) }
  await page.goto(url)
  await page.waitForSelector('#main-menu')
  assert.equal(await page.evaluate(() => window.elementsGame.scene.isActive('GameScene')), false)
  assert.equal(await page.locator('#hudbar').isVisible(), false)
  await page.screenshot({ path: `${output}/menu-start.png` })
  await page.locator('[data-action="options"]').click()
  await page.locator('[name="camera-shake"]').uncheck()
  await page.screenshot({ path: `${output}/menu-options.png` })
  await page.reload(); await page.locator('[data-action="options"]').click()
  assert.equal(await page.locator('[name="camera-shake"]').isChecked(), false)
  const fullscreen = page.locator('[data-action="fullscreen"]')
  if (await fullscreen.isEnabled()) {
    await fullscreen.click(); await page.waitForFunction(() => !!document.fullscreenElement)
    await fullscreen.click(); await page.waitForFunction(() => !document.fullscreenElement)
  }
  await press('Escape')
  // A focused native button must still activate with Space after Phaser was initialized.
  await page.locator('[data-action="play"]').focus(); await press('Space')
  await page.waitForFunction(() => window.elementsGame.scene.isActive('GameScene'))
  await page.evaluate(async () => { window.s = window.elementsGame.scene.getScene('GameScene'); window.progression = (await import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/progression/Progression.ts')?.name || '/src/progression/Progression.ts')).progression })
  console.log('PASS: start screen, persisted options, fullscreen and native keyboard activation')

  await press('m'); assert.equal(await page.evaluate(() => s.map.visible), true)
  await page.screenshot({ path: `${output}/menu-map-m.png` })
  await press('m'); assert.equal(await page.evaluate(() => s.map.visible), false)
  await press('Tab'); assert.equal(await page.evaluate(() => s.map.visible), false)
  await press('k'); await page.waitForFunction(() => window.elementsGame.scene.isPaused('GameScene'))
  const before = await page.evaluate(() => ({ x:s.player.body.position.x, y:s.player.body.position.y, time:s.time.now, count:s.matter.world.getAllBodies().length }))
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({ x:s.player.body.position.x, y:s.player.body.position.y, time:s.time.now, count:s.matter.world.getAllBodies().length }))
  assert.deepEqual(after, before)
  await page.screenshot({ path: `${output}/skills-earth.png` })
  for (const element of ['earth', 'fire', 'water', 'air']) {
    await page.locator(`[data-tab="${element}"]`).click()
    assert.equal((await get(element)).points, 1)
    await page.locator('[data-node="ability"]').click()
    assert.equal(await page.locator('.skill-purchase').isDisabled(), true)
    await page.locator('[data-node="combo"]').click()
    assert.equal(await page.locator('.skill-purchase').isDisabled(), true)
  }
  await page.locator('[data-tab="earth"]').click()
  await page.locator('.skill-purchase').focus(); await press('Space')
  assert.equal((await get('earth')).ranks.power, 1); assert.equal((await get('earth')).points, 0)
  assert.equal((await get('fire')).ranks.power, undefined)
  await page.locator('[data-node="focus"]').click()
  assert.equal(await page.locator('.skill-purchase').isDisabled(), true)
  await page.locator('[data-action="close"]').click()
  await page.waitForFunction(() => window.elementsGame.scene.isActive('GameScene'))
  console.log('PASS: M map, Tab stays free, K pauses physics/timers, four independent trees, purchase and locked future nodes')

  // Exercise the real registered enemy damage route: bonus + attribution + finite enemy XP budget.
  const hit = await page.evaluate(async () => {
    const { damageEnemy } = await import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/combat/damage.ts')?.name || '/src/combat/damage.ts')
    damageEnemy(s.enemies[0].body, 10, 'earth')
    const first = s.enemies[0].health.current
    damageEnemy(s.enemies[0].body, 999, 'earth')
    damageEnemy(s.enemies[1].body, 999, 'earth')
    return { first, state:progression.get('earth'), fire:progression.get('fire') }
  })
  assert.equal(hit.first, 19); assert.equal(hit.state.level, 2); assert.equal(hit.state.xp, 0); assert.equal(hit.state.points, 1)
  assert.equal(hit.fire.xp, 0)
  await press('k'); await page.locator('[data-node="focus"]').click(); await page.locator('.skill-purchase').click()
  assert.equal((await get('earth')).ranks.focus, 1); assert.equal((await get('earth')).points, 0)
  await page.screenshot({ path: `${output}/skills-level-up.png` })
  await press('k')
  await page.mouse.move(1000, 330)
  await page.evaluate(() => { s.input.once('pointerup', () => { window.cooldown = s.elements.nextReadyAt.get('earth') - s.time.now }) })
  await page.mouse.down(); await page.mouse.up()
  assert.equal(await page.evaluate(() => window.cooldown), 650 * .95)
  console.log('PASS: actual damage bonus, attributed capped XP, level/point reward, learned cooldown affects live attack')

  await press('k')
  const pending = await page.evaluate(() => s.elements.earth.lifting?.elapsed)
  assert.notEqual(pending, undefined, 'Committed small rock lift remains present while paused')
  await page.waitForTimeout(350)
  assert.equal(await page.evaluate(() => s.elements.earth.lifting?.elapsed), pending)
  await press('k'); await page.waitForTimeout(450)
  assert.equal(await page.evaluate(() => !!s.elements.earth.lifting), false)
  console.log('PASS: committed attacks pause and resume instead of being deleted by the skill menu')
  await press('k'); await press('Escape'); await page.waitForSelector('#main-menu')
  assert.equal(await page.locator('#hudbar').isVisible(), false)
  assert.equal(await page.locator('#skill-tree-panel').count(), 0)
  await start()
  assert.equal((await get('earth')).ranks.focus, 1)
  for (let i=0;i<3;i++) {
    await press('Escape'); await page.waitForSelector('#main-menu'); await start()
    assert.equal(await page.locator('#skill-tree-panel').count(), 1)
    assert.equal(await page.evaluate(() => s.input.listenerCount('wheel')), 1)
    await press('k')
    await page.waitForFunction(() => window.elementsGame.scene.isPaused('GameScene'))
    await press('k')
    assert.equal(await page.locator('#skill-tree-panel').isVisible(), false)
  }
  await page.reload(); await start()
  assert.equal((await get('earth')).ranks.focus, 1); assert.equal((await get('earth')).level, 2)
  await page.setViewportSize({ width: 800, height: 650 }); await press('k')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: `${output}/skills-compact.png` })
  await page.setViewportSize({ width: 1280, height: 800 }); await press('k')
  await page.keyboard.down('d'); await page.waitForTimeout(400); await page.keyboard.up('d')
  assert(await page.evaluate(() => s.player.body.position.x > 375))
  console.log('PASS: Esc from game/modal, repeated lifecycle, K opens skills, persistence, compact layout and movement after resume')
  const blocked = await browser.newPage()
  blocked.on('pageerror', error => errors.push(String(error)))
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage blocked') } }))
  await blocked.goto(url); await blocked.locator('[data-action="play"]').click()
  await blocked.waitForFunction(() => window.elementsGame.scene.isActive('GameScene'))
  await blocked.keyboard.press('k'); await blocked.waitForSelector('.skill-save-warning')
  await blocked.locator('.skill-purchase').click()
  assert.equal(await blocked.locator('.skill-points strong').textContent(), '0')
  await blocked.close()
  console.log('PASS: unavailable browser storage retains working session progression and explains the limitation')
  assert.deepEqual(errors, [])
  console.log('PASS: no browser errors')
} finally { await browser.close() }
