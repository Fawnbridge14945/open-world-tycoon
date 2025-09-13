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
const db = firebase.firestore();
const rtdb = firebase.database();
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// --- Globals ---
let uid = null;
let username = null;
let playerCash = 100;
let playerInventory = [];
let ownedCars = [];
let ownedProperties = [];
let playerStores = {};
let others = new Map();
let smooth = new Map();
let scene, camera, playerMesh;
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

// --- Main Menu ---
function showMainMenu() {
  const menuUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("MainMenuUI");
  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "400px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  menuUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "CityLife Tycoon";
  title.height = "60px";
  title.color = "white";
  title.fontSize = 36;
  panel.addControl(title);

  const version = new BABYLON.GUI.TextBlock();
  version.text = "v1.0.0 Prototype";
  version.height = "30px";
  version.color = "gray";
  version.fontSize = 18;
  panel.addControl(version);

  const googleBtn = BABYLON.GUI.Button.CreateSimpleButton("google", "Sign in with Google");
  googleBtn.height = "50px";
  googleBtn.color = "white";
  googleBtn.background = "#db4437";
  googleBtn.onPointerUpObservable.add(() => {
    menuUI.dispose();
    signInWithGoogle();
  });
  panel.addControl(googleBtn);
}

// --- Google Auth ---
async function signInWithGoogle() {
  try {
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    uid = user.uid;
    const docRef = db.collection("players").doc(uid);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      promptForUsername(uid, user.email);
    } else {
      username = docSnap.data().username;
      startGame();
    }
  } catch (err) {
    console.error("Google Sign-In Error:", err);
  }
}

// --- Username Prompt ---
function promptForUsername(userUid, email) {
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UsernameUI");
  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "400px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  ui.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Choose a Username";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 28;
  panel.addControl(title);

  const input = new BABYLON.GUI.InputText();
  input.width = "300px";
  input.height = "40px";
  input.color = "white";
  input.background = "#333";
  input.maxLength = 16;
  panel.addControl(input);

  const status = new BABYLON.GUI.TextBlock();
  status.height = "30px";
  status.color = "red";
  panel.addControl(status);

  const submitBtn = BABYLON.GUI.Button.CreateSimpleButton("submit", "Confirm");
  submitBtn.height = "40px";
  submitBtn.color = "white";
  submitBtn.background = "#3a3";
  submitBtn.onPointerUpObservable.add(async () => {
    const desiredName = input.text.trim();
    if (!desiredName) {
      status.text = "Username cannot be empty";
      return;
    }
    const taken = await isUsernameTaken(desiredName);
    if (taken) {
      status.text = "Username is already taken";
      return;
    }
    await db.collection("players").doc(userUid).set({
      username: desiredName,
      email: email,
      friends: [],
      cash: 100,
      inventory: [],
      properties: [],
      stores: {}
    });
    uid = userUid;
    username = desiredName;
    ui.dispose();
    startGame();
  });
  panel.addControl(submitBtn);
}

async function isUsernameTaken(name) {
  const snapshot = await db.collection("players").where("username", "==", name).get();
  return !snapshot.empty;
}

// --- Scene Creation ---
async function createScene() {
  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.05, 1);
  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.1, 0);

  // Player mesh (scaled to match NPC height)
  playerMesh = BABYLON.MeshBuilder.CreateCapsule("playerBody", { height: 3.6, radius: 0.8 }, scene);
  playerMesh.checkCollisions = true;
  playerMesh.ellipsoid = new BABYLON.Vector3(0.8, 1.8, 0.8);
  playerMesh.applyGravity = true;
  playerMesh.position.y = 1.8;

  // Camera
  camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(0, 3.2, 0), scene);
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

  // Sky & Day/Night
  const skyMaterial = new BABYLON.SkyMaterial("skyMat", scene);
  skyMaterial.backFaceCulling = false;
  const skyDome = BABYLON.MeshBuilder.CreateSphere("skyDome", { segments: 32, diameter: 1000 }, scene);
  skyDome.material = skyMaterial;
  const sun = new BABYLON.DirectionalLight("sun", new BABYLON.Vector3(0, -1, 0), scene);
  sun.intensity = 1.0;
  let gameHour = 8;
  const minutesPerRealSecond = 1;
  scene.onBeforeRenderObservable.add(() => {
    const deltaTime = engine.getDeltaTime() / 1000;
    gameHour += (deltaTime * minutesPerRealSecond) / 60;
    if (gameHour >= 24) gameHour -= 24;
    skyMaterial.inclination = Math.sin((gameHour / 24) * Math.PI * 2) * 0.5;
    const sunAngle = (gameHour / 24) * Math.PI * 2;
    sun.direction = new BABYLON.Vector3(Math.sin(sunAngle), -Math.cos(sunAngle), 0);
    sun.intensity = Math.max(0.2, Math.cos(sunAngle));
  });

  return scene;
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
    cars: ownedCars,
    properties: ownedProperties,
    stores: playerStores
  });
}

function subscribeOthers() {
  rtdb.ref("positions").on("value", snap => {
    const data = snap.val() || {};
    for (const id in data) {
      if (id === uid) continue;
      const p = data[id];
      if (!others.has(id)) {
        const mesh = BABYLON.MeshBuilder.CreateCapsule("p_" + id, { height: 3.6, radius: 0.8 }, scene);
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

// --- NPC Model & Animations ---
let npcBaseMesh = null;
let animIdle = null;
let animWalk = null;
let animWalkStart = null;

async function loadNPCModel() {
  const result = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "male_npc.glb", scene);
  npcBaseMesh = result.meshes[0];
  npcBaseMesh.setEnabled(false);
}

async function loadAnimations() {
  const idleResult = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "idle.glb", scene);
  animIdle = idleResult.animationGroups[0]; animIdle.stop();
  idleResult.meshes.forEach(m => m.dispose());

  const walkResult = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "walk.glb", scene);
  animWalk = walkResult.animationGroups[0]; animWalk.stop();
  walkResult.meshes.forEach(m => m.dispose());

  const walkStartResult = await BABYLON.SceneLoader.ImportMeshAsync("", "assets/", "walk_start.glb", scene);
  animWalkStart = walkStartResult.animationGroups[0]; animWalkStart.stop();
  walkStartResult.meshes.forEach(m => m.dispose());
}

// --- NPC AI ---
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
  npc.scaling = new BABYLON.Vector3(2, 2, 2);
  npc.position.y = 1.8;

  const collider = BABYLON.MeshBuilder.CreateCapsule(npc.name + "_collider", { height: 3.6, radius: 0.8 }, scene);
  collider.isVisible = false;
  collider.checkCollisions = true;
  collider.position = npc.position.clone();
  npc.parent = collider;

  const npcIdle = animIdle?.clone(npc.name + "_idle", npc);
  const npcWalk = animWalk?.clone(npc.name + "_walk", npc);

  npcList.push({
    mesh: npc,
    collider: collider,
    target: pickRandomWaypoint(),
    state: "wandering",
    spawnTime: Date.now(),
    walkAnim: npcWalk,
    idleAnim: npcIdle
  });
}

// --- Car Dealer & Driving ---
function createCarDealer() {
  const dealer = BABYLON.MeshBuilder.CreateBox("carDealer", { width: 10, height: 4, depth: 8 }, scene);
  dealer.position.set(25, 2, -15);
  const dMat = new BABYLON.StandardMaterial("dealerMat", scene);
  dMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.2);
  dealer.material = dMat;

  const trigger = BABYLON.MeshBuilder.CreateBox("carDealerTrigger", { width: 8, height: 3, depth: 6 }, scene);
  trigger.position.set(25, 1.5, -15);
  trigger.isVisible = false;
  trigger.actionManager = new BABYLON.ActionManager(scene);
  trigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction({ trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger, parameter: playerMesh }, () => openCarDealerUI())
  );
  trigger.actionManager.registerAction(
    new BABYLON.ExecuteCodeAction({ trigger: BABYLON.ActionManager.OnIntersectionExitTrigger, parameter: playerMesh }, () => closeCarDealerUI())
  );
}

const carModels = [
  { id: "sedan", name: "Sedan", price: 500, color: new BABYLON.Color3(0.2, 0.2, 1) },
  { id: "sports", name: "Sports Car", price: 1200, color: new BABYLON.Color3(1, 0, 0) },
  { id: "truck", name: "Pickup Truck", price: 800, color: new BABYLON.Color3(0.3, 0.3, 0.3) }
];

let carDealerUI = null;
let carDealerOpen = false;

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
  if (carDealerUI) carDealerUI.dispose();
  carDealerOpen = false;
}

function buyCar(car) {
  if (playerCash >= car.price) {
    playerCash -= car.price;
    ownedCars.push(car.id);
    db.collection("players").doc(uid).set({
      cash: playerCash,
      cars: ownedCars
    }, { merge: true });
    spawnCar(car);
  }
}

function spawnCar(car) {
  const body = BABYLON.MeshBuilder.CreateBox(car.id + "_body", { width: 2, height: 1, depth: 4 }, scene);
  body.position = new BABYLON.Vector3(30, 0.5, -10);
  const mat = new BABYLON.StandardMaterial(car.id + "_mat", scene);
  mat.diffuseColor = car.color;
  body.material = mat;
  body.checkCollisions = true;
  body.metadata = { type: "car", id: car.id, speed: 0, maxSpeed: 0.5, accel: 0.01, turnSpeed: 0.03 };

  // Decorative wheels
  for (let i = 0; i < 4; i++) {
    const wheel = BABYLON.MeshBuilder.CreateCylinder(`${car.id}_wheel_${i}`, { diameter: 0.6, height: 0.3 }, scene);
    wheel.rotation.z = Math.PI / 2;
    const offsetX = i % 2 === 0 ? -0.8 : 0.8;
    const offsetZ = i < 2 ? -1.4 : 1.4;
    wheel.position = body.position.add(new BABYLON.Vector3(offsetX, -0.3, offsetZ));
    wheel.parent = body;
  }
}

// --- Driving System ---
let currentVehicle = null;
let driving = false;
const keys = {};

function enterCar(carMesh) {
  currentVehicle = carMesh;
  driving = true;
  camera.parent = currentVehicle;
  camera.position.set(0, 1.5, -2);
}

function exitCar() {
  if (!currentVehicle) return;
  driving = false;
  camera.parent = playerMesh;
  camera.position.set(0, 3.2, 0);
  currentVehicle = null;
}

window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code === "KeyE") {
    if (!driving) {
      // Try to enter nearest car
      const ray = camera.getForwardRay(3);
      const hit = scene.pickWithRay(ray, m => m.metadata?.type === "car");
      if (hit.hit && hit.pickedMesh) {
        enterCar(hit.pickedMesh);
      }
    } else {
      exitCar();
    }
  }
});
window.addEventListener("keyup", e => keys[e.code] = false);

scene?.onBeforeRenderObservable.add(() => {
  if (driving && currentVehicle) {
    const forward = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const steer = (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    // Accelerate/Brake
    if (forward !== 0) {
      currentVehicle.metadata.speed += forward * currentVehicle.metadata.accel;
      currentVehicle.metadata.speed = BABYLON.Scalar.Clamp(
        currentVehicle.metadata.speed,
        -currentVehicle.metadata.maxSpeed * 0.5, // reverse slower
        currentVehicle.metadata.maxSpeed
      );
    } else {
      currentVehicle.metadata.speed *= 0.95; // natural decel
    }

    // Turn
    if (Math.abs(currentVehicle.metadata.speed) > 0.001 && steer !== 0) {
      const turnFactor = currentVehicle.metadata.turnSpeed * (currentVehicle.metadata.speed >= 0 ? 1 : -1);
      currentVehicle.rotation.y += steer * turnFactor;
    }

    // Move
    const forwardVec = new BABYLON.Vector3(Math.sin(currentVehicle.rotation.y), 0, Math.cos(currentVehicle.rotation.y));
    currentVehicle.moveWithCollisions(forwardVec.scale(currentVehicle.metadata.speed));
  }
});
// --- Friends List ---
async function addFriend(friendUid) {
  const docRef = db.collection("players").doc(uid);
  const docSnap = await docRef.get();
  let friends = docSnap.exists && docSnap.data().friends ? docSnap.data().friends : [];
  if (!friends.includes(friendUid)) {
    friends.push(friendUid);
    await docRef.set({ friends }, { merge: true });
  }
}

async function getFriends() {
  const docSnap = await db.collection("players").doc(uid).get();
  return docSnap.exists && docSnap.data().friends ? docSnap.data().friends : [];
}

// --- Invites ---
function sendInvite(targetUid) {
  const inviteId = Date.now().toString();
  rtdb.ref(`invites/${targetUid}/${inviteId}`).set({
    from: uid,
    fromName: username,
    timestamp: Date.now()
  });
}

function listenForInvites() {
  rtdb.ref(`invites/${uid}`).on("child_added", snap => {
    const invite = snap.val();
    showInvitePopup(invite.from, invite.fromName);
    rtdb.ref(`invites/${uid}/${snap.key}`).remove();
  });
}

function showInvitePopup(fromUid, fromName) {
  const popupUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("InvitePopup");

  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "300px";
  panel.background = "#222";
  panel.alpha = 0.9;
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  panel.paddingBottom = "20px";
  popupUI.addControl(panel);

  const text = new BABYLON.GUI.TextBlock();
  text.text = `${fromName} has invited you to join.`;
  text.color = "white";
  text.fontSize = 18;
  panel.addControl(text);

  const yesBtn = BABYLON.GUI.Button.CreateSimpleButton("yes", "Yes");
  yesBtn.height = "40px";
  yesBtn.color = "white";
  yesBtn.background = "#3a3";
  yesBtn.onPointerUpObservable.add(() => {
    popupUI.dispose();
    joinFriendGame(fromUid);
  });
  panel.addControl(yesBtn);

  const noBtn = BABYLON.GUI.Button.CreateSimpleButton("no", "No");
  noBtn.height = "40px";
  noBtn.color = "white";
  noBtn.background = "#a33";
  noBtn.onPointerUpObservable.add(() => popupUI.dispose());
  panel.addControl(noBtn);
}

function joinFriendGame(friendUid) {
  console.log(`Joining ${friendUid}'s game...`);
  // TODO: Replace with actual multiplayer join logic
}

// --- Pause Menu ---
let pauseUI = null;
let paused = false;

function openPauseMenu() {
  if (paused) return;
  paused = true;
  pauseUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("PauseUI");

  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "300px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  pauseUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Paused";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 28;
  panel.addControl(title);

  const resumeBtn = BABYLON.GUI.Button.CreateSimpleButton("resume", "Resume");
  resumeBtn.height = "40px";
  resumeBtn.color = "white";
  resumeBtn.background = "#333";
  resumeBtn.onPointerUpObservable.add(() => closePauseMenu());
  panel.addControl(resumeBtn);

  const quitBtn = BABYLON.GUI.Button.CreateSimpleButton("quit", "Quit to Main Menu");
  quitBtn.height = "40px";
  quitBtn.color = "white";
  quitBtn.background = "#a33";
  quitBtn.onPointerUpObservable.add(() => {
    pauseUI.dispose();
    paused = false;
    showMainMenu();
  });
  panel.addControl(quitBtn);
}

function closePauseMenu() {
  if (pauseUI) pauseUI.dispose();
  paused = false;
}

// --- Inventory UI ---
let inventoryUI = null;
let inventoryOpen = false;

function openInventory() {
  if (inventoryOpen) return;
  inventoryOpen = true;
  inventoryUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("InventoryUI");

  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "400px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  inventoryUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Inventory";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 28;
  panel.addControl(title);

  playerInventory.forEach((itemId, index) => {
    const btn = BABYLON.GUI.Button.CreateSimpleButton("inv_" + index, itemId);
    btn.height = "40px";
    btn.color = "white";
    btn.background = "#333";
    btn.onPointerUpObservable.add(() => console.log("Use/Drop " + itemId));
    panel.addControl(btn);
  });

  const closeBtn = BABYLON.GUI.Button.CreateSimpleButton("close", "Close");
  closeBtn.height = "40px";
  closeBtn.color = "white";
  closeBtn.background = "#a33";
  closeBtn.onPointerUpObservable.add(() => closeInventory());
  panel.addControl(closeBtn);
}

function closeInventory() {
  if (inventoryUI) inventoryUI.dispose();
  inventoryOpen = false;
}

// --- Phone UI ---
let phoneUI = null;
let phoneOpen = false;

function openPhone() {
  if (phoneOpen) return;
  phoneOpen = true;
  phoneUI = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("PhoneUI");

  const panel = new BABYLON.GUI.StackPanel();
  panel.width = "350px";
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
  phoneUI.addControl(panel);

  const title = new BABYLON.GUI.TextBlock();
  title.text = "Phone";
  title.height = "40px";
  title.color = "white";
  title.fontSize = 28;
  panel.addControl(title);

  const friendsBtn = BABYLON.GUI.Button.CreateSimpleButton("friends", "Friends List");
  friendsBtn.height = "40px";
  friendsBtn.color = "white";
  friendsBtn.background = "#333";
  friendsBtn.onPointerUpObservable.add(async () => {
    const friends = await getFriends();
    console.log("Friends:", friends);
  });
  panel.addControl(friendsBtn);

  const invitesBtn = BABYLON.GUI.Button.CreateSimpleButton("invites", "Invites");
  invitesBtn.height = "40px";
  invitesBtn.color = "white";
  invitesBtn.background = "#333";
  invitesBtn.onPointerUpObservable.add(() => {
    console.log("Invites tab — incoming invites will pop up automatically.");
  });
  panel.addControl(invitesBtn);

  const closeBtn = BABYLON.GUI.Button.CreateSimpleButton("close", "Close");
  closeBtn.height = "40px";
  closeBtn.color = "white";
  closeBtn.background = "#a33";
  closeBtn.onPointerUpObservable.add(() => closePhone());
  panel.addControl(closeBtn);
}

function closePhone() {
  if (phoneUI) phoneUI.dispose();
  phoneOpen = false;
}

// --- Keybinds ---
window.addEventListener("keydown", e => {
  if (e.code === "Escape") paused ? closePauseMenu() : openPauseMenu();
  if (e.code === "KeyI") inventoryOpen ? closeInventory() : openInventory();
  if (e.code === "KeyM") phoneOpen ? closePhone() : openPhone();
});

// --- Boot Sequence ---
function startGame() {
  createScene().then(async () => {
    await loadNPCModel();
    await loadAnimations();
    buildWorldServices();
    await loadPlayerState();
    listenForInvites();
    subscribeOthers();
    engine.runRenderLoop(() => scene.render());
    setInterval(spawnWanderingNPC, 8000);
  });
}

// Start at main menu
showMainMenu();
