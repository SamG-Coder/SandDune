import * as THREE from "three";
import { advanceFish, createDropState, fishHabitat } from "./fish-habitat.js";

export function createFishSystem(scene, simulation) {
  let model = null,
    loadError = false,
    time = 0,
    limit = 24;
  const orientation = new THREE.Quaternion(),
    euler = new THREE.Euler(0, 0, 0, "YXZ");
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
    get limit() {
      return limit;
    },
    setLimit(value) {
      limit = Math.max(1, Math.min(64, Math.round(Number(value) || 1)));
    },
    add(x, z) {
      if (!model)
        return loadError
          ? "Fish model could not load. Reload to try again."
          : "Goldfish is loading…";
      if (fish.length >= limit)
        return "Fish limit reached · Increase the limit or reset sand";
      const id = fish.length;
      const size = 0.7 + ((id * 7) % 10) * 0.05;
      const state = createDropState(simulation, x, z, id, size);
      const object = model.clone(true);
      object.scale.setScalar(0.6 * size);
      const materials = [];
      const palettes = [
        [0xf89b23, 0xffe0ac],
        [0xf4e8d2, 0xe75c15],
        [0xe5d9c4, 0x263139],
        [0xcd651b, 0xffc63e],
        [0x35302a, 0xc58a40],
      ];
      const palette = palettes[id % palettes.length];
      object.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        materials.push(o.material);
        if (o.material.map) {
          o.material.onBeforeCompile = (shader) => {
            shader.uniforms.fishBase = { value: new THREE.Color(palette[0]) };
            shader.uniforms.fishPatch = { value: new THREE.Color(palette[1]) };
            shader.uniforms.fishSeed = { value: id * 1.731 };
            shader.fragmentShader =
              "uniform vec3 fishBase; uniform vec3 fishPatch; uniform float fishSeed;\n" +
              shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              `
              #include <map_fragment>
              vec2 p = vMapUv * vec2(15.,9.);
              float pattern = sin(p.x+fishSeed+sin(p.y*1.7))*sin(p.y+sin(p.x*.8+fishSeed));
              float marking = smoothstep(.05,.25,pattern);
              float scaleDetail = (.45 + diffuseColor.r * .7);
              diffuseColor.rgb = mix(fishBase,fishPatch,marking) * scaleDetail;
            `,
            );
          };
          o.material.customProgramCacheKey = () => "goldfish-pattern-v1";
        } else if (/fin|lips/i.test(o.material.name)) {
          o.material.color
            .set(palette[0])
            .lerp(new THREE.Color(palette[1]), 0.35);
        }
      });
      object.position.set(state.x, state.y, state.z);
      object.rotation.y = -state.heading;
      const fins = [];
      object.traverse((o) => {
        if (o.morphTargetInfluences) fins.push(o);
      });
      scene.add(object);
      fish.push({ state, object, fins, materials });
      return "Hold to drop goldfish · Fish need deep water to swim";
    },
    update(dt) {
      time += dt;
      const peers = fish.map((f) => f.state);
      for (const f of fish) {
        advanceFish(simulation, f.state, dt, time, peers);
        f.object.position.set(f.state.x, f.state.y, f.state.z);
        const stranded = f.state.mode === "stranded";
        const falling = f.state.mode === "falling";
        const flop = stranded
          ? Math.pow(Math.max(0, Math.sin(time * 2 + f.state.phase)), 12)
          : 0;
        euler.set(
          stranded ? Math.PI / 2 - flop * 0.22 : f.state.turn * 0.06,
          -f.state.heading,
          falling ? -0.35 : 0,
          "YXZ",
        );
        orientation.setFromEuler(euler);
        f.object.quaternion.slerp(orientation, 1 - Math.exp(-dt * 9));
        for (const fin of f.fins)
          fin.morphTargetInfluences[0] = stranded
            ? flop * 0.45
            : Math.sin(
                time * (falling ? 3 : 4 + f.state.speed) + f.state.phase,
              ) * 0.7;
      }
    },
    reset() {
      for (const f of fish) {
        scene.remove(f.object);
        for (const material of f.materials) material.dispose();
      }
      fish.length = 0;
    },
    diagnostics() {
      return {
        loaded: !!model,
        count: fish.length,
        limit,
        falling: fish.filter((f) => f.state.mode === "falling").length,
        stranded: fish.filter((f) => f.state.mode === "stranded").length,
        swimming: fish.filter((f) => f.state.swimming).length,
        valid: fish.every(
          (f) =>
            !f.state.swimming ||
            !!fishHabitat(simulation, f.state.x, f.state.z, f.state.size),
        ),
      };
    },
  };
}
