import * as THREE from "three";
import { advanceFish, createFishState, fishHabitat } from "./fish-habitat.js";

export function createFishSystem(scene, simulation) {
  let model = null,
    loadError = false,
    time = 0;
  const fish = [];
  const ready = import("three/addons/loaders/GLTFLoader.js")
    .then(({ GLTFLoader }) =>
      new GLTFLoader().loadAsync(
        import.meta.env.BASE_URL + "models/goldfish.glb",
      ),
    )
    .then((gltf) => {
      model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          o.material.side = THREE.DoubleSide;
          // Include the fin membranes in the water's refraction capture. Alpha
          // blending would draw them afterwards at an unrefracted position.
          if (o.material.transparent) {
            o.material.transparent = false;
            o.material.opacity = 1;
            o.material.needsUpdate = true;
          }
        }
      });
    })
    .catch((error) => {
      loadError = true;
      console.error("Goldfish model could not load", error);
    });
  return {
    ready,
    fish,
    get loaded() {
      return !!model;
    },
    add(x, z) {
      if (!model)
        return loadError
          ? "Fish model could not load. Reload to try again."
          : "Goldfish is loading…";
      if (fish.length >= 8)
        return "Eight goldfish is the limit. Reset sand to clear them.";
      const state = createFishState(simulation, x, z, fish.length);
      if (!state) return "Choose deeper, wider water for the goldfish.";
      if (fish.some((f) => Math.hypot(f.state.x - x, f.state.z - z) < 1.2))
        return "Choose a little farther from the other fish.";
      const object = model.clone(true);
      object.scale.setScalar(0.6);
      object.position.set(state.x, state.y, state.z);
      object.rotation.y = -state.heading;
      const fins = [];
      object.traverse((o) => {
        if (o.morphTargetInfluences) fins.push(o);
      });
      scene.add(object);
      fish.push({ state, object, fins });
      return "Click deep water to add a goldfish · Right-drag to orbit";
    },
    update(dt) {
      time += dt;
      for (const f of fish) {
        advanceFish(simulation, f.state, dt, time);
        f.object.position.set(f.state.x, f.state.y, f.state.z);
        f.object.rotation.set(
          f.state.swimming ? 0 : Math.PI / 2,
          -f.state.heading,
          0,
          "YXZ",
        );
        if (f.state.swimming)
          for (const fin of f.fins)
            fin.morphTargetInfluences[0] =
              Math.sin(time * 5 + f.state.phase) * 0.8;
      }
    },
    reset() {
      for (const f of fish) scene.remove(f.object);
      fish.length = 0;
    },
    diagnostics() {
      return {
        loaded: !!model,
        count: fish.length,
        swimming: fish.filter((f) => f.state.swimming).length,
        valid: fish.every(
          (f) =>
            !f.state.swimming ||
            !!fishHabitat(simulation, f.state.x, f.state.z),
        ),
      };
    },
  };
}
