// =======================================================
// FAST 8-LAYER AI GEN + PROGRESS BAR + NON-LAG SYNTH (sound strings)
// + CHAOS LEVEL (temp scaler) + MORE GENRES + SMALL GENRE TAG DISPLAY
//
// Key docs used:
// - game.askForString(message, answerLength, useOnScreenKeyboard) 
// - game.onUpdateInterval(period, handler) 【1-f1ca3b】
// - game.onPaint(handler) 
// - music.setVolume(0..255) 
// - sound-string commands ~ @ ! ^ 
// - music.stringPlayable(melody, tempo) 
// =======================================================

music.setVolume(255) // 

// ---------- PROMPTS ----------
let bpm = game.askForNumber("BPM 80-170", 3, false)
if (bpm < 80) bpm = 80
if (bpm > 170) bpm = 170

let bars = game.askForNumber("Bars 8-96", 2, false)
if (bars < 8) bars = 8
if (bars > 96) bars = 96

// ✅ Option A: tiny genre prompt screen
// Type one of: hiphop, house, dnb, chill, trap, techno, synthwave, lofi, chiptune
let genreRaw = game.askForString("Genre?", 10, false) // 

let chaos = game.askForNumber("Chaos 0-100", 3, false)
if (chaos < 0) chaos = 0
if (chaos > 100) chaos = 100

game.splash("A=Generate+Play", "B=Stop")

let stepMs = Math.floor(60000 / (bpm * 4)) // 16th note
if (stepMs < 45) stepMs = 45

// ---------- helpers ----------
function normGenre(s: string): string {
    let t = s.toLowerCase()
    t = t.split(" ").join("")
    return t
}
let genre = normGenre(genreRaw)

function genreTag(g: string): string {
    if (g == "hiphop") return "HH"
    if (g == "house") return "HS"
    if (g == "dnb") return "DNB"
    if (g == "chill") return "CHL"
    if (g == "trap") return "TRP"
    if (g == "techno") return "TNO"
    if (g == "synthwave") return "SYN"
    if (g == "lofi") return "LOFI"
    if (g == "chiptune") return "CHIP"
    return g.substr(0, 4).toUpperCase()
}
let gTag = genreTag(genre)

// chaos scaler:
// 0 -> 0.65x (tighter), 100 -> 2.10x (wild)
let chaosScale = 0.65 + (chaos / 100) * 1.45

function hookChance(): number {
    // base 55, + up to 20 (capped)
    let c = 55 + Math.floor((chaos / 100) * 20)
    if (c > 75) c = 75
    return c
}

// ---------- UI / PROGRESS ----------
let generating = false
let playing = false
let genTotal = 0
let genDone = 0
let statusText = "Press A"
let playStep = 0

// visualizer
let eq: number[] = []
for (let i = 0; i < 16; i++) eq.push(0)

// ---------- MUSIC TABLES ----------
let scaleHz: number[] = [262, 294, 330, 349, 392, 440, 494, 523]
let bassHz: number[] = [98, 110, 123, 131, 147, 165, 175, 196]

// chord prog by genre (roots)
let prog: number[] = [0, 5, 0, 3]
function setProgForGenre(g: string) {
    if (g == "house") prog = [0, 3, 5, 3]
    else if (g == "dnb") prog = [0, 5, 3, 6]
    else if (g == "chill") prog = [0, 2, 4, 2]
    else if (g == "hiphop") prog = [0, 5, 0, 3]
    else if (g == "trap") prog = [0, 5, 3, 0]
    else if (g == "techno") prog = [0, 0, 5, 0]
    else if (g == "synthwave") prog = [0, 3, 4, 5]
    else if (g == "lofi") prog = [0, 2, 5, 2]
    else if (g == "chiptune") prog = [0, 4, 5, 3]
    else prog = [0, 5, 0, 3]
}
setProgForGenre(genre)

function chordRoot(bar: number): number { return prog[bar & 3] & 7 }

// sections
function secOfBar(b: number): number {
    if (b < 2) return 0
    if (b < 6) return 1
    if (b < 10) return 2
    if (b < 12) return 3
    return ((b & 7) < 4) ? 2 : 1
}
function secName(s: number): string {
    if (s == 0) return "INTRO"
    if (s == 1) return "VERSE"
    if (s == 2) return "CHORUS"
    return "BRIDGE"
}
function baseTempForSec(s: number): number {
    if (s == 0) return 0.15
    if (s == 1) return 0.30
    if (s == 2) return 0.55
    return 0.40
}
function tempForSec(s: number): number {
    return baseTempForSec(s) * chaosScale
}

// chorus hook motif
let motif: number[] = [0, 2, 4, 2, 5, 4, 2, 0]
function motifNote(stepInBar: number, root: number): number {
    let base = motif[(stepInBar >> 1) & 7]
    let n = base + root
    while (n > 7) n -= 7
    if (n < 0) n = 0
    return n & 7
}

// drums patterns
let kick: number[] = []
let snare: number[] = []
let hat: number[] = []

function setDrums(g: string) {
    // default hiphop-ish
    kick = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0]
    snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    hat = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]

    if (g == "house" || g == "techno") {
        kick = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
        snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
        hat = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    } else if (g == "dnb") {
        kick = [1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0]
        snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
        hat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    } else if (g == "chill" || g == "lofi") {
        kick = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]
        snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
        hat = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0]
    } else if (g == "trap") {
        kick = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
        snare = [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
        hat = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
    } else if (g == "synthwave") {
        kick = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0]
        snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
        hat = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
    } else if (g == "chiptune") {
        kick = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]
        snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
        hat = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    }
}
setDrums(genre)

// ---------- SOUND STRINGS (lightweight) ----------
// Sound-string commands documented (~ @ ! ^) 
function playKick() {
    if (genre == "trap") {
        music.play(music.stringPlayable("~3 @0,8,230,25 !160,75^55", bpm), music.PlaybackMode.InBackground) // 
    } else {
        music.play(music.stringPlayable("~3 @0,10,220,30 !180,70^60", bpm), music.PlaybackMode.InBackground) // 
    }
}
function playSnare() {
    music.play(music.stringPlayable("~5 @0,3,200,20 !9000,45", bpm), music.PlaybackMode.InBackground) // 
}
function playHat() {
    if (genre == "trap") {
        music.play(music.stringPlayable("~5 @0,0,120,8 !13000,12", bpm), music.PlaybackMode.InBackground) // 
    } else {
        music.play(music.stringPlayable("~5 @0,0,120,10 !13000,18", bpm), music.PlaybackMode.InBackground) // 
    }
}
function playBass(root: number) {
    let hz = bassHz[root & 7]
    if (genre == "techno" || genre == "house") {
        music.play(music.stringPlayable("~1 @0,8,200,30 !" + hz + ",75", bpm), music.PlaybackMode.InBackground) // 
    } else {
        music.play(music.stringPlayable("~1 @0,10,200,40 !" + hz + ",90", bpm), music.PlaybackMode.InBackground) // 
    }
}
function playLead(note: number, sec: number) {
    let hz = scaleHz[note & 7]
    let dur = (sec == 2) ? 85 : 65

    if (genre == "chiptune") {
        music.play(music.stringPlayable("~15 @0,6,170,18 !" + hz + "," + dur + "^" + (hz + 10), bpm), music.PlaybackMode.InBackground) // 
    } else if (genre == "synthwave") {
        music.play(music.stringPlayable("~13 @0,10,150,28 !" + hz + "," + (dur + 10) + "^" + (hz + 6), bpm), music.PlaybackMode.InBackground) // 
    } else {
        music.play(music.stringPlayable("~14 @0,8,160,25 !" + hz + "," + dur + "^" + (hz + 8), bpm), music.PlaybackMode.InBackground) // 
    }
}

// ---------- UI DRAW ----------
game.onPaint(function () { // 
    screen.fill(1)
    for (let i = 0; i < 16; i++) {
        let h = eq[i]
        if (h > 80) h = 80
        screen.fillRect(i * 10, 120 - h, 9, h, 9 + (i % 6))
        eq[i] = Math.floor(eq[i] * 0.86)
    }

    screen.fillRect(0, 0, 160, 40, 1)
    screen.print(statusText, 2, 2, 15)

    if (generating) {
        let x = 10, y = 18, w = 140, h = 8
        screen.fillRect(x, y, w, h, 3)
        let fill = 0
        if (genTotal > 0) fill = Math.floor((genDone * w) / genTotal)
        if (fill < 0) fill = 0
        if (fill > w) fill = w
        screen.fillRect(x, y, fill, h, 7)
        screen.print(Math.floor((genDone * 100) / (genTotal == 0 ? 1 : genTotal)) + "%", 2, 30, 15)
    }
})

// =======================================================
// 8-LAYER MODEL (Input 29 -> 6 hidden -> Output 8)
// =======================================================

const NOTE_N = 8
const BEAT_G = 4
const SEC_N = 4
const INT_N = 5
const IN = NOTE_N + NOTE_N + BEAT_G + SEC_N + INT_N
const OUT = NOTE_N

const H1 = 24, H2 = 24, H3 = 20, H4 = 20, H5 = 16, H6 = 16

let W1: number[] = []; let B1: number[] = []
let W2: number[] = []; let B2: number[] = []
let W3: number[] = []; let B3: number[] = []
let W4: number[] = []; let B4: number[] = []
let W5: number[] = []; let B5: number[] = []
let W6: number[] = []; let B6: number[] = []
let W7: number[] = []; let B7: number[] = []
let a1: number[] = []; let a2: number[] = []; let a3: number[] = []
let a4: number[] = []; let a5: number[] = []; let a6: number[] = []
let outv: number[] = []

function rw(): number { return randint(-18, 18) / 18 }
function relu(x: number): number { return x > 0 ? x : 0 }

function initArray(n: number): number[] { let a: number[] = []; for (let i = 0; i < n; i++) a.push(0); return a }
function initMat(r: number, c: number): number[] { let m: number[] = []; for (let i = 0; i < r * c; i++) m.push(rw()); return m }
function initBias(n: number): number[] { let b: number[] = []; for (let i = 0; i < n; i++) b.push(rw()); return b }

function initNet() {
    W1 = initMat(H1, IN); B1 = initBias(H1); a1 = initArray(H1)
    W2 = initMat(H2, H1); B2 = initBias(H2); a2 = initArray(H2)
    W3 = initMat(H3, H2); B3 = initBias(H3); a3 = initArray(H3)
    W4 = initMat(H4, H3); B4 = initBias(H4); a4 = initArray(H4)
    W5 = initMat(H5, H4); B5 = initBias(H5); a5 = initArray(H5)
    W6 = initMat(H6, H5); B6 = initBias(H6); a6 = initArray(H6)
    W7 = initMat(OUT, H6); B7 = initBias(OUT); outv = initArray(OUT)
}

function idx_cur(n: number) { return (n & 7) }
function idx_chord(r: number) { return NOTE_N + (r & 7) }
function idx_beat(g: number) { return NOTE_N + NOTE_N + (g & 3) }
function idx_sec(s: number) { return NOTE_N + NOTE_N + BEAT_G + (s & 3) }
function idx_int(i: number) { return NOTE_N + NOTE_N + BEAT_G + SEC_N + (i & 4) }

function layer0To1(cur: number, root: number, beatG: number, sec: number, ib: number) {
    let i0 = idx_cur(cur), i1 = idx_chord(root), i2 = idx_beat(beatG), i3 = idx_sec(sec), i4 = idx_int(ib)
    for (let h = 0; h < H1; h++) {
        let base = h * IN
        let sum = B1[h]
        sum += W1[base + i0] + W1[base + i1] + W1[base + i2] + W1[base + i3] + W1[base + i4]
        a1[h] = relu(sum)
    }
}
function matRelu(inp: number[], inSize: number, W: number[], B: number[], outA: number[], outSize: number) {
    for (let o = 0; o < outSize; o++) {
        let sum = B[o]
        let base = o * inSize
        for (let i = 0; i < inSize; i++) sum += W[base + i] * inp[i]
        outA[o] = relu(sum)
    }
}
function matLin(inp: number[], inSize: number, W: number[], B: number[], outA: number[], outSize: number) {
    for (let o = 0; o < outSize; o++) {
        let sum = B[o]
        let base = o * inSize
        for (let i = 0; i < inSize; i++) sum += W[base + i] * inp[i]
        outA[o] = sum
    }
}
function forward(cur: number, root: number, beatG: number, sec: number, ib: number) {
    layer0To1(cur, root, beatG, sec, ib)
    matRelu(a1, H1, W2, B2, a2, H2)
    matRelu(a2, H2, W3, B3, a3, H3)
    matRelu(a3, H3, W4, B4, a4, H4)
    matRelu(a4, H4, W5, B5, a5, H5)
    matRelu(a5, H5, W6, B6, a6, H6)
    matLin(a6, H6, W7, B7, outv, OUT)
}
function intBucket(a: number, b: number): number {
    let d = a - b
    if (d < -1) return 0
    if (d == -1) return 1
    if (d == 0) return 2
    if (d == 1) return 3
    return 4
}
function chordBonus(root: number) {
    let gravity = 0.60 - (chaos / 100) * 0.25
    if (gravity < 0.30) gravity = 0.30

    let r = root & 7
    outv[r] += gravity
    outv[(r + 2) & 7] += gravity * 0.58
    outv[(r + 4) & 7] += gravity * 0.42
}
function pickNext(temp: number, root: number): number {
    chordBonus(root)
    let bestI = 0
    let bestV = outv[0] + (randint(-100, 100) / 100) * temp
    for (let i = 1; i < OUT; i++) {
        let v = outv[i] + (randint(-100, 100) / 100) * temp
        if (v > bestV) { bestV = v; bestI = i }
    }
    return bestI
}

// ---------- SONG STORAGE ----------
let melody: number[] = []
let g_cur = randint(0, 7)
let g_last = g_cur

// ---------- GENERATION (smooth UI) ----------
game.onUpdateInterval(10, function () { // 【1-f1ca3b】
    if (!generating) return

    let chunk = 64
    for (let k = 0; k < chunk && genDone < genTotal; k++) {
        let step = genDone
        let bar = Math.idiv(step, 16)
        let sInBar = step & 15

        let root = chordRoot(bar)
        let sec = secOfBar(bar)
        let beatG = (sInBar >> 2) & 3
        let ib = intBucket(g_cur, g_last)

        if (sec == 2 && randint(0, 99) < hookChance()) {
            g_last = g_cur
            g_cur = motifNote(sInBar, root)
        } else {
            forward(g_cur, root, beatG, sec, ib)
            g_last = g_cur
            g_cur = pickNext(tempForSec(sec), root)
        }

        melody.push(g_cur)
        genDone++
    }

    if (genDone >= genTotal) {
        generating = false
        playing = true
        playStep = 0
        statusText = "PLAY"
    }
})

// ---------- PLAYBACK ----------
game.onUpdateInterval(stepMs, function () { // 【1-f1ca3b】
    if (!playing) return

    if (playStep >= genTotal) {
        playing = false
        statusText = "Done! Press A"
        music.stopAllSounds()
        return
    }

    let bar = Math.idiv(playStep, 16)
    let sInBar = playStep & 15
    let root = chordRoot(bar)
    let sec = secOfBar(bar)

    // small status: "SYN CHORUS 7/64"
    statusText = gTag + " " + secName(sec) + " " + (bar + 1) + "/" + bars

    if (kick[sInBar]) { playKick(); eq[sInBar] = 80 }
    if (snare[sInBar]) { playSnare(); eq[(sInBar + 4) & 15] = 70 }
    if (hat[sInBar]) { playHat(); eq[(sInBar + 8) & 15] = 45 }

    if ((sInBar & 3) == 0) playBass(root)

    let leadNow = (sec == 2) ? ((sInBar & 1) == 0) : ((sInBar & 3) == 0)
    if (genre == "chiptune" && (sInBar & 1) == 0) leadNow = true
    if (genre == "trap" && (sInBar & 3) != 0) leadNow = false

    if (leadNow) {
        playLead(melody[playStep] & 7, sec)
        eq[(sInBar + 2) & 15] = 75
    }

    playStep++
})

// ---------- CONTROLS ----------
controller.A.onEvent(ControllerButtonEvent.Pressed, function () {
    music.stopAllSounds()
    playing = false
    generating = false

    initNet()
    melody = []

    genTotal = bars * 16
    genDone = 0
    g_cur = randint(0, 7)
    g_last = g_cur

    generating = true
    // small generating label
    statusText = "GEN " + gTag + " C" + chaos
})

controller.B.onEvent(ControllerButtonEvent.Pressed, function () {
    generating = false
    playing = false
    statusText = "Stopped. Press A"
    music.stopAllSounds()
})