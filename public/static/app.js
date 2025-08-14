/* シンプルな文字弾幕エンジン（プロトタイプ） */
const $ = (sel, el = document) => el.querySelector(sel)

const WIDTH = 360, HEIGHT = 640

const state = {
  running: false,
  score: 0,
  hp: 100,
  lives: 1,
  stage: 1,
}

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
      <button id="bombBtn" class="btn">残業カット</button>
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
  $('#bombBtn').onclick = () => emitToast('残業カット！工数圧縮（見せかけ）', 1200)
}

function emitToast(text, ms = 1000) {
  const el = $('#toast')
  el.textContent = text
  el.style.opacity = '1'
  setTimeout(() => { el.style.opacity = '0' }, ms)
}

// 敵・弾幕プリセット（ステージ1用）
const ENEMIES = [
  '残業','書類','上司','先輩','ノルマ','会議','根回し','稟議','報連相','社内調整'
]
const BARRAGE = ['説教','嫌味','精神論','カイゼン','5S','見える化','ムダ取り']

// ドロップ
const DROPS = {
  heal: { label:'給料袋', effect: () => addHP(20) },
  life: { label:'有給申請書', effect: () => addLife(1) },
}

function addHP(v){ state.hp = Math.min(100, state.hp + v); updateHUD() }
function addLife(v){ state.lives += v; updateHUD() }

let ctx, canvas, player, objects = [], bullets = [], enemyBullets = [], drops = []

function start(){
  if(state.running) return
  state.running = true
  canvas = $('#cv'); ctx = canvas.getContext('2d')
  player = { x: WIDTH/2, y: HEIGHT-60, r: 10, speed: 3 }
  objects = []; bullets = []; enemyBullets=[]; drops=[]
  spawnWaves()
  loop()
  emitToast('社畜戦士！定時を死守せよ！')
}

function updateHUD(){
  $('#sc').textContent = String(state.score).padStart(6,'0')
  $('#st').textContent = String(state.stage)
  $('#hpbar').style.width = state.hp + '%'
}

// 敵出現
function spawnWaves(){
  for(let i=0;i<10;i++){
    const label = ENEMIES[Math.floor(Math.random()*ENEMIES.length)]
    objects.push({ type:'enemy', label, x: 40+Math.random()*(WIDTH-80), y:-20-60*i, vx: (Math.random()-.5)*0.6, vy: 0.6+Math.random()*0.3, hp: 3 })
  }
  // 簡易ボス
  setTimeout(()=>{
    objects.push({ type:'boss', label:'係長', x: WIDTH/2, y:-80, vx:0, vy:0.4, hp: 120, phase:0 })
  }, 4000)
}

// 入力
const keys = {}
window.addEventListener('keydown', e=> keys[e.key]=true)
window.addEventListener('keyup', e=> keys[e.key]=false)
canvas?.addEventListener('touchmove', e=>{
  if(!player) return
  const t = e.touches[0]
  const rect = canvas.getBoundingClientRect()
  player.x = (t.clientX - rect.left) * (canvas.width/rect.width)
  player.y = (t.clientY - rect.top) * (canvas.height/rect.height)
})

function loop(){
  if(!state.running) return
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

  // 自弾
  if(perfNow()%10===0) bullets.push({x:player.x, y:player.y-12, vy:-4})
  bullets.forEach(b=> b.y+=b.vy)
  bullets = bullets.filter(b=> b.y>-20)

  // 敵移動＆射撃
  objects.forEach(o=>{
    o.x+=o.vx; o.y+=o.vy
    if(o.type==='enemy' && Math.random()<0.02){
      const text = BARRAGE[Math.floor(Math.random()*BARRAGE.length)]
      enemyBullets.push({x:o.x,y:o.y+6, vx:(Math.random()-.5)*1.6, vy:1.6, text})
    }
    if(o.type==='boss'){
      if(o.y<80) o.y+=0.6
      if(perfNow()%20===0){
        for(let k=0;k<10;k++){
          const ang = k/10*Math.PI*2 + (o.phase*0.2)
          const text = ["説教","嫌味","カイゼン","5S","見える化"][k%5]
          enemyBullets.push({x:o.x,y:o.y, vx:Math.cos(ang)*1.2, vy:Math.sin(ang)*1.2, text})
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
          state.score+= (o.type==='boss'? 500: 50)
          if(o.type==='boss') emitToast('最終出社、お疲れ様でした')
          // ドロップ
          if(Math.random()<0.5){ const d = Math.random()<0.6? 'heal':'life'; drops.push({x:o.x,y:o.y,type:d}) }
          o.vy=2; o.vx= (Math.random()-.5)*1; o.type='dead';
        }
      }
    })
  })

  // 敵弾→プレイヤー
  enemyBullets.forEach(e=>{
    e.x+=e.vx; e.y+=e.vy
    if(Math.abs(e.x-player.x)<10 && Math.abs(e.y-player.y)<12){
      state.hp -= 10; e.y=999
      emitToast(`上司：やる気ある？（撃墜）`)
      if(state.hp<=0){
        if(state.lives>0){ state.lives--; state.hp=100; emitToast('有給申請（強制）で復活') }
        else { state.running=false; emitToast('退職エンド（ジョーク）') }
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

  // 画面外クリップ
  objects = objects.filter(o=> o.y<HEIGHT+60)
}

function draw(){
  ctx.clearRect(0,0,WIDTH,HEIGHT)
  // 背景（工場ライン雰囲気）
  ctx.fillStyle = 'rgba(0,255,198,0.06)'
  for(let y=60;y<HEIGHT;y+=80){ ctx.fillRect(0,y,WIDTH,6) }

  // プレイヤー
  ctx.fillStyle = '#aeea00'
  ctx.beginPath(); ctx.arc(player.x, player.y, 6, 0, Math.PI*2); ctx.fill()

  // 自弾
  ctx.fillStyle = '#7dd3fc'
  bullets.forEach(b=>{ ctx.fillRect(b.x-1,b.y-6,2,6) })

  // 敵（文字）
  ctx.fillStyle = '#e6e6e6'
  ctx.font = 'bold 18px Noto Sans JP'
  ctx.textAlign = 'center'
  objects.forEach(o=>{
    const angry = o.type==='enemy' && o.hp<2
    ctx.save()
    if(angry){ ctx.fillStyle = '#ffb0b0' }
    ctx.fillText(o.label, o.x, o.y)
    ctx.restore()
  })

  // 敵弾（文字弾幕）
  ctx.fillStyle = '#ff4545'
  ctx.font = 'bold 14px Noto Sans JP'
  enemyBullets.forEach(e=>{ ctx.fillText(e.text, e.x, e.y) })

  // ドロップ
  ctx.fillStyle = '#00ffc6'
  ctx.font = 'bold 14px Noto Sans JP'
  drops.forEach(d=>{ ctx.fillText(DROPS[d.type].label, d.x, d.y||0) })
}

function perfNow(){ return Math.floor(performance.now()/16) }

window.addEventListener('load', mountUI)
