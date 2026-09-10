import * as THREE from "three";
import { terrainGLSL } from "./shaders.js";

// Cubic B-spline interpolation uses four bilinear fetches, smoothing cell corners.
const waterGLSL =
  terrainGLSL +
  `
uniform float uTime;
uniform float uWind;
uniform vec2 uWindDirection;
// Height and analytic slope of a small directional wave spectrum. A depth cap
// keeps crests/troughs from exposing the bed or tearing the shallow shoreline.
vec3 windWaves(vec2 p,float depth,float footprint){
 float strength=pow(clamp(uWind/40.0,0.0,1.0),1.6);
 float amplitude=min(.24*strength,depth*.2)*smoothstep(.015,.35,depth);
 vec2 along=uWindDirection,across=vec2(-along.y,along.x);
 vec3 wave=vec3(0.0);
 for(int i=0;i<5;i++){
   float n=float(i);
   float angle=sin(n*2.37)*.48;
   vec2 direction=normalize(along*cos(angle)+across*sin(angle));
   float k=.65*pow(1.43,n);
   // Keep phase coherent across depths; depth controls the local amplitude.
   float omega=sqrt(9.81*k);
   float phase=dot(p,direction)*k-omega*uTime+n*2.17;
   float band=pow(.57,n)*(1.0-smoothstep(.45,1.4,k*footprint));
   wave.x+=sin(phase)*band;
   wave.yz+=direction*cos(phase)*k*band;
 }
 return wave*amplitude*.46;
}
vec4 cubicWeights(float f){float f2=f*f,f3=f2*f;return vec4(1.0-3.0*f+3.0*f2-f3,4.0-6.0*f2+3.0*f3,1.0+3.0*f+3.0*f2-3.0*f3,f3)/6.0;}
float surfaceLevel(vec2 p){
 float centerDepth=waterDepth(p);if(centerDepth>.8)return terrain(p)+centerDepth;
 vec2 grid=(p/160.0+.5)*(uSandResolution-1.0),cell=floor(grid),f=fract(grid);
 vec4 wx=cubicWeights(f.x),wy=cubicWeights(f.y);float total=0.0,sum=0.0;
 for(int z=0;z<4;z++)for(int x=0;x<4;x++){
   vec2 q=(cell+vec2(float(x-1),float(z-1)))/(uSandResolution-1.0)*160.0-80.0;
   float d=waterDepth(q);float weight=wx[x]*wy[z]*smoothstep(.0001,.01,d);
   total+=(terrain(q)+d)*weight;sum+=weight;
 }
 float filtered=sum>.00001?total/sum:terrain(p);
 return mix(filtered,terrain(p)+centerDepth,smoothstep(.15,.8,centerDepth));
}
float filteredWaterDepth(vec2 p){
 vec2 grid=(p/160.0+.5)*(uSandResolution-1.0),cell=floor(grid),f=fract(grid);
 vec4 wx=cubicWeights(f.x),wy=cubicWeights(f.y);
 vec2 gx=vec2(wx.x+wx.y,wx.z+wx.w),gy=vec2(wy.x+wy.y,wy.z+wy.w);
 vec2 hx=cell.x+vec2(wx.y/gx.x-1.0,wx.w/gx.y+1.0);
 vec2 hy=cell.y+vec2(wy.y/gy.x-1.0,wy.w/gy.y+1.0);
 float scale=160.0/(uSandResolution-1.0);
 return gx.x*gy.x*waterDepth(vec2(hx.x,hy.x)*scale-80.0)
       +gx.y*gy.x*waterDepth(vec2(hx.y,hy.x)*scale-80.0)
       +gx.x*gy.y*waterDepth(vec2(hx.x,hy.y)*scale-80.0)
       +gx.y*gy.y*waterDepth(vec2(hx.y,hy.y)*scale-80.0);
}
`;

export function createWater(scene, uniforms, defines) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xf5fffc,
    transparent: true,
    depthWrite: false,
    roughness: 0.035,
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
      waterGLSL +
      "\nvarying vec2 vWaterPosition; varying float vWaterLevel;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `
      vWaterPosition=position.xz;
      vWaterLevel=surfaceLevel(position.xz);
      float depth=max(0.0,vWaterLevel-terrain(position.xz));
      float wave=windWaves(position.xz,depth,0.0).x;
      vec3 transformed=vec3(position.x,vWaterLevel+wave+0.012,position.z);
    `,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      `
      vec2 p=position.xz;float e=160.0/(uSandResolution-1.0);
      float head=surfaceLevel(p);
      float l=waterDepth(p-vec2(e,0))>.01?terrain(p-vec2(e,0))+waterDepth(p-vec2(e,0)):head;
      float r=waterDepth(p+vec2(e,0))>.01?terrain(p+vec2(e,0))+waterDepth(p+vec2(e,0)):head;
      float b=waterDepth(p-vec2(0,e))>.01?terrain(p-vec2(0,e))+waterDepth(p-vec2(0,e)):head;
      float f=waterDepth(p+vec2(0,e))>.01?terrain(p+vec2(0,e))+waterDepth(p+vec2(0,e)):head;
      vec3 objectNormal=normalize(vec3(l-r,2.0*e,b-f));
    `,
    );
    shader.fragmentShader =
      waterGLSL +
      "\nvarying vec2 vWaterPosition; varying float vWaterLevel;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `
      #include <clipping_planes_fragment>
      float liquid=min(filteredWaterDepth(vWaterPosition),max(0.0,vWaterLevel-terrain(vWaterPosition)));
      float shoreline=smoothstep(.001,max(.008,fwidth(liquid)*1.5),liquid);
      if(shoreline<=0.0)discard;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      #include <normal_fragment_maps>
      float footprint=max(length(dFdx(vWaterPosition)),length(dFdy(vWaterPosition)));
      vec3 wave=windWaves(vWaterPosition,liquid,footprint);
      vec3 perturbation=mat3(viewMatrix)*vec3(-wave.y,0.0,-wave.z);
      normal=normalize(normal+perturbation);

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
  return {
    mesh,
    stream,
    setResolution(segments) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(160, 160, segments, segments);
      mesh.geometry.rotateX(-Math.PI / 2);
    },
  };
}
