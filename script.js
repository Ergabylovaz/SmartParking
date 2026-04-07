// ========= ПОЛНОСТЬЮ ИСПРАВЛЕННЫЙ КОД С РАБОЧИМ ЗВУКОМ ========= //

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ПЕРЕМЕННЫЕ ---
let currentDistance = 80;
let isStopped = false;
let beepCount = 0;
let beepInterval = null;
let mode = 'manual';
let difficulty = 'easy';
let lastDistance = 80;
let stopTime = Date.now();

// ПОЗИЦИЯ МАШИНЫ
let carPositionZ = -2;
let targetCarPositionZ = -2;
const WALL_Z = 2;
const CAR_LENGTH = 3.5;
const MIN_DIST_CM = 30;
const MAX_DIST_CM = 150;

function distanceToZ(distCm) {
    return WALL_Z - CAR_LENGTH/2 - distCm / 100;
}

function zToDistance(carZ) {
    const noseZ = carZ + CAR_LENGTH/2;
    return Math.max(0, Math.min(MAX_DIST_CM, (WALL_Z - noseZ) * 100));
}

let scene, camera, renderer, controls, carModel;
let moveSpeed = 0.03;
let moveInterval = null;
let autoRunning = false;

// ========= ИСПРАВЛЕННЫЙ ЗВУК (РАБОТАЕТ КАК В ОРИГИНАЛЕ) ========= //
let audioEnabled = false;
let audioCtx = null;

function beep(frequency, duration) {
    if (!audioEnabled || !audioCtx) return;

    try {
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        oscillator.connect(gain);
        gain.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;

        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
            0.00001,
            audioCtx.currentTime + duration / 1000
        );

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration / 1000);
    } catch(e) {
        console.warn('Beep error:', e);
    }
}

function playBeep(freq, duration) {
    if (!audioEnabled) return;
    beep(freq, duration);
}

// ========= ГЛАВНОЕ ИСПРАВЛЕНИЕ: РАЗБЛОКИРОВКА ЗВУКА ========= //
document.addEventListener('click', function enableAudioOnClick() {
    if (audioEnabled) return;

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        audioCtx.resume().then(() => {
            audioEnabled = true;
            console.log('🔊 ЗВУК ВКЛЮЧЕН!');

            // Тестовый сигнал
            beep(800, 100);

            // Обновляем UI
            const beepStatus = document.getElementById('beepStatus');
            if (beepStatus) beepStatus.textContent = '🎵 Звук активен';
        }).catch(err => {
            console.warn('AudioContext resume error:', err);
        });

    } catch(e) {
        console.error('AudioContext creation error:', e);
    }
});

// ========= ОБНОВЛЕНИЕ UI С ПИЩАЛКОЙ (ИСПРАВЛЕНО) ========= //
function updateUIDistance() {
    const dist = Math.round(currentDistance);
    document.getElementById('distVal').textContent = dist;
    document.getElementById('sliderOut').textContent = dist + ' см';
    if (mode === 'manual') document.getElementById('distSlider').value = dist;

    const ledG = document.getElementById('ledG');
    const ledR = document.getElementById('ledR');
    const statusBar = document.getElementById('statusBar');

    ledG.className = 'led off';
    ledR.className = 'led off';

    const isReallyStopped = (Date.now() - stopTime > 2000) || isStopped;

    if (dist > 60) {
        ledG.className = 'led green';
        statusBar.className = 'status-bar status-free';
        statusBar.textContent = '✅ Свободно — двигайтесь вперёд';
        if (beepInterval) { 
            clearInterval(beepInterval); 
            beepInterval = null; 
        }
        document.getElementById('beepStatus').textContent = '—';
    }
    else if (dist > 10) {
        ledR.className = 'led red';
        statusBar.className = 'status-bar status-warn';
        statusBar.textContent = '⚠️ Приближение — будьте осторожны!';
        
        if (!isReallyStopped && !isStopped) {
            const beepDelay = Math.max(80, Math.min(400, 400 - (dist - 10) * 6));
            if (beepInterval) {
                clearInterval(beepInterval);
            }
            beepInterval = setInterval(() => {
                if (!isStopped && !isReallyStopped && currentDistance > 10 && currentDistance <= 60) {
                    beepCount++;
                    document.getElementById('beepCount').textContent = beepCount;
                    playBeep(1000, 80);
                    document.getElementById('beepStatus').textContent = `📢 Пик каждые ${beepDelay}мс`;
                }
            }, beepDelay);
        } else if (beepInterval) { 
            clearInterval(beepInterval); 
            beepInterval = null; 
        }
    }
    else {
        ledR.className = 'led red';
        statusBar.className = 'status-bar status-stop';
        statusBar.textContent = '🛑 СТОП — очень близко!';
        
        if (!isReallyStopped && !isStopped) {
            if (beepInterval) {
                clearInterval(beepInterval);
            }
            beepInterval = setInterval(() => {
                if (!isStopped && !isReallyStopped && currentDistance <= 10) {
                    beepCount++;
                    document.getElementById('beepCount').textContent = beepCount;
                    playBeep(2000, 60);
                    document.getElementById('beepStatus').textContent = '🚨 НЕПРЕРЫВНЫЙ СИГНАЛ!';
                }
            }, 120);
        } else if (beepInterval) { 
            clearInterval(beepInterval); 
            beepInterval = null; 
        }
    }

    if (isStopped) {
        document.getElementById('finalDist').textContent = dist + ' см';
        let badge, cls;
        if (dist <= 10) { badge = '🏆 Отлично!'; cls = 'badge-good'; }
        else if (dist <= 30) { badge = '👍 Нормально'; cls = 'badge-ok'; }
        else { badge = '📏 Слишком далеко'; cls = 'badge-bad'; }
        document.getElementById('scoreBadge').innerHTML = `<span class="badge ${cls}">${badge}</span>`;
    }
}

function setCarPosition(newZ) {
    const minZ = WALL_Z - CAR_LENGTH/2 - MIN_DIST_CM/100;
    const maxZ = distanceToZ(MAX_DIST_CM);
    carPositionZ = Math.max(minZ, Math.min(maxZ, newZ));
    targetCarPositionZ = carPositionZ;
    if (carModel) {
        carModel.position.z = carPositionZ;
    }
    currentDistance = zToDistance(carPositionZ);
    updateUIDistance();
}

function moveCar(direction) {
    if (isStopped) return;
    
    let newZ = carPositionZ + direction * moveSpeed;
    const minAllowedZ = WALL_Z - CAR_LENGTH/2 - MIN_DIST_CM/100;
    
    if (direction < 0 && newZ < minAllowedZ) {
        newZ = minAllowedZ;
        if (newZ === minAllowedZ && currentDistance <= MIN_DIST_CM) {
            stopCar();
            return;
        }
    }
    
    const maxAllowedZ = distanceToZ(MAX_DIST_CM);
    if (direction > 0 && newZ > maxAllowedZ) {
        newZ = maxAllowedZ;
    }
    
    carPositionZ = newZ;
    targetCarPositionZ = carPositionZ;
    if (carModel) carModel.position.z = carPositionZ;
    currentDistance = zToDistance(carPositionZ);
    updateUIDistance();
}

function startMoving(dir) {
    if (moveInterval) clearInterval(moveInterval);
    if (isStopped) { 
        isStopped = false; 
        stopTime = Date.now();
        if (beepInterval) { 
            clearInterval(beepInterval); 
            beepInterval = null; 
        }
    }
    moveInterval = setInterval(() => moveCar(dir), 16);
}

function stopMoving() {
    if (moveInterval) { 
        clearInterval(moveInterval); 
        moveInterval = null; 
    }
}

function stopCar() {
    stopMoving();
    isStopped = true;
    if (beepInterval) { 
        clearInterval(beepInterval); 
        beepInterval = null; 
    }
    document.getElementById('beepStatus').textContent = '⏸ Остановлено';
    updateUIDistance();
}

function setDistanceManually(value) {
    if (mode !== 'manual') return;
    const distCm = parseFloat(value);
    targetCarPositionZ = distanceToZ(distCm);
    currentDistance = distCm;
    updateUIDistance();
}

function startAutoSim() {
    if (autoRunning) return;
    autoRunning = true;
    isStopped = false;
    beepCount = 0;
    document.getElementById('beepCount').textContent = '0';
    setCarPosition(distanceToZ(MAX_DIST_CM));
    
    let speed = difficulty === 'easy' ? 0.025 : (difficulty === 'medium' ? 0.04 : 0.055);
    moveSpeed = speed;
    
    function autoStep() {
        if (!autoRunning || isStopped) return;
        moveCar(-1);
        if (currentDistance <= MIN_DIST_CM + 2) {
            stopCar();
            autoRunning = false;
            document.getElementById('beepStatus').textContent = '✅ Запаркован!';
        } else {
            requestAnimationFrame(autoStep);
        }
    }
    requestAnimationFrame(autoStep);
}

function init3D() {
    const container = document.getElementById('canvas-container');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xE8E8E8);
    scene.fog = new THREE.FogExp2(0xE8E8E8, 0.008);
    
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(3.5, 2.0, 2.8);
    camera.lookAt(0, 0, -1.5);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, -1.5);
    controls.enableZoom = true;
    controls.zoomSpeed = 1.2;
    
    // --- ОСВЕЩЕНИЕ ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(4, 6, 3);
    mainLight.castShadow = true;
    mainLight.receiveShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    scene.add(mainLight);
    
    const fillLight = new THREE.PointLight(0x88aaff, 0.4);
    fillLight.position.set(-2, 2.5, -1);
    scene.add(fillLight);
    
    const backLight = new THREE.PointLight(0xffaa66, 0.3);
    backLight.position.set(2, 1.5, -3);
    scene.add(backLight);
    
    // --- ПОЛ ---
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.65, metalness: 0.05 });
    const groundPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.42;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);
    
    // Сетка на полу
    const gridHelper = new THREE.GridHelper(8, 20, 0x888888, 0xaaaaaa);
    gridHelper.position.y = -0.4;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.35;
    scene.add(gridHelper);
    
    // --- СТЕНА ---
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a9aaa, roughness: 0.3 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.15), wallMat);
    wall.position.set(0, 0.35, WALL_Z);
    wall.receiveShadow = true;
    wall.castShadow = true;
    scene.add(wall);
    
    // Красная полоса на стене
    const redStrip = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.1, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xef4444 })
    );
    redStrip.position.set(0, 0.7, WALL_Z + 0.05);
    scene.add(redStrip);
    
    // Желтая полоса
    const yellowStrip = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.08, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xfbbf24 })
    );
    yellowStrip.position.set(0, 0.55, WALL_Z + 0.05);
    scene.add(yellowStrip);
    
    // --- ПАРКОВОЧНАЯ РАЗМЕТКА ---
    function updateParkingLines() {
        const pw = difficulty === 'easy' ? 2.5 : (difficulty === 'medium' ? 2.1 : 1.8);
        const leftX = -pw/2;
        const rightX = pw/2;
        
        if (window.parkingLines) {
            window.parkingLines.forEach(line => scene.remove(line));
        }
        
        window.parkingLines = [];
        
        const lineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
        
        const leftPoints = [new THREE.Vector3(leftX, -0.39, -2.8), new THREE.Vector3(leftX, -0.39, 0.3)];
        const leftLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftPoints), lineMat);
        scene.add(leftLine);
        window.parkingLines.push(leftLine);
        
        const rightPoints = [new THREE.Vector3(rightX, -0.39, -2.8), new THREE.Vector3(rightX, -0.39, 0.3)];
        const rightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightPoints), lineMat);
        scene.add(rightLine);
        window.parkingLines.push(rightLine);
        
        const backPoints = [new THREE.Vector3(leftX, -0.39, -2.8), new THREE.Vector3(rightX, -0.39, -2.8)];
        const backLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(backPoints), lineMat);
        scene.add(backLine);
        window.parkingLines.push(backLine);
    }
    updateParkingLines();
    
    // --- ЗАГРУЗКА ТВОЕГО PORSCHE ИЗ ПАПКИ car ---
    const loader = new GLTFLoader();
    console.log('🔍 Загрузка твоего Porsche из папки car...');
    console.log('📍 Путь: ./car/scene.gltf');
    
    loader.load('./car/scene.gltf', 
        (gltf) => {
            console.log('✅ ТВОЙ PORSCHE УСПЕШНО ЗАГРУЖЕН!');
            carModel = gltf.scene;
            
            carModel.position.set(0, 0.1, carPositionZ);
            carModel.scale.set(0.8, 0.8, 0.8);
            carModel.rotation.y = Math.PI;
            
            carModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            scene.add(carModel);
            console.log(`Машина на позиции: Y=0.1, Z=${carPositionZ}`);
        },
        (progress) => {
            if (progress.lengthComputable) {
                console.log(`Загрузка: ${Math.round(progress.loaded / progress.total * 100)}%`);
            }
        },
        (error) => {
            console.error('❌ ОШИБКА загрузки твоего Porsche:', error);
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'absolute';
            errorDiv.style.bottom = '100px';
            errorDiv.style.left = '20px';
            errorDiv.style.background = 'rgba(0,0,0,0.8)';
            errorDiv.style.color = '#ff6666';
            errorDiv.style.padding = '10px';
            errorDiv.style.borderRadius = '8px';
            errorDiv.style.fontSize = '12px';
            errorDiv.style.fontFamily = 'monospace';
            errorDiv.style.zIndex = '1000';
            errorDiv.innerHTML = '❌ Модель Porsche не загружена!<br>Проверь папку "car" и файл "scene.gltf"';
            document.body.appendChild(errorDiv);
            createFallbackCar();
        }
    );
    
    function createFallbackCar() {
        console.log('🚗 Создаю простую машину (Porsche не загрузился)');
        const fallbackCar = new THREE.Group();
        
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xC0C0C0, metalness: 0.85 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 2.5), bodyMat);
        body.castShadow = true;
        fallbackCar.add(body);
        
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.24, 1.6), roofMat);
        roof.position.y = 0.28;
        roof.castShadow = true;
        fallbackCar.add(roof);
        
        const wheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.5, 24);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const positions = [[-0.85, -0.12, -1.05], [0.85, -0.12, -1.05], [-0.85, -0.12, 1.0], [0.85, -0.12, 1.0]];
        positions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos[0], pos[1], pos[2]);
            wheel.castShadow = true;
            fallbackCar.add(wheel);
        });
        
        fallbackCar.position.set(0, -0.2, carPositionZ);
        fallbackCar.rotation.y = Math.PI;
        carModel = fallbackCar;
        scene.add(carModel);
    }
    
    // --- АНИМАЦИЯ С ПЛАВНЫМ ДВИЖЕНИЕМ ---
    function animate() {
        requestAnimationFrame(animate);
        
        if (carModel && mode === 'manual') {
            carPositionZ = THREE.MathUtils.lerp(carPositionZ, targetCarPositionZ, 0.12);
            carModel.position.z = carPositionZ;
            
            currentDistance = zToDistance(carPositionZ);
            if (document.getElementById('distSlider').value != Math.round(currentDistance)) {
                document.getElementById('distSlider').value = currentDistance;
                document.getElementById('distVal').textContent = Math.round(currentDistance);
                document.getElementById('sliderOut').textContent = Math.round(currentDistance) + ' см';
            }
        }
        
        controls.update();
        renderer.render(scene, camera);
    }
    
    animate();
    
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

function setMode(m) {
    mode = m;
    document.getElementById('tabManual').className = 'tab' + (m === 'manual' ? ' active' : '');
    document.getElementById('tabAuto').className = 'tab' + (m === 'auto' ? ' active' : '');
    document.getElementById('manualControls').style.display = m === 'manual' ? 'block' : 'none';
    document.getElementById('autoControls').style.display = m === 'auto' ? 'block' : 'none';
    if (m === 'auto') stopMoving();
}

function setDifficulty(d) {
    difficulty = d;
    
    const easyBtn = document.getElementById('dEasy');
    const medBtn = document.getElementById('dMed');
    const hardBtn = document.getElementById('dHard');
    
    if (easyBtn) easyBtn.className = 'diff-btn' + (d === 'easy' ? ' active' : '');
    if (medBtn) medBtn.className = 'diff-btn' + (d === 'medium' ? ' active' : '');
    if (hardBtn) hardBtn.className = 'diff-btn' + (d === 'hard' ? ' active' : '');
    
    const pw = d === 'easy' ? 2.5 : (d === 'medium' ? 2.1 : 1.8);
    if (window.parkingLines && scene) {
        window.parkingLines.forEach(line => scene.remove(line));
        window.parkingLines = [];
        
        const lineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
        const leftX = -pw/2, rightX = pw/2;
        
        const leftLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(leftX, -0.39, -2.8), new THREE.Vector3(leftX, -0.39, 0.3)]), lineMat);
        const rightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rightX, -0.39, -2.8), new THREE.Vector3(rightX, -0.39, 0.3)]), lineMat);
        const backLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(leftX, -0.39, -2.8), new THREE.Vector3(rightX, -0.39, -2.8)]), lineMat);
        
        scene.add(leftLine); scene.add(rightLine); scene.add(backLine);
        window.parkingLines.push(leftLine, rightLine, backLine);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    init3D();
    
    const btnForward = document.getElementById('btnForward');
    const btnBackward = document.getElementById('btnBackward');
    const btnStop = document.getElementById('btnStop');
    const distSlider = document.getElementById('distSlider');
    const startAuto = document.getElementById('startAuto');
    
    if (btnForward) {
        btnForward.onmousedown = () => startMoving(-1);
        btnForward.onmouseup = stopMoving;
        btnForward.onmouseleave = stopMoving;
    }
    
    if (btnBackward) {
        btnBackward.onmousedown = () => startMoving(1);
        btnBackward.onmouseup = stopMoving;
        btnBackward.onmouseleave = stopMoving;
    }
    
    if (btnStop) btnStop.onclick = stopCar;
    if (distSlider) distSlider.oninput = (e) => setDistanceManually(e.target.value);
    if (startAuto) startAuto.onclick = startAutoSim;
    
    window.setMode = setMode;
    window.setDifficulty = setDifficulty;
    
    setMode('manual');
    setDifficulty('easy');
    updateUIDistance();
    
    console.log('🎮 Симулятор парковки запущен!');
    console.log('🔊 Чтобы включить звук - нажми в любом месте страницы!');
});