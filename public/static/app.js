/* シンプルな文字弾幕エンジン（プロトタイプ強化版） */
const $ = (sel, el = document) => el.querySelector(sel)

const WIDTH = 360, HEIGHT = 640

const state = {
  running: false,
  score: 0,
  hp: 100,
  lives: 1,
  stage: 1,
  spreadUntil: 0, // 横展開（多方向ショット）有効期限
  a3Until: 0, // A3圧縮（敵テキスト縮小）有効期限
  shakeT: 0, // 画面シェイク残フレーム
  shakeAmp: 0 // シェイク振幅
}

const BOSSES = ['係長','課長','部長','常務','社長']
const STAGE_BULLETS = [
  // STAGE 1: 入口＋基本ワード
  ['説教','嫌味','精神論','ムダ取り','カイゼン','5S','見える化','なぜなぜ','三現主義','現地現物','安全第一','標準作業','A3報告','QCサークル','目で見る管理','横展開'],
  // STAGE 2: フロー・JIT 系
  ['ジャストインタイム','タクトタイム','平準化','カンバン','同期化','段取り替え','ポカヨケ','自働化','アンドン','ラインストップ','流れ化','工程設計','リードタイム'],
  // STAGE 3: マネジメント・コスト
  ['方針管理','大部屋','自工程完結','在庫ゼロ','原価低減','原単位','工程内仕掛','平準箱','稼働率','ひと物設備','能力表','人員配置','工数低減'],
  // STAGE 4: 品質・問題解決
  ['5Why','なぜなぜ5回','真因','要因解析','QC七つ道具','パレート図','管理図','ヒストグラム','品質保証','不良ゼロ','再発防止','見える不良','工程監査'],
  // STAGE 5: 文化・強化ワード
  ['トヨタウェイ','現場力','カイカク','知恵と工夫','多能工化','自主保全','TPM','安定稼働','ヨコテン（横展開）','タクト遵守','ムダ・ムラ・ムリ','徹底','原価意識','安全文化']
]

const PANEL = `
  <div class="panel rounded-md max-w-sm mx-auto">
    <div class="title flex justify-between items-center">
      <div class="lcd">STAGE:<span id="st">1</span> / SCORE:<span id="sc">000000</span></div>
      <div class="flex gap-2 items-center">
        <span>HP</span>
        <div class="w-24 h-3 bg-gray-700"><div id="hpbar" class="h-3 bg-emerald-400" style="width:100%"></div></div>
      </div>
    </div>
    <div class="row">
      <button id="startBtn" class="btn primary">起動</button>
      <button id="spreadBtn" class="btn">横展開</button>
      <button id="bombBtn" class="btn">5Sボム</button>
      <button id="a3Btn" class="btn">A3圧縮</button>
      <button id="audioBtn" class="btn">♪BGM</button>
      <div class="ml-auto text-xs text-gray-400">液晶: Orbitron</div>
    </div>
  </div>
`

function mountUI() {
  const root = document.getElementById('game-root')
  root.innerHTML = `
    <div class="p-3 space-y-3">
      ${PANEL}
      <canvas id="cv" class="block mx-auto bg-black/40" width="${WIDTH}" height="${HEIGHT}"></canvas>
      <div id="toast" class="big-toast"></div>
      <div class="text-center text-xs text-gray-400">ギャグ＆皮肉満載・工場内弾幕（プロトタイプ）</div>
    </div>
  `
  $('#startBtn').onclick = start
  $('#spreadBtn').onclick = activateSpread
  $('#bombBtn').onclick = fiveSBomb
  $('#a3Btn').onclick = activateA3
  $('#audioBtn').onclick = toggleAudio
}

function emitToast(text, ms = 1000) {
  const el = $('#toast')
  el.textContent = text
  el.style.opacity = '1'
  setTimeout(() => { el.style.opacity = '0' }, ms)
}

// 敵・弾幕プリセット（ステージ共通）
const ENEMIES = [
  '残業','書類','上司','先輩','ノルマ','会議','根回し','稟議','報連相','社内調整'
]

// ドロップ
const DROPS = {
  heal: { label:'給料袋', effect: () => addHP(20) },
  life: { label:'有給申請書', effect: () => addLife(1) },
}

function addHP(v){ state.hp = Math.min(100, state.hp + v); updateHUD() }
function addLife(v){ state.lives += v; updateHUD() }

let ctx, canvas, player, objects = [], bullets = [], enemyBullets = [], drops = [], effects = []
let touchStartMeta = null

// ===== Audio (WebAudio) =====
let audio = { ctx:null, master:null, bgm:null, bgmGain:null, enabled:false }
function initAudio(){
  if(audio.ctx) return
  const AC = window.AudioContext || window.webkitAudioContext
  const ctx = new AC()
  const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination)
  const bgmGain = ctx.createGain(); bgmGain.gain.value = 0.12; bgmGain.connect(master)
  audio = { ctx, master, bgm:null, bgmGain, enabled:true }
}
function startBGM(){
  if(!audio.ctx) initAudio()
  if(audio.bgm) return
  const o1 = audio.ctx.createOscillator(); o1.type='sawtooth'
  const o2 = audio.ctx.createOscillator(); o2.type='triangle'
  o1.connect(audio.bgmGain); o2.connect(audio.bgmGain)
  const now = audio.ctx.currentTime
  const base = 110 // A2
  function sched(t, ratio){ o1.frequency.setValueAtTime(base*ratio, t); o2.frequency.setValueAtTime(base*ratio*2, t) }
  for(let i=0;i<64;i++){
    const t = now + i*0.5
    const pat = [1, 5/4, 3/2, 2][i%4] // A, C#, E, A
    sched(t, pat)
  }
  o1.start(); o2.start()
  audio.bgm = { o1, o2 }
}
function stopBGM(){ if(audio.bgm){ audio.bgm.o1.stop(); audio.bgm.o2.stop(); audio.bgm=null } }
function toggleAudio(){
  if(!audio.enabled){ audio.enabled=true; initAudio(); startBGM(); return }
  if(!audio.ctx){ initAudio(); startBGM(); return }
  if(audio.bgm){ stopBGM(); audio.enabled=false } else { startBGM(); }
}
function playSE(type='hit'){
  if(!audio.enabled){ return }
  if(!audio.ctx) initAudio()
  const ctx = audio.ctx
  const g = ctx.createGain(); g.connect(audio.master); g.gain.value = 0.2
  let o
  if(type==='hit'){ o=ctx.createOscillator(); o.type='square'; o.frequency.value=880; g.gain.setValueAtTime(0.2,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.12) }
  else if(type==='shoot'){ o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=660; g.gain.setValueAtTime(0.15,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.08) }
  else if(type==='bomb'){ o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=220; g.gain.setValueAtTime(0.3,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4) }
  else if(type==='pickup'){ o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=1320; g.gain.setValueAtTime(0.15,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.2) }
  else if(type==='death'){ o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=110; g.gain.setValueAtTime(0.35,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.6) }
  else { o=ctx.createOscillator(); o.frequency.value=440 }
  o.connect(g); o.start(); o.stop(ctx.currentTime+0.6)
}

function start(){
  if(state.running) return
  state.running = true
  state.score = 0; state.hp = 100; state.lives = 1; state.stage = 1
  state.spreadUntil = 0; state.a3Until = 0
  canvas = $('#cv'); ctx = canvas.getContext('2d')
  player = { x: WIDTH/2, y: HEIGHT-60, r: 10, speed: 3 }
  objects = []; bullets = []; enemyBullets=[]; drops=[]; effects=[]
  attachInput()
  spawnWaves()
  loop()
  emitToast('社畜戦士！定時を死守せよ！')
  updateHUD()
}

function updateHUD(){
  $('#sc').textContent = String(state.score).padStart(6,'0')
  $('#st').textContent = String(state.stage)
  $('#hpbar').style.width = state.hp + '%'
}

function spawnBoss(){
  const label = BOSSES[state.stage-1] || '社長'
  const yTarget = 64
  const maxhp = 120 + 40*(state.stage-1)
  objects.push({ type:'boss', label, x: WIDTH/2, y: yTarget, vx:0, vy:0, hp: maxhp, maxhp, phase:0 })
}

// 敵出現
function spawnWaves(){
  for(let i=0;i<10;i++){
    const label = ENEMIES[Math.floor(Math.random()*ENEMIES.length)]
    objects.push({ type:'enemy', label, x: 40+Math.random()*(WIDTH-80), y:-20-60*i, vx: (Math.random()-.5)*0.6, vy: 0.6+Math.random()*0.3, hp: 3 })
  }
  setTimeout(spawnBoss, 3500)
}

// 入力
const keys = {}
window.addEventListener('keydown', e=> keys[e.key]=true)
window.addEventListener('keyup', e=> keys[e.key]=false)

function attachInput(){
  // タッチ開始：位置記録・即座に自機をそこへ
  canvas.addEventListener('touchstart', e=>{
    if(!audio.ctx){ initAudio(); startBGM() }
    const t = e.touches[0]
    const rect = canvas.getBoundingClientRect()
    const x = (t.clientX - rect.left) * (canvas.width/rect.width)
    const y = (t.clientY - rect.top) * (canvas.height/rect.height)
    // 相対移動方式: 自機初期位置とタッチ開始位置を記録
    touchStartMeta = { x0:x, y0:y, px0:player.x, py0:player.y, time: performance.now() }
  }, { passive: true })
  // タッチ移動：ドラッグで自機移動
  canvas.addEventListener('touchmove', e=>{
    if(!player || !touchStartMeta) return
    const t = e.touches[0]
    const rect = canvas.getBoundingClientRect()
    const x = (t.clientX - rect.left) * (canvas.width/rect.width)
    const y = (t.clientY - rect.top) * (canvas.height/rect.height)
    const dx = x - touchStartMeta.x0
    const dy = y - touchStartMeta.y0
    player.x = touchStartMeta.px0 + dx
    player.y = touchStartMeta.py0 + dy
  }, { passive: true })
  // タッチ終了：短時間・小移動なら現地現物発動
  canvas.addEventListener('touchend', e=>{
    if(!touchStartMeta) return
    const dt = performance.now() - touchStartMeta.time
    const endTouch = (e.changedTouches && e.changedTouches[0])
    if(endTouch){
      const rect = canvas.getBoundingClientRect()
      const x = (endTouch.clientX - rect.left) * (canvas.width/rect.width)
      const y = (endTouch.clientY - rect.top) * (canvas.height/rect.height)
      const dx = x - touchStartMeta.x0, dy = y - touchStartMeta.y0
      const moved = Math.hypot(dx,dy)
      if(dt < 220 && moved < 12){
        freezeBulletsNear(x,y,36, 90)
        emitToast('現地現物：その場で観察・停止')
      }
    }
    touchStartMeta = null
  })
  // マウスドラッグで移動（PC用）
  let dragging=false, dragMeta=null
  canvas.addEventListener('mousedown', e=>{ 
    dragging=true; const rect=canvas.getBoundingClientRect(); 
    const x=(e.clientX-rect.left)*(canvas.width/rect.width); const y=(e.clientY-rect.top)*(canvas.height/rect.height)
    dragMeta = { x0:x, y0:y, px0:player.x, py0:player.y }
    if(!audio.ctx){ initAudio(); startBGM() }
  })
  window.addEventListener('mouseup', ()=> { dragging=false; dragMeta=null })
  canvas.addEventListener('mousemove', e=>{
    if(!dragging || !dragMeta) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (canvas.width/rect.width)
    const y = (e.clientY - rect.top) * (canvas.height/rect.height)
    const dx = x - dragMeta.x0, dy = y - dragMeta.y0
    player.x = dragMeta.px0 + dx
    player.y = dragMeta.py0 + dy
  })
}

function loop(){
  if(!state.running) return
  if(!canvas) { canvas = $('#cv'); ctx = canvas.getContext('2d'); attachInput() }
  requestAnimationFrame(loop)
  step(); draw()
}

function step(){
  // 移動
  const sp = player.speed
  if(keys['ArrowLeft']||keys['a']) player.x-=sp
  if(keys['ArrowRight']||keys['d']) player.x+=sp
  if(keys['ArrowUp']||keys['w']) player.y-=sp
  if(keys['ArrowDown']||keys['s']) player.y+=sp
  player.x = Math.max(10, Math.min(WIDTH-10, player.x))
  player.y = Math.max(10, Math.min(HEIGHT-10, player.y))

  // 自弾（横展開対応）
  if(perfNow()%10===0){
    bullets.push({x:player.x, y:player.y-12, vy:-4, vx:0}); playSE('shoot')
    if(state.spreadUntil > perfNow()){
      bullets.push({x:player.x, y:player.y-12, vy:-3.5, vx:-2})
      bullets.push({x:player.x, y:player.y-12, vy:-3.5, vx: 2})
    }
  }
  bullets.forEach(b=> { b.y+=b.vy; if(b.vx) b.x+=b.vx })
  bullets = bullets.filter(b=> b.y>-20 && b.x>-20 && b.x<WIDTH+20)

  // 敵移動＆射撃
  objects.forEach(o=>{
    o.x+=o.vx; o.y+=o.vy
    if(o.type==='enemy' && Math.random()<0.02){
      const words = STAGE_BULLETS[(state.stage-1)%STAGE_BULLETS.length]
      const text = words[Math.floor(Math.random()*words.length)]
      enemyBullets.push({x:o.x,y:o.y+6, vx:(Math.random()-.5)*1.6, vy:1.6, text})
    }
    if(o.type==='boss'){
      // ボスは前進しない：常に所定位置に固定
      const yTarget = 64
      o.y = yTarget
      if(perfNow()%20===0){
        const words = STAGE_BULLETS[(state.stage-1)%STAGE_BULLETS.length]
        for(let k=0;k<10;k++){
          const ang = k/10*Math.PI*2 + (o.phase*0.25)
          const text = words[k%words.length]
          enemyBullets.push({x:o.x,y:o.y, vx:Math.cos(ang)*1.3, vy:Math.sin(ang)*1.3, text})
        }
        o.phase++
      }
    }
  })

  // 当たり判定（自弾→敵）
  objects.forEach(o=>{
    bullets.forEach(b=>{
      if(Math.abs(b.x-o.x)<10 && Math.abs(b.y-o.y)<14){
        o.hp-=1; b.y=-999
        if(o.hp<=0){
          playSE('hit')
          state.score+= (o.type==='boss'? 800: 60)
          if(o.type==='boss') {
            banner('最終出社、お疲れ様でした', '#aeea00', 90)
            spawnSmoke(o.x, o.y)
            nextStage()
          }
          // ドロップ
          if(Math.random()<0.5){ const d = Math.random()<0.6? 'heal':'life'; drops.push({x:o.x,y:o.y,type:d}) }
          o.remove = true;
        }
      }
    })
  })

  // 敵弾→プレイヤー
  enemyBullets.forEach(e=>{
    if(e.freezeT && e.freezeT>0){ e.freezeT--; }
    else { e.x+=e.vx; e.y+=e.vy }
    if(Math.abs(e.x-player.x)<10 && Math.abs(e.y-player.y)<12){
      state.hp -= 10; e.y=999
      addShake(10, 20)
      banner('上司：やる気ある？', '#ff4545', 50)
      playSE('hit')
      if(state.hp<=0){
        if(state.lives>0){ state.lives--; state.hp=100; banner('有給申請（強制）で復活', '#00ffc6', 60) }
        else { state.running=false; banner('退職エンド（ジョーク）', '#ffffff', 120); playSE('death') }
      }
      updateHUD()
    }
  })
  enemyBullets = enemyBullets.filter(e=> e.y<HEIGHT+40 && e.y>-40 && e.x>-40 && e.x<WIDTH+40)

  // ドロップ取得
  drops.forEach(d=>{
    d.y = (d.y||0) + 1
    if(Math.abs(d.x-player.x)<12 && Math.abs(d.y-player.y)<14){
      const item = DROPS[d.type]; item.effect(); emitToast(`${item.label} を入手！`); d.y=999
    }
  })
  drops = drops.filter(d=> d.y<HEIGHT+20)

  // エフェクト
  effects.forEach(f=> f.t++)
  effects = effects.filter(f=> f.t < f.life)

  // 画面外クリップ + 撃墜削除
  objects = objects.filter(o=> !o.remove && o.y<HEIGHT+60)
}

function nextStage(){
  state.stage++
  updateHUD()
  if(state.stage>5){
    emitToast('定時退社達成！社会は救われた（気がする）', 1800)
    state.running=false
    return
  }
  setTimeout(()=>{
    emitToast(`${BOSSES[state.stage-1]} 登場！`)
    spawnWaves()
  }, 1200)
}

function spawnSmoke(x,y){
  for(let i=0;i<6;i++){
    effects.push({ type:'smoke', x:x+(Math.random()-0.5)*12, y:y+(Math.random()-0.5)*12, t:0, life:42, text:'説教' })
  }
}

function activateSpread(){
  state.spreadUntil = perfNow() + 60*8 // 約8秒
  emitToast('横展開：多方向ショット！')
}

function fiveSBomb(){
  // 行グリッドに沿って弾を「整理・整頓・清掃」
  const grid = 40
  let removed = 0
  enemyBullets = enemyBullets.filter(e=>{
    const nearLine = Math.abs(e.y % grid) < 8 || Math.abs((e.y%grid)-grid) < 8
    if(nearLine) { removed++; return false }
    return true
  })
  emitToast(`5Sボム：${removed} 件 整理！`)
}

function activateA3(){
  state.a3Until = perfNow() + 60*6 // 約6秒
  emitToast('A3圧縮：情報を要点だけに！')
}

function freezeBulletsNear(x,y,r, t){
  enemyBullets.forEach(e=>{
    const dx=e.x-x, dy=e.y-y
    if(dx*dx+dy*dy<=r*r){ e.freezeT = t }
  })
}

function getBoss(){ return objects.find(o=> o.type==='boss' && !o.remove) }

function drawBossHP(b){
  const padX = 12, padY = 10
  const w = WIDTH - padX*2
  const h = 10
  const ratio = Math.max(0, Math.min(1, b.hp / (b.maxhp || b.hp)))
  // 背景
  ctx.save()
  ctx.globalAlpha = 0.95
  ctx.fillStyle = 'rgba(20,20,20,0.8)'
  ctx.fillRect(padX, padY, w, h)
  // 枠
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.strokeRect(padX+0.5, padY+0.5, w-1, h-1)
  // ゲージ
  ctx.fillStyle = '#ff5c5c'
  ctx.fillRect(padX, padY, w*ratio, h)
  // ラベル
  ctx.fillStyle = '#ddd'
  ctx.font = 'bold 12px Noto Sans JP'
  ctx.textAlign = 'left'
  ctx.fillText(`${b.label} HP`, padX, padY - 2)
  ctx.textAlign = 'right'
  ctx.fillText(`${Math.max(0, b.hp)} / ${b.maxhp||b.hp}`, padX + w, padY - 2)
  ctx.restore()
}

function addShake(amp=6, t=15){ state.shakeAmp=Math.max(state.shakeAmp, amp); state.shakeT=Math.max(state.shakeT, t) }
function banner(text,color='#fff', life=60){ effects.push({ type:'banner', text, color, t:0, life }) }

function draw(){
  ctx.clearRect(0,0,WIDTH,HEIGHT)
  // シェイク
  if(state.shakeT>0){
    const dx = (Math.random()*2-1)*state.shakeAmp
    const dy = (Math.random()*2-1)*state.shakeAmp
    ctx.save(); ctx.translate(dx, dy)
    state.shakeT--; if(state.shakeT<=0) { state.shakeAmp=0; ctx.restore() } else { ctx._shaked = true }
  }
  // 背景（工場ライン＋標語ポスター）
  ctx.fillStyle = 'rgba(0,255,198,0.06)'
  for(let y=60;y<HEIGHT;y+=80){ ctx.fillRect(0,y,WIDTH,6) }
  const POSTERS = ['カイゼン','5S','見える化','安全第一','なぜなぜ','アンドン']
  ctx.save()
  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#aeea00'
  ctx.font = 'bold 18px Noto Sans JP'
  POSTERS.forEach((p, i)=>{
    ctx.save();
    ctx.translate(20 + (i%2)*(WIDTH-40), 120 + i*70 % (HEIGHT-100))
    ctx.rotate(-Math.PI/2)
    ctx.fillText(p, 0, 0)
    ctx.restore()
  })
  ctx.restore()

  // プレイヤー
  ctx.fillStyle = '#aeea00'
  ctx.beginPath(); ctx.arc(player.x, player.y, 6, 0, Math.PI*2); ctx.fill()

  // 自弾
  ctx.fillStyle = '#7dd3fc'
  bullets.forEach(b=>{ ctx.fillRect(b.x-1,b.y-6,2,6) })

  // 敵（文字） A3圧縮で縮小
  ctx.fillStyle = '#e6e6e6'
  ctx.textAlign = 'center'
  const a3Scale = (state.a3Until > perfNow()) ? 0.65 : 1
  objects.forEach(o=>{
    const angry = o.type==='enemy' && o.hp<2
    ctx.save()
    if(angry){ ctx.fillStyle = '#ffb0b0' }
    if(o.type==='boss'){ ctx.shadowColor = '#ff4545'; ctx.shadowBlur = 16 }
    const size = (o.type==='boss'? 22:18) * a3Scale
    ctx.font = `bold ${size}px Noto Sans JP`
    ctx.fillText(o.label, o.x, o.y)
    ctx.restore()
  })

  // 敵弾（文字弾幕） 現地現物で停止中は薄く
  enemyBullets.forEach(e=>{
    ctx.save()
    ctx.fillStyle = e.freezeT && e.freezeT>0 ? 'rgba(255,69,69,0.5)' : '#ff4545'
    ctx.font = 'bold 14px Noto Sans JP'
    ctx.fillText(e.text, e.x, e.y)
    ctx.restore()
  })

  // ドロップ（発光）
  ctx.fillStyle = '#00ffc6'
  ctx.font = 'bold 14px Noto Sans JP'
  ctx.shadowColor = 'rgba(0,255,198,0.6)'; ctx.shadowBlur = 12
  drops.forEach(d=>{ ctx.fillText(DROPS[d.type].label, d.x, d.y||0) })
  ctx.shadowBlur = 0

  // エフェクト（爆散→煙「説教」＆バナー）
  effects.forEach(f=>{
    if(f.type==='smoke'){
      const a = 1 - f.t/f.life
      ctx.save()
      ctx.globalAlpha = Math.max(0,a)
      ctx.fillStyle = '#bbbbbb'
      ctx.font = `bold ${16 + f.t*0.3}px Noto Sans JP`
      ctx.fillText(f.text, f.x, f.y - f.t*0.4)
      ctx.restore()
    } else if(f.type==='banner'){
      const a = 1 - f.t/f.life
      const scale = 1 + Math.sin(f.t/4)*0.06
      ctx.save()
      ctx.globalAlpha = Math.max(0, a)
      ctx.fillStyle = f.color
      ctx.textAlign = 'center'
      ctx.font = `800 ${Math.floor(22*scale)}px Noto Sans JP`
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4
      ctx.strokeText(f.text, WIDTH/2, HEIGHT*0.4)
      ctx.fillText(f.text, WIDTH/2, HEIGHT*0.4)
      ctx.restore()
      f.t++
    }
  })

  // ボスHPゲージ（最前面）
  const b = getBoss()
  if(b && b.hp>0) drawBossHP(b)

  // シェイク解除用restore
  if(ctx._shaked){ ctx.restore(); ctx._shaked=false }
}

function perfNow(){ return Math.floor(performance.now()/16) }

window.addEventListener('load', mountUI)
