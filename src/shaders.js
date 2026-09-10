export const terrainGLSL = /* glsl */ `
uniform vec2 uDrift;
float terrain(vec2 p) {
  p -= uDrift * 0.018;
  float warp = 18.0*sin(p.y*0.013) + 10.0*sin(p.y*0.027+p.x*0.004);
  float phase = (p.x+warp)*0.027+p.y*0.008;
  float s = sin(phase);
  float ridge = 1.0-sqrt(s*s+0.003);
  float amplitude = 28.0+9.0*sin(p.y*0.009+p.x*0.005);
  return ridge*ridge*amplitude + 5.0*sin(p.y*0.019+p.x*0.011)
    + 3.0*sin(p.x*0.008-p.y*0.013)-8.0;
}
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
`;

export const terrainVertex = /* glsl */ `
${terrainGLSL}
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec2 p=position.xz;
  float h=terrain(p);
  float e=0.35;
  vNormal=normalize(vec3(terrain(p-vec2(e,0))-terrain(p+vec2(e,0)),2.0*e,terrain(p-vec2(0,e))-terrain(p+vec2(0,e))));
  vWorld=vec3(p.x,h,p.y);
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}
`;

export const terrainFragment = /* glsl */ `
${terrainGLSL}
uniform vec3 uSun;
uniform vec3 uSand;
uniform vec3 uFog;
uniform vec2 uWindDirection;
uniform float uWind;
uniform float uTime;
uniform float uHaze;
uniform float uShadows;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec2 p=vWorld.xz;
  float distanceToCamera=length(cameraPosition-vWorld);
  // Band-limit micro-ripples using derivatives: no crawling patterns at the horizon.
  vec2 across=vec2(-uWindDirection.y,uWindDirection.x);
  float ripplePhase=dot(p,uWindDirection)*10.0 + 1.3*sin(dot(p,across)*0.65)
    + 0.7*sin(dot(p,across)*1.3) - dot(uDrift,uWindDirection)*2.5;
  float footprint=fwidth(ripplePhase);
  float detailFade=(1.0-smoothstep(0.65,3.0,footprint))*(1.0-smoothstep(60.0,210.0,distanceToCamera));
  float ripple=sin(ripplePhase)+0.24*sin(ripplePhase*2.0);
  float slope=cos(ripplePhase)+0.48*cos(ripplePhase*2.0);
  float grain=noise(p*95.0);
  vec3 n=normalize(vNormal+vec3(uWindDirection.x,0.0,uWindDirection.y)*slope*0.16*detailFade);
  float shade=1.0;
  // A bounded height-field visibility estimate replaces a large dynamic shadow map.
  if(uShadows>0.5) {
    float horizontal=max(length(uSun.xz),0.01);
    vec2 towardSun=uSun.xz/horizontal;
    float rise=uSun.y/horizontal;
    for(int i=1;i<=6;i++) {
      float d=float(i)*float(i)*2.8;
      float obstruction=terrain(p+towardSun*d)-vWorld.y-rise*d;
      shade=min(shade,1.0-smoothstep(-1.6,2.3,obstruction)*0.83);
    }
  }
  float ndl=max(dot(n,uSun),0.0);
  vec3 ambient=mix(vec3(0.29,0.32,0.37),vec3(0.53,0.46,0.35),uSun.y)*0.75;
  vec3 sunlight=mix(vec3(1.42,0.96,0.51),vec3(1.25,1.18,0.98),smoothstep(0.0,0.7,uSun.y));
  float variation=noise(p*0.024)*0.07+noise(p*0.1)*0.025;
  vec3 albedo=uSand*(0.91+variation+ripple*0.026*detailFade+(grain-0.5)*0.035*detailFade);
  vec3 color=albedo*(ambient+sunlight*ndl*shade);
  // Broad grazing response gives dry grains a soft, powdery appearance.
  vec3 viewDirection=normalize(cameraPosition-vWorld);
  float grazing=pow(1.0-max(dot(n,viewDirection),0.0),3.0);
  color+=uSand*grazing*0.11*shade;
  float sparkle=pow(max(dot(reflect(-uSun,n),viewDirection),0.0),28.0);
  color+=vec3(1.0,0.83,0.53)*sparkle*0.065*shade;
  // Wind advects a thin surface veil independently of the slow landform.
  vec2 moving=p-uDrift*1.8;
  float veil=smoothstep(0.53,0.83,noise(vec2(dot(moving,uWindDirection)*0.09,dot(moving,across)*0.6)));
  veil*=uWind/40.0*(0.06+0.10*(1.0-n.y));
  color=mix(color,uFog*1.08,veil);
  float fog=1.0-exp(-distanceToCamera*(0.0013+uHaze*0.005));
  color=mix(color,uFog,clamp(fog,0.0,0.97));
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection=position;
  vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.0);
  gl_Position=p.xyww;
}
`;
export const skyFragment = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uHaze;
varying vec3 vDirection;
void main() {
  vec3 ray=normalize(vDirection);
  float elevation=max(ray.y,0.0);
  vec3 zenith=mix(vec3(0.27,0.42,0.53),vec3(0.25,0.48,0.68),uSun.y);
  zenith=mix(zenith,uFog,uHaze*0.7);
  vec3 color=mix(uFog,zenith,1.0-exp(-elevation*3.5));
  float alignment=max(dot(ray,uSun),0.0);
  color+=vec3(1.0,0.69,0.35)*pow(alignment,12.0)*0.20*(1.0-uHaze*0.4);
  color+=vec3(1.0,0.77,0.45)*pow(alignment,180.0)*0.38;
  float disc=smoothstep(cos(0.009),cos(0.006),alignment);
  color+=vec3(3.0,2.4,1.55)*disc*(1.0-uHaze*0.8);
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const particleVertex = /* glsl */ `
${terrainGLSL}
attribute vec4 aSeed;
uniform float uTime;
uniform float uWind;
uniform float uPixelRatio;
uniform vec2 uWindDirection;
varying float vAlpha;
varying float vStretch;
void main() {
  vec2 p=mod(position.xz+uDrift*(1.0+aSeed.x*0.9)+vec2(240.0),vec2(480.0))-240.0;
  float hop=0.5+0.5*sin(uTime*(0.7+aSeed.x)+aSeed.y*30.0);
  float altitude=0.15+aSeed.z*aSeed.z*11.0+hop*hop*(uWind/40.0)*3.0;
  vec3 world=vec3(p.x,terrain(p)+altitude,p.y);
  vec4 mv=viewMatrix*vec4(world,1.0);
  float edge=1.0-smoothstep(175.0,235.0,max(abs(p.x),abs(p.y)));
  vAlpha=edge*smoothstep(0.0,6.0,uWind)*(0.13+aSeed.w*0.18);
  vAlpha*=1.0-smoothstep(140.0,290.0,-mv.z);
  vStretch=1.0+uWind*0.025;
  gl_PointSize=clamp((30.0+aSeed.w*65.0)*uPixelRatio/max(-mv.z,1.0),1.0,7.0);
  gl_Position=projectionMatrix*mv;
}
`;
export const particleFragment = /* glsl */ `
uniform vec3 uFog;
varying float vAlpha;
varying float vStretch;
void main() {
  vec2 q=(gl_PointCoord-0.5)*2.0;
  float alpha=exp(-dot(q*vec2(1.0,vStretch),q*vec2(1.0,vStretch))*3.5)*(1.0-smoothstep(0.6,1.0,length(q)))*vAlpha;
  gl_FragColor=vec4(uFog*1.35,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
