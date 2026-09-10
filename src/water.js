import * as THREE from "three";
import { terrainGLSL } from "./shaders.js";

export function createWater(scene, uniforms, defines) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf5fffc,
    roughness: 0.018,
    metalness: 0,
    transmission: 0.98,
    thickness: 0.5,
    ior: 1.333,
    attenuationColor: new THREE.Color(0xb5e3d9),
    attenuationDistance: 30,
    envMapIntensity: 1.1,
  });
  material.defines = { ...material.defines, ...defines };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      terrainGLSL + "\nvarying vec2 vWaterPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      vWaterPosition=position.xz;
      float depth=waterDepth(position.xz);
      vec3 transformed=vec3(position.x,terrain(position.xz)+depth+0.012,position.z);
    `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `
      float e=0.65;vec2 p=position.xz;
      float head=terrain(p)+waterDepth(p);
      float l=waterDepth(p-vec2(e,0))>.003?terrain(p-vec2(e,0))+waterDepth(p-vec2(e,0)):head;
      float r=waterDepth(p+vec2(e,0))>.003?terrain(p+vec2(e,0))+waterDepth(p+vec2(e,0)):head;
      float b=waterDepth(p-vec2(0,e))>.003?terrain(p-vec2(0,e))+waterDepth(p-vec2(0,e)):head;
      float f=waterDepth(p+vec2(0,e))>.003?terrain(p+vec2(0,e))+waterDepth(p+vec2(0,e)):head;
      vec3 objectNormal=normalize(vec3(l-r,2.0*e,b-f));
    `,
    );
    shader.fragmentShader =
      terrainGLSL +
      "\nuniform float uTime;\nvarying vec2 vWaterPosition;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `
      #include <clipping_planes_fragment>
      float liquid=waterDepth(vWaterPosition);
      if(liquid<0.003)discard;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      float ripple=sin(vWaterPosition.x*7.0+vWaterPosition.y*3.0-uTime*4.5);
      float crossRipple=cos(vWaterPosition.y*8.3-uTime*3.7);
      normal=normalize(normal+vec3(ripple,crossRipple,0.0)*0.012*smoothstep(.003,.1,liquid));
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <transmission_fragment>",
      THREE.ShaderChunk.transmission_fragment.replace(
        "material.thickness = thickness;",
        "material.thickness = max(liquid,0.005);",
      ),
    );
  };
  const geometry = new THREE.PlaneGeometry(160, 160, 192, 192);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Pooled water";
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  const drops = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) {
    drops[i * 3] = Math.sin(i * 12.4);
    drops[i * 3 + 1] = i / 180;
    drops[i * 3 + 2] = Math.cos(i * 8.7);
  }
  const streamGeometry = new THREE.BufferGeometry();
  streamGeometry.setAttribute("position", new THREE.BufferAttribute(drops, 3));
  const stream = new THREE.Points(
    streamGeometry,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `uniform vec3 uPourPoint;uniform float uElapsed;uniform float uPixelRatio;
      void main(){float fall=fract(position.y+uElapsed*1.7);vec3 p=uPourPoint+vec3(position.x*.35,(1.0-fall*fall)*11.0,position.z*.35);vec4 mv=viewMatrix*vec4(p,1);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(190.0*uPixelRatio/max(-mv.z,1.0),1.3,4.0);}`,
      fragmentShader: `void main(){if(length(gl_PointCoord-.5)>.5)discard;gl_FragColor=vec4(.5,.78,.92,1);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
  );
  stream.name = "Water pour";
  stream.frustumCulled = false;
  stream.visible = false;
  scene.add(stream);
  return { mesh, stream };
}
