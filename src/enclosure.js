import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { terrainGLSL } from "./shaders.js";

export function createEnclosure(renderer, scene, uniforms, defines) {
  let reflectionMap;
  function refreshEnvironment() {
    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    const previous = reflectionMap;
    reflectionMap = generator.fromScene(environment, 0.04);
    scene.environment = reflectionMap.texture;
    previous?.dispose();
    environment.dispose();
    generator.dispose();
  }
  refreshEnvironment();
  scene.environmentIntensity = 0.65;

  scene.add(new THREE.HemisphereLight(0xdcecf5, 0x675643, 1.8));
  const keyLight = new THREE.DirectionalLight(0xffefda, 2.5);
  keyLight.position.set(-100, 160, 70);
  scene.add(keyLight);

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(164, 3.2, 164, 3, 0.65),
    new THREE.MeshStandardMaterial({
      color: 0x263237,
      roughness: 0.35,
      metalness: 0.65,
    }),
  );
  base.name = "Container base";
  base.position.y = -9.65;
  scene.add(base);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000),
    new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vPosition;void main(){vec4 p=modelMatrix*vec4(position,1.0);vPosition=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `varying vec3 vPosition;void main(){vec2 d=max(abs(vPosition.xz)-vec2(80.0),0.0);float contact=exp(-length(d)*.055);float broad=exp(-dot(vPosition.xz,vPosition.xz)/65000.0);vec3 color=mix(vec3(.25,.29,.31),vec3(.31,.35,.37),broad);color*=1.0-.42*contact;gl_FragColor=vec4(color,1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -11.3;
  ground.name = "Studio floor";
  scene.add(ground);

  // A live cross-section prevents the sand from becoming an infinitely thin sheet
  // when viewed through the walls. Its top edge samples the simulation texture.
  const sideGeometries = [];
  for (const [x, z, angle] of [
    [0, 80, 0],
    [0, -80, Math.PI],
    [80, 0, Math.PI / 2],
    [-80, 0, -Math.PI / 2],
  ]) {
    const geometry = new THREE.PlaneGeometry(160, 1, 192, 1);
    geometry.rotateY(angle);
    geometry.translate(x, 0, z);
    sideGeometries.push(geometry);
  }
  const crossSection = new THREE.Mesh(
    mergeGeometries(sideGeometries),
    new THREE.ShaderMaterial({
      uniforms,
      defines,
      vertexShader: `${terrainGLSL}
      varying vec3 vWorld;varying vec3 vSideNormal;
      void main(){vWorld=vec3(position.x,uv.y>.5?terrain(position.xz):-8.0,position.z);vSideNormal=normal;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}`,
      fragmentShader: `uniform vec3 uSand;uniform vec3 uSun;varying vec3 vWorld;varying vec3 vSideNormal;
      void main(){float grain=fract(sin(dot(floor(vWorld.xy*70.0+vWorld.zy*31.0),vec2(12.9898,78.233)))*43758.5453);float strata=sin(vWorld.y*2.1+sin(vWorld.x*.07+vWorld.z*.1))*.012;float depth=smoothstep(-8.0,4.0,vWorld.y);vec3 color=uSand*(.38+.54*max(dot(normalize(vSideNormal),uSun),0.0))*(.8+.2*depth+strata+(grain-.5)*.035);gl_FragColor=vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    }),
  );
  sideGeometries.forEach((geometry) => geometry.dispose());
  crossSection.frustumCulled = false;
  crossSection.name = "Sand cross-section";
  scene.add(crossSection);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf1ffff,
    metalness: 0,
    roughness: 0.025,
    transmission: 0.98,
    thickness: 0.7,
    ior: 1.5,
    attenuationColor: new THREE.Color(0xa4d9d2),
    attenuationDistance: 90,
    envMapIntensity: 0.7,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    side: THREE.FrontSide,
  });
  const walls = [];
  for (const [x, z, angle] of [
    [0, 80.35, 0],
    [0, -80.35, 0],
    [80.35, 0, Math.PI / 2],
    [-80.35, 0, Math.PI / 2],
  ]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(161.4, 44, 0.7),
      glassMaterial,
    );
    wall.position.set(x, 14, z);
    wall.rotation.y = angle;
    wall.name = "Glass wall";
    walls.push(wall);
    scene.add(wall);
  }

  // Narrow polished edge strips catch light even when looking straight through a pane.
  const edgeParts = [];
  for (const x of [-80.7, 80.7])
    for (const z of [-80.7, 80.7]) {
      const edge = new THREE.BoxGeometry(0.26, 44, 0.26);
      edge.translate(x, 14, z);
      edgeParts.push(edge);
    }
  for (const z of [-80.35, 80.35]) {
    const edge = new THREE.BoxGeometry(161.4, 0.23, 0.72);
    edge.translate(0, 36, z);
    edgeParts.push(edge);
  }
  for (const x of [-80.35, 80.35]) {
    const edge = new THREE.BoxGeometry(0.72, 0.23, 160.8);
    edge.translate(x, 36, 0);
    edgeParts.push(edge);
  }
  const edges = new THREE.Mesh(
    mergeGeometries(edgeParts),
    new THREE.MeshStandardMaterial({
      color: 0x8fc2bd,
      metalness: 0.35,
      roughness: 0.16,
      transparent: true,
      opacity: 0.48,
    }),
  );
  edgeParts.forEach((geometry) => geometry.dispose());
  edges.name = "Polished glass edges";
  scene.add(edges);

  return {
    walls,
    restoreEnvironment: refreshEnvironment,
    setQuality(level) {
      // Refraction requires an additional scene render. Low keeps reflective glass
      // with simple transparency so the enclosure remains usable on slower devices.
      const refractive = level !== "low";
      const changed = glassMaterial.transmission > 0 !== refractive;
      glassMaterial.transmission = refractive ? 0.98 : 0;
      glassMaterial.transparent = !refractive;
      glassMaterial.opacity = refractive ? 1 : 0.14;
      glassMaterial.depthWrite = false;
      if (changed) glassMaterial.needsUpdate = true;
      renderer.transmissionResolutionScale = level === "high" ? 0.75 : 0.5;
    },
    updateSun(direction) {
      keyLight.position.copy(direction).multiplyScalar(200);
    },
  };
}
