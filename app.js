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
let playerCash = 1000;
let playerInventory = [];
let ownedCars = [];
let currentVehicle = null;
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
    inventory: playerInventory,
    cars: ownedCars
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

  // Player mesh
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
  camera.parent = playerMesh;
  canvas.addEventListener("click", () => canvas.requestPointerLock?.());

  // Lighting
  new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);

  // Ground
  const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 300, height: 300 }, scene);
  const gMat = new BABYLON.StandardMaterial("gmat", scene);
  gMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
  ground.material = gMat;
  ground.checkCollisions = true;

  // Roads
  const roadMat = new BABYLON.StandardMaterial("roadMat", scene);
  roadMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
  for (let i = -100; i <= 100; i += 20) {
    const road = BABYLON.MeshBuilder.CreateBox("road" + i, { width: 8, height: 0.1, depth: 20 }, scene);
    road.position.set(i, 0.05, 0);
    road.material = roadMat;
    road.checkCollisions = true;
  }

  // Street Lamps
  for (let i = -80; i <= 80; i += 20) {
    const pole = BABYLON.MeshBuilder.CreateCylinder("lampPole" + i, { height: 5, diameter: 0.2 }, scene);
    pole.position.set(i, 2.5, 4);
    const light = new BABYLON.PointLight("lampLight" + i, new BABYLON.Vector3(i, 5, 4), scene);
    light.intensity = 0.8;
    light.diffuse = new BABYLON.Color3(1, 1, 0.8);
  }

  // Benches
  for (let i = -60; i <= 60; i += 30) {
    const bench = BABYLON.MeshBuilder.CreateBox("bench" + i, { width: 2, height: 0.5, depth: 0.5 }, scene);
    bench.position.set(i, 0.25, -5);
    const bMat = new BABYLON.StandardMaterial("bMat" + i, scene);
    bMat.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1);
    bench.material = bMat;
  }

  // Trees
  for (let i = -80; i <= 80; i += 40) {
    const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk" + i, { height: 2, diameter: 0.4 }, scene);
    trunk.position.set(i, 1, -10);
    const leaves = BABYLON.MeshBuilder.CreateSphere("leaves" + i, { diameter: 3 }, scene);
    leaves.position.set(i, 3, -10);
    const leafMat = new BABYLON.StandardMaterial("leafMat" + i, scene);
    leafMat.diffuseColor = new BABYLON.Color3(0.1, 0.5, 0.1);
    leaves.material = leafMat;
  }
}
// --- Car Dealer Setup ---
let carDealerTrigger = null;
let carDealerUI = null;
let carDealerOpen = false;

const carModels = [
  { id: "sedan", name: "Sedan", price: 500, color: new BABYLON.Color3(0.2, 0.2, 1) },
  { id: "sports", name: "Sports Car", price: 1200, color: new BABYLON.Color3(1, 0, 0) },
  { id: "truck", name: "Pickup Truck", price: 800, color: new BABYLON.Color3(0.3, 0.3, 0.3) }
];

function createCarDealer() {
  const dealer = BABYLON.MeshBuilder.CreateBox("carDealer", { width: 10, height: 4, depth: 8 }, scene);
  dealer.position.set(25, 2, -15);
  const dMat = new BABYLON.StandardMaterial("dealerMat", scene);
  dMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.2);
  dealer.material = dMat;

  carDealerTrigger = BABYLON.MeshBuilder.CreateBox("carDealerTrigger", { width: 8, height: 3, depth: 6 }, scene);
  carDealerTrigger.position.set(25, 1.5, -15);
  carDealerTrigger.isVisible = false;
  carDealerTrigger.actionManager = new BABYLON.ActionManager(scene);
  carDealerTrigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction({ trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger, parameter: playerMesh }, () => openCarDealerUI())
  );
  carDealerTrigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction({ trigger: BABYLON.ActionManager.OnIntersectionExitTrigger, parameter: playerMesh }, () => closeCarDealerUI())
  );
}

function openCarDealerUI() {
  if (carDealerOpen) return;
  carDealerOpen = true;
  carDealerUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("CarDealerUI");

  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "300px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  carDealerUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Car Dealer";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 24;
  panel.addControl(title);

  carModels.forEach(car => {
    const btn = BABYLON.GUI.Button.CreateSimpleButton(car.id, `${car.name} - $${car.price}`);
    btn.height = "40px";
    btn.color = "white";
    btn.background = "#333";
    btn.onPointerUpObservable.add(() => buyCar(car));
    panel.addControl(btn);
  });

  const closeBtn = BABYLON.GUI.Button.CreateSimpleButton("close", "Close");
  closeBtn.height = "40px";
  closeBtn.color = "white";
  closeBtn.background = "#a33";
  closeBtn.onPointerUpObservable.add(() => closeCarDealerUI());
  panel.addControl(closeBtn);
}

function closeCarDealerUI() {
  if (carDealerUI) {
    carDealerUI.dispose();
    carDealerUI = null;
  }
  carDealerOpen = false;
}

function buyCar(car) {
  if (playerCash >= car.price) {
    playerCash -= car.price;
    ownedCars.push(car.id);
    db.collection("players").doc(uid).set({
      cash: playerCash,
      inventory: playerInventory,
      cars: ownedCars
    }, { merge: true });
    spawnCar(car);
    console.log(`Bought ${car.name}`);
  } else {
    console.log("Not enough cash!");
  }
}

// --- Car Spawning ---
function spawnCar(car) {
  const body = BABYLON.MeshBuilder.CreateBox(car.id + "_body", { width: 2, height: 1, depth: 4 }, scene);
  body.position = new BABYLON.Vector3(30, 0.5, -10);
  const mat = new BABYLON.StandardMaterial(car.id + "_mat", scene);
  mat.diffuseColor = car.color;
  body.material = mat;
  body.checkCollisions = true;
  body.metadata = { type: "car", id: car.id, speed: 0, maxSpeed: 0.5, accel: 0.01, turnSpeed: 0.03 };
}

// --- Driving System ---
let driving = false;

function enterCar(carMesh) {
  currentVehicle = carMesh;
  driving = true;
  camera.parent = carMesh;
  camera.position.set(0, 1.5, -2);
}

function exitCar() {
  if (!currentVehicle) return;
  driving = false;
  camera.parent = playerMesh;
  camera.position.set(0, 0.8, 0);
  currentVehicle = null;
}

scene?.onBeforeRenderObservable.add(() => {
  if (driving && currentVehicle) {
    const input = { f: 0, r: 0 };
    if (keys["KeyW"]) input.f = 1;
    if (keys["KeyS"]) input.f = -1;
    if (keys["KeyA"]) input.r = -1;
    if (keys["KeyD"]) input.r = 1;

    // Accelerate/Brake
    if (input.f !== 0) {
      currentVehicle.metadata.speed += input.f * currentVehicle.metadata.accel;
      currentVehicle.metadata.speed = BABYLON.Scalar.Clamp(currentVehicle.metadata.speed, -currentVehicle.metadata.maxSpeed, currentVehicle.metadata.maxSpeed);
    } else {
      // Natural deceleration
      currentVehicle.metadata.speed *= 0.95;
    }

    // Turn
    if (input.r !== 0) {
      currentVehicle.rotation.y += input.r * currentVehicle.metadata.turnSpeed;
    }

    // Move
    const forwardVec = new BABYLON.Vector3(Math.sin(currentVehicle.rotation.y), 0, Math.cos(currentVehicle.rotation.y));
    currentVehicle.moveWithCollisions(forwardVec.scale(currentVehicle.metadata.speed));
  }
});

// --- Input Tracking ---
const keys = {};
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code === "KeyE") {
    if (!driving) {
      // Try to enter nearest car
      const pick = scene.pickWithRay(new BABYLON.Ray(camera.globalPosition, camera.getForwardRay().direction), mesh => mesh.metadata?.type === "car");
      if (pick.hit && pick.pickedMesh) {
        enterCar(pick.pickedMesh);
      }
    } else {
      exitCar();
    }
  }
});
window.addEventListener("keyup", e => keys[e.code] = false);
// --- NPC Model Loading ---
let npcBaseMesh = null;
async function loadNPCModel() {
  const result = await BABYLON.SceneLoader.ImportMeshAsync(
    "",
    "assets/",
    "male_npc.glb",
    scene
  );
  npcBaseMesh = result.meshes[0];
  npcBaseMesh.setEnabled(false);
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

function pickRandomWaypoint() {
  return waypoints[Math.floor(Math.random() * waypoints.length)];
}

function spawnWanderingNPC() {
  if (!npcBaseMesh || npcList.length >= npcMax) return;

  const npc = npcBaseMesh.clone("npc_" + Date.now());
  npc.setEnabled(true);
  npc.position = waypoints[Math.floor(Math.random() * 3)].clone();

  // Randomize clothing colors if possible
  npc.getChildMeshes().forEach(m => {
    if (m.material) {
      m.material = m.material.clone();
      if (m.material.diffuseColor) {
        m.material.diffuseColor = new BABYLON.Color3(Math.random(), Math.random(), Math.random());
      }
    }
  });

  // Grab animations by name
  const walkAnim = scene.animationGroups.find(a => a.name.toLowerCase().includes("walk"));
  const idleAnim = scene.animationGroups.find(a => a.name.toLowerCase().includes("idle"));

  npcList.push({
    mesh: npc,
    target: pickRandomWaypoint(),
    state: "wandering",
    spawnTime: Date.now(),
    walkAnim: walkAnim ? walkAnim.clone(npc.name + "_walk", npc) : null,
    idleAnim: idleAnim ? idleAnim.clone(npc.name + "_idle", npc) : null
  });
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

function closeShopUI() { if (shopUI) shopUI.dispose(); shopUI = null; shopOpen = false; }
function buyItem(item) {
  if (playerCash >= item.price) {
    playerCash -= item.price;
    playerInventory.push(item.id);
    db.collection("players").doc(uid).set({ cash: playerCash, inventory: playerInventory }, { merge: true });
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
    closeCardShopUI();
    openCardShopUI(); // refresh UI
  }
}

// --- NPC AI Update Loop ---
scene?.onBeforeRenderObservable.add(() => {
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
      npc.mesh.rotation.y = Math.atan2(dir.x, dir.z);
      if (npc.walkAnim && !npc.walkAnim.isPlaying) {
        npc.idleAnim?.stop();
        npc.walkAnim.start(true);
      }
    } else {
      if (npc.state === "wandering") {
        if (Math.random() < 0.3) {
          npc.state = "shopping";
          npc.target = Math.random() < 0.5 ? waypoints[3] : waypoints[4];
        } else {
          npc.target = pickRandomWaypoint();
        }
      } else if (npc.state === "shopping") {
        npc.target = pickRandomWaypoint();
        npc.state = "wandering";
      }
      if (npc.idleAnim && !npc.idleAnim.isPlaying) {
        npc.walkAnim?.stop();
        npc.idleAnim.start(true);
      }
    }
  });
});

// --- Spawn NPCs periodically ---
setInterval(spawnWanderingNPC, 8000);

// --- Boot sequence ---
createScene().then(async () => {
  console.log("GLTF loader registered:", BABYLON.SceneLoader.IsPluginForExtensionAvailable(".glb"));

  await loadNPCModel();
  createCarDealer();
  subscribeOthers();
  engine.runRenderLoop(() => scene.render());
});

window.addEventListener("resize", () => engine.resize());

