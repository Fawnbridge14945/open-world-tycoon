// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyDS3kFla_aqkk6Cb_Gol9W-hNNyb-cVixI",
  authDomain: "tycoon-games-a22cc.firebaseapp.com",
  databaseURL: "https://tycoon-games-a22cc-default-rtdb.firebaseio.com",
  projectId: "tycoon-games-a22cc",
  storageBucket: "tycoon-games-a22cc.firebasestorage.app",
  messagingSenderId: "955556055909",
  appId: "1:955556055909:web:c068486f343df277422f8c",
  measurementId: "G-DLNR8W80C7"
};
firebase.initializeApp(firebaseConfig);
const rtdb = firebase.database();
const db = firebase.firestore();

// --- Player State ---
const uid = "player_" + Math.floor(Math.random() * 1e6);
const username = "Guest" + Math.floor(Math.random() * 999);
let playerCash = 100;
let playerInventory = [];
const others = new Map();
const smooth = new Map();

// --- Babylon Setup ---
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
let scene, camera, playerMesh;

// --- Movement Helper ---
function moveRelative(strafe, forward, speed) {
  const dir = camera.getDirection(BABYLON.Axis.Z);
  const right = camera.getDirection(BABYLON.Axis.X);
  const move = new BABYLON.Vector3(
    dir.x * forward + right.x * strafe,
    0,
    dir.z * forward + right.z * strafe
  ).normalize().scale(speed);
  playerMesh.moveWithCollisions(move);
}

// --- Multiplayer Networking ---
function publishTransform() {
  const pos = playerMesh.position;
  const rotY = camera.rotation.y;
  rtdb.ref("positions/" + uid).set({
    username,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    ry: rotY,
    cash: playerCash,
    inventory: playerInventory
  });
}

function subscribeOthers() {
  rtdb.ref("positions").on("value", snap => {
    const data = snap.val() || {};
    for (const id in data) {
      if (id === uid) continue;
      const p = data[id];
      if (!others.has(id)) {
        const mesh = BABYLON.MeshBuilder.CreateCapsule("p_" + id, { height: 1.8, radius: 0.35 }, scene);
        const mat = new BABYLON.StandardMaterial("pm_" + id, scene);
        mat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 1.0);
        mesh.material = mat;
        others.set(id, mesh);
        smooth.set(id, { x: p.x, y: p.y, z: p.z, ry: p.ry || 0 });
      } else {
        smooth.get(id).x = p.x;
        smooth.get(id).y = p.y;
        smooth.get(id).z = p.z;
        smooth.get(id).ry = p.ry || 0;
      }
    }
  });
}

function updateOthers() {
  for (const [id, mesh] of others) {
    const s = smooth.get(id);
    mesh.position.x += (s.x - mesh.position.x) * 0.15;
    mesh.position.y += (s.y - mesh.position.y) * 0.15;
    mesh.position.z += (s.z - mesh.position.z) * 0.15;
    mesh.rotation.y += (s.ry - mesh.rotation.y) * 0.2;
  }
}

// --- Create Scene ---
async function createScene() {
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.05, 1);
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.1, 0);

  // Player mesh (collision body)
  playerMesh = BABYLON.MeshBuilder.CreateCapsule("playerBody", { height: 1.8, radius: 0.4 }, scene);
  playerMesh.checkCollisions = true;
  playerMesh.ellipsoid = new BABYLON.Vector3(0.4, 0.9, 0.4);
  playerMesh.applyGravity = true;

  // Camera
  camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 0.8, 0), scene);
  camera.minZ = 0.05;
  camera.fov = BABYLON.Tools.ToRadians(75);
  camera.inertia = 0.1;
  camera.angularSensibility = 500;
  camera.attachControl(canvas, true);
  camera.parent = playerMesh; // follow player body
  canvas.addEventListener("click", () => canvas.requestPointerLock?.());

  // Lighting
  new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);

  // Ground
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
  const gMat = new BABYLON.StandardMaterial("gmat", scene);
  gMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
  ground.material = gMat;
  ground.checkCollisions = true;

  // Random buildings
  for (let i = 0; i < 40; i++) {
    const b = BABYLON.MeshBuilder.CreateBox("b" + i, { width: 6, height: 12, depth: 6 }, scene);
    b.position.set((Math.random() - 0.5) * 160, 6, (Math.random() - 0.5) * 160);
    const m = new BABYLON.StandardMaterial("bm" + i, scene);
    m.diffuseColor = new BABYLON.Color3(0.15 + Math.random() * 0.2, 0.15, 0.2 + Math.random() * 0.2);
    b.material = m;
    b.checkCollisions = true;
  }

  // HUD
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
  const cashText = new BABYLON.GUI.TextBlock();
  cashText.text = `Cash: $${playerCash}`;
  cashText.color = "white";
  cashText.fontSize = 20;
  cashText.paddingTop = "10px";
  cashText.paddingLeft = "10px";
  cashText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  cashText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  ui.addControl(cashText);
  scene.onBeforeRenderObservable.add(() => {
    cashText.text = `Cash: $${playerCash}`;
  });

  // Input mapping
  const input = { f: 0, r: 0 };
  scene.onKeyboardObservable.add(k => {
    const down = k.type === BABYLON.KeyboardEventTypes.KEYDOWN;
    if (k.event.code === "KeyW") input.f = down ? 1 : (input.f === 1 ? 0 : input.f);
    if (k.event.code === "KeyS") input.f = down ? -1 : (input.f === -1 ? 0 : input.f);
    if (k.event.code === "KeyA") input.r = down ? -1 : (input.r === -1 ? 0 : input.r);
    if (k.event.code === "KeyD") input.r = down ? 1 : (input.r === 1 ? 0 : input.r);
  });

  // Gamepad look/move
  scene.onBeforeRenderObservable.add(() => {
    const gps = navigator.getGamepads?.() || [];
    for (const gp of gps) {
      if (!gp) continue;
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;
      moveRelative(lx, -ly, 0.15);
      camera.rotation.y -= rx * 0.03;
      camera.rotation.x = BABYLON.Scalar.Clamp(camera.rotation.x - ry * 0.02, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    }
  });

    // Keyboard move
  scene.onBeforeRenderObservable.add(() => {
    const dt = scene.getEngine().getDeltaTime() / 16.67;
    moveRelative(input.r, input.f, 0.15 * dt);
    publishTransform();
    updateOthers();
  });

  // --- Supermarket Building + Trigger ---
  const supermarket = BABYLON.MeshBuilder.CreateBox("supermarket", { width: 6, height: 4, depth: 8 }, scene);
  supermarket.position.set(10, 2, 10);
  const smMat = new BABYLON.StandardMaterial("smMat", scene);
  smMat.diffuseColor = new BABYLON.Color3(0.2, 0.6, 0.2);
  supermarket.material = smMat;

  const supermarketTrigger = BABYLON.MeshBuilder.CreateBox("supermarketTrigger", { width: 4, height: 3, depth: 4 }, scene);
  supermarketTrigger.position.set(10, 1.5, 10);
  supermarketTrigger.isVisible = false;
  supermarketTrigger.actionManager = new BABYLON.ActionManager(scene);
  supermarketTrigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction(
      { trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger, parameter: playerMesh },
      () => openShopUI()
    )
  );
  supermarketTrigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction(
      { trigger: BABYLON.ActionManager.OnIntersectionExitTrigger, parameter: playerMesh },
      () => closeShopUI()
    )
  );

  // --- Card Shop Building + Trigger ---
  const cardShop = BABYLON.MeshBuilder.CreateBox("cardShop", { width: 5, height: 4, depth: 6 }, scene);
  cardShop.position.set(-12, 2, 8);
  const csMat = new BABYLON.StandardMaterial("csMat", scene);
  csMat.diffuseColor = new BABYLON.Color3(0.6, 0.3, 0.1);
  cardShop.material = csMat;

  const cardShopTrigger = BABYLON.MeshBuilder.CreateBox("cardShopTrigger", { width: 4, height: 3, depth: 4 }, scene);
  cardShopTrigger.position.set(-12, 1.5, 8);
  cardShopTrigger.isVisible = false;
  cardShopTrigger.actionManager = new BABYLON.ActionManager(scene);
  cardShopTrigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction(
      { trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger, parameter: playerMesh },
      () => openCardShopUI()
    )
  );
  cardShopTrigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction(
      { trigger: BABYLON.ActionManager.OnIntersectionExitTrigger, parameter: playerMesh },
      () => closeCardShopUI()
    )
  );

  // --- NPC AI update loop (inside createScene) ---
  scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    npcList.forEach((npc, index) => {
      if (now - npc.spawnTime > npcLifetime) {
        npc.mesh.dispose();
        npcList.splice(index, 1);
        return;
      }
      const dir = npc.target.subtract(npc.mesh.position);
      const dist = dir.length();
      if (dist > 0.2) {
        dir.normalize();
        npc.mesh.moveWithCollisions(dir.scale(npcSpeed));
      } else {
        if (npc.state === "wandering") {
          if (Math.random() < 0.3) {
            npc.state = "shopping";
            npc.target = Math.random() < 0.5 ? waypoints[3] : waypoints[4];
          } else {
            npc.target = pickRandomWaypoint();
          }
        } else if (npc.state === "shopping") {
          if (npc.target.equals(waypoints[4]) && playerInventory.length > 0) {
            const itemIndex = Math.floor(Math.random() * playerInventory.length);
            const itemId = playerInventory[itemIndex];
            playerInventory.splice(itemIndex, 1);
            playerCash += 5;
            db.collection("players").doc(uid).set({ cash: playerCash, inventory: playerInventory }, { merge: true });
          }
          npc.target = pickRandomWaypoint();
          npc.state = "wandering";
        }
      }
    });
  });

  return scene;
}

// --- Shop UI Functions ---
let shopUI = null;
let shopOpen = false;
const shopItems = [
  { id: "apple", name: "Apple", price: 5 },
  { id: "water", name: "Bottle of Water", price: 3 },
  { id: "bread", name: "Bread Loaf", price: 7 }
];

function openShopUI() {
  if (shopOpen) return;
  shopOpen = true;

  shopUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ShopUI");
  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "300px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  shopUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Supermarket";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 24;
  panel.addControl(title);

  shopItems.forEach(item => {
    const btn = BABYLON.GUI.Button.CreateSimpleButton(item.id, `${item.name} - $${item.price}`);
    btn.height = "40px";
    btn.color = "white";
    btn.background = "#333";
    btn.onPointerUpObservable.add(() => buyItem(item));
    panel.addControl(btn);
  });

  const closeBtn = BABYLON.GUI.Button.CreateSimpleButton("close", "Close");
  closeBtn.height = "40px";
  closeBtn.color = "white";
  closeBtn.background = "#a33";
  closeBtn.onPointerUpObservable.add(() => closeShopUI());
  panel.addControl(closeBtn);
}

function closeShopUI() {
  if (shopUI) {
    shopUI.dispose();
    shopUI = null;
  }
  shopOpen = false;
}

function buyItem(item) {
  if (playerCash >= item.price) {
    playerCash -= item.price;
    playerInventory.push(item.id);
    db.collection("players").doc(uid).set({
      cash: playerCash,
      inventory: playerInventory
    }, { merge: true });
    console.log(`Bought ${item.name}`);
  } else {
    console.log("Not enough cash!");
  }
}

// --- Card Shop UI ---
let cardShopUI = null;
let cardShopOpen = false;

function openCardShopUI() {
  if (cardShopOpen) return;
  cardShopOpen = true;

  cardShopUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("CardShopUI");
  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "300px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  cardShopUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Card Shop - Sell Items";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 24;
  panel.addControl(title);

  playerInventory.forEach((itemId, index) => {
    const btn = BABYLON.GUI.Button.CreateSimpleButton("sell_" + index, `Sell ${itemId} (+$5)`);
    btn.height = "40px";
    btn.color = "white";
    btn.background = "#444";
    btn.onPointerUpObservable.add(() => sellItem(itemId, 5));
    panel.addControl(btn);
  });

  const closeBtn = BABYLON.GUI.Button.CreateSimpleButton("close", "Close");
  closeBtn.height = "40px";
  closeBtn.color = "white";
  closeBtn.background = "#a33";
  closeBtn.onPointerUpObservable.add(() => closeCardShopUI());
  panel.addControl(closeBtn);
}

function closeCardShopUI() {
  if (cardShopUI) {
    cardShopUI.dispose();
    cardShopUI = null;
  }
  cardShopOpen = false;
}

function sellItem(itemId, price) {
  const index = playerInventory.indexOf(itemId);
  if (index !== -1) {
    playerInventory.splice(index, 1);
    playerCash += price;
    db.collection("players").doc(uid).set({
      cash: playerCash,
      inventory: playerInventory
    }, { merge: true });
    console.log(`Sold ${itemId} for $${price}`);
    closeCardShopUI();
    openCardShopUI(); // refresh UI
  }
}

// --- NPC AI Data ---
const npcList = [];
const npcMax = 8;
const npcSpeed = 0.04;
const npcLifetime = 60000;
const waypoints = [
  new BABYLON.Vector3(0, 0, 0),
  new BABYLON.Vector3(20, 0, 20),
  new BABYLON.Vector3(-20, 0, 15),
  new BABYLON.Vector3(10, 0, 10),  // supermarket
  new BABYLON.Vector3(-12, 0, 8)   // card shop
];

function spawnWanderingNPC() {
  if (npcList.length >= npcMax) return;

  // Body
  const npc = BABYLON.MeshBuilder.CreateCapsule("npc", { height: 1.8, radius: 0.35 }, scene);
  npc.position = waypoints[Math.floor(Math.random() * 3)].clone();

  // Random colors
  const skinTones = [
    new BABYLON.Color3(1, 0.8, 0.6),
    new BABYLON.Color3(0.9, 0.7, 0.5),
    new BABYLON.Color3(0.6, 0.45, 0.3),
    new BABYLON.Color3(0.4, 0.3, 0.2)
  ];
  const shirtColors = [
    new BABYLON.Color3(0.2, 0.6, 1),
    new BABYLON.Color3(1, 0.2, 0.2),
    new BABYLON.Color3(0.2, 1, 0.4),
    new BABYLON.Color3(1, 1, 0.2)
  ];
  const pantsColors = [
    new BABYLON.Color3(0.1, 0.1, 0.1),
    new BABYLON.Color3(0.3, 0.3, 0.3),
    new BABYLON.Color3(0.2, 0.2, 0.5)
  ];

  const mat = new BABYLON.StandardMaterial("npcMat", scene);
  mat.diffuseColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];
  npc.material = mat;

  // Hat (20% chance)
  if (Math.random() < 0.2) {
    const hat = BABYLON.MeshBuilder.CreateBox("hat", { size: 0.4 }, scene);
    hat.position.y = 1.2;
    hat.parent = npc;
    const hatMat = new BABYLON.StandardMaterial("hatMat", scene);
    hatMat.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
    hat.material = hatMat;
  }

  const target = pickRandomWaypoint();
  npcList.push({ mesh: npc, target, state: "wandering", spawnTime: Date.now(), animPhase: 0 });
}

function pickRandomWaypoint() {
  return waypoints[Math.floor(Math.random() * waypoints.length)];
}

// --- Spawn NPCs periodically ---
setInterval(spawnWanderingNPC, 8000);

// --- Boot Scene ---
createScene().then(() => {
  subscribeOthers();
  engine.runRenderLoop(() => scene.render());
});

window.addEventListener("resize", () => engine.resize());
