const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });

let width, height;
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, width, height);
}
window.addEventListener('resize', resize);
resize();

// --- 筆のパラメータ ---
const NUM_BRISTLES = 500;
const BRUSH_RADIUS = 15;
const MAX_LENGTH = 40;

const bristles = [];
for (let i = 0; i < NUM_BRISTLES; i++) {
    // 円内にランダム配置 (平方根をとることで一様に分布させる)
    let r = BRUSH_RADIUS * Math.sqrt(Math.random());
    let theta = Math.random() * Math.PI * 2;
    let rx = r * Math.cos(theta);
    let ry = r * Math.sin(theta);
    
    // 中央が長く、外側が短い（筆特有のとがっている形状）
    let L = MAX_LENGTH * (1 - 0.7 * (r / BRUSH_RADIUS)); 
    
    bristles.push({
        rx, ry, L,
        x: 0, y: 0, z: 0,
        px: 0, py: 0, pz: 0,
        vx: 0, vy: 0, vz: 0,
        wasOnPaper: false
    });
}

// --- 入力状態 ---
let pointer = {
    active: false,
    x: 0, y: 0,
    z: MAX_LENGTH + 10 // 初期状態は浮いている
};
let prevPointer = { x: 0, y: 0, z: MAX_LENGTH + 10 };

// 右上長押し検知用
let clearTimer = null;
const CLEAR_ZONE_SIZE = 60; // 画面右上の約1cm (余裕を持って60px)
const CLEAR_HOLD_TIME = 1000; // 1秒長押し

function getPressureZ(e) {
    // event.width, event.heightから押し込み量（筆圧）の係数を計算
    let size = Math.max(e.width || 1, e.height || 1);
    
    // sizeの想定範囲: 軽いタッチ(5~10) 〜 強いタッチ(40~50)
    let pressureCoeff = Math.min(1, Math.max(0, (size - 5) / 40)); 
    
    // Z座標を決定。0が紙面。
    // 係数が0の時 Z = 0.95 * MAX_LENGTH (先端が少し触れる程度)
    // 係数が1の時 Z はマイナスになり、毛が大きくたわむ
    let currentZ = MAX_LENGTH * 0.95 - (MAX_LENGTH * 1.5 * pressureCoeff);
    
    // タッチ非対応環境(PCなど)では常に1になることがあるため、フォールバック（動作保証外だが一応描けるように）
    if (e.pointerType === 'mouse' || (e.width === 1 && e.height === 1)) {
        currentZ = MAX_LENGTH * 0.3; // 中くらいの太さ
    }
    
    return currentZ;
}

canvas.addEventListener('pointerdown', (e) => {
    // 全消去ゾーンの判定
    if (e.clientX > width - CLEAR_ZONE_SIZE && e.clientY < CLEAR_ZONE_SIZE) {
        clearTimer = setTimeout(() => {
            if (confirm('画面をすべて消去しますか？')) {
                ctx.fillStyle = '#f5f5f0';
                ctx.fillRect(0, 0, width, height);
            }
            clearTimer = null;
        }, CLEAR_HOLD_TIME);
        return; // 全消去ゾーンタッチ時は描画モードに入らない
    }

    canvas.setPointerCapture(e.pointerId);
    pointer.active = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.z = getPressureZ(e);
    
    // 初回タッチ時の初期化
    prevPointer.x = pointer.x;
    prevPointer.y = pointer.y;
    prevPointer.z = pointer.z;
    
    // 毛の内部状態を即座に筆の位置へ移動
    for (let b of bristles) {
        b.x = pointer.x + b.rx;
        b.y = pointer.y + b.ry;
        b.z = pointer.z;
        b.px = b.x;
        b.py = b.y;
        b.pz = b.z;
        b.vx = 0; b.vy = 0; b.vz = 0;
        b.wasOnPaper = false;
    }
});

canvas.addEventListener('pointermove', (e) => {
    if (clearTimer) {
        // 消去ゾーンから指が動いたらキャンセル
        if (Math.abs(e.clientX - (width - CLEAR_ZONE_SIZE/2)) > CLEAR_ZONE_SIZE || 
            Math.abs(e.clientY - CLEAR_ZONE_SIZE/2) > CLEAR_ZONE_SIZE) {
            clearTimeout(clearTimer);
            clearTimer = null;
        }
    }

    if (!pointer.active) return;
    
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.z = getPressureZ(e);
});

function endPointer(e) {
    if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
    }
    if (pointer.active) {
        pointer.active = false;
        pointer.z = MAX_LENGTH + 10;
        canvas.releasePointerCapture(e.pointerId);
    }
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);


// --- シミュレーションと描画ループ ---
function loop() {
    requestAnimationFrame(loop);
    
    if (!pointer.active && prevPointer.z > MAX_LENGTH) {
        return; // 完全に浮いている場合は処理をスキップ
    }

    // pointermove間を補間して滑らかに描画する
    let dist = Math.sqrt(
        (pointer.x - prevPointer.x)**2 + 
        (pointer.y - prevPointer.y)**2 +
        (pointer.z - prevPointer.z)**2
    );
    
    // 距離に応じてサブステップ数を決定
    let steps = Math.ceil(dist / 3); 
    if (steps > 30) steps = 30; // 制限
    if (steps === 0) steps = 1;
    
    let stepDx = (pointer.x - prevPointer.x) / steps;
    let stepDy = (pointer.y - prevPointer.y) / steps;
    let stepDz = (pointer.z - prevPointer.z) / steps;
    
    for (let s = 0; s < steps; s++) {
        let hx = prevPointer.x + stepDx * (s + 1);
        let hy = prevPointer.y + stepDy * (s + 1);
        let hz = prevPointer.z + stepDz * (s + 1);
        
        ctx.beginPath();
        
        for (let b of bristles) {
            let rootX = hx + b.rx;
            let rootY = hy + b.ry;
            let rootZ = hz;
            
            // 毛の本来のまとまる先（中心方向へ向く）
            let converge = 0.2; 
            let targetX = hx + b.rx * converge;
            let targetY = hy + b.ry * converge;
            let targetZ = rootZ - b.L;
            
            // バネモデルによる力
            let spring = 0.4;
            b.vx += (targetX - b.x) * spring;
            b.vy += (targetY - b.y) * spring;
            b.vz += (targetZ - b.z) * spring;
            
            b.x += b.vx;
            b.y += b.vy;
            b.z += b.vz;
            
            let onPaper = false;
            
            // 紙面(Z=0)との衝突
            if (b.z <= 0) {
                b.z = 0;
                onPaper = true;
                
                // 紙との摩擦
                b.vx *= 0.5;
                b.vy *= 0.5;
                if (b.vz < 0) b.vz = 0;
                
                let compression = b.L - rootZ; 
                if (compression > 0) {
                    // 毛先が逃げるシミュレート
                    let outLen = Math.sqrt(b.rx * b.rx + b.ry * b.ry) || 1;
                    
                    // 1. 押し込まれたことによって外側に広がる
                    let splayForce = (compression / b.L) * 1.5; 
                    b.vx += (b.rx / outLen) * splayForce;
                    b.vy += (b.ry / outLen) * splayForce;
                    
                    // 2. 進行方向の逆方向に逃げる（引きずる効果）
                    b.vx -= stepDx * 0.4;
                    b.vy -= stepDy * 0.4;
                }
            } else {
                // 空中での減衰
                b.vx *= 0.8;
                b.vy *= 0.8;
                b.vz *= 0.8;
            }
            
            // 距離制約 (IK: 根元から長さLを超えて離れない)
            let cx = b.x - rootX;
            let cy = b.y - rootY;
            let cz = b.z - rootZ;
            let currentLen = Math.sqrt(cx*cx + cy*cy + cz*cz);
            
            if (currentLen > b.L) {
                let scale = b.L / currentLen;
                b.x = rootX + cx * scale;
                b.y = rootY + cy * scale;
                b.z = rootZ + cz * scale;
                b.vx *= 0.5;
                b.vy *= 0.5;
            }
            
            // 描画
            if (onPaper && b.wasOnPaper) {
                ctx.moveTo(b.px, b.py);
                ctx.lineTo(b.x, b.y);
            }
            
            b.px = b.x;
            b.py = b.y;
            b.pz = b.z;
            b.wasOnPaper = onPaper;
        }
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
    
    prevPointer.x = pointer.x;
    prevPointer.y = pointer.y;
    prevPointer.z = pointer.z;
}

// 実行
loop();
