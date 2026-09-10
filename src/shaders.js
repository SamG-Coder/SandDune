// Both rendered terrain and ray picking use the same sampled height fields.
export const terrainGLSL = /* glsl */ `
uniform sampler2D uSandHeight;
uniform float uSandResolution;
uniform vec2 uDrift;
float sampleGrid(sampler2D field, vec2 uv, float resolution) {
  vec2 p=clamp(uv,0.0,1.0)*(resolution-1.0);
  #ifdef FLOAT_LINEAR
  return texture2D(field,(p+0.5)/resolution).r;
  #else
  vec2 cell=floor(p),f=fract(p);
  vec2 a=(cell+0.5)/resolution;
  float e=1.0/resolution;
  return mix(mix(texture2D(field,a).r,texture2D(field,a+vec2(e,0)).r,f.x),mix(texture2D(field,a+vec2(0,e)).r,texture2D(field,a+vec2(e,e)).r,f.x),f.y);
  #endif
}
float terrain(vec2 p) {
  return sampleGrid(uSandHeight,p/160.0+0.5,uSandResolution);
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;
export const terrainVertex = /* glsl */ `
${terrainGLSL}
varying vec3 vWorld;
void main(){vec2 p=position.xz;vWorld=vec3(p.x,terrain(p),p.y);gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}
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
uniform vec3 uBrush;
varying vec3 vWorld;
void main(){
 vec2 p=vWorld.xz;
 float distanceToCamera=length(cameraPosition-vWorld);
 float e=0.65;
 vec3 n=normalize(vec3(terrain(p-vec2(e,0))-terrain(p+vec2(e,0)),2.0*e,terrain(p-vec2(0,e))-terrain(p+vec2(0,e))));
 // Very shallow, broken capillary-scale surface detail; no giant striped normal map.
 vec2 across=vec2(-uWindDirection.y,uWindDirection.x);
 float irregular=noise(p*.72);
 float phase=dot(p,uWindDirection)*24.0+noise(p*.35)*6.0-dot(uDrift,uWindDirection)*.75;
 float footprint=fwidth(phase);
 float detail=(1.0-smoothstep(.4,2.8,footprint))*(1.0-smoothstep(18.0,75.0,distanceToCamera));
 float ripple=sin(phase)*.018*detail*(.3+irregular*.7);
 n=normalize(n+vec3(uWindDirection.x,0,uWindDirection.y)*ripple);
 float shade=1.0;
 float surfaceHeight=terrain(p);
 if(uShadows>.5){float horizontal=max(length(uSun.xz),.01);vec2 direction=uSun.xz/horizontal;float rise=uSun.y/horizontal;
  for(int i=1;i<=5;i++){float d=float(i*i)*1.8;float obstruction=terrain(p+direction*d)-surfaceHeight-rise*d;shade=min(shade,1.0-smoothstep(-.7,1.4,obstruction)*.79);}}
 float ndl=max(dot(n,uSun),0.0);
 vec3 ambient=vec3(.24,.28,.34)*.73;
 vec3 sunlight=mix(vec3(1.34,.99,.66),vec3(1.16,1.13,1.01),smoothstep(0.1,.8,uSun.y));
 float fine=noise(p*140.0);
 float grainFade=1.0-smoothstep(.25,1.5,length(fwidth(p*140.0)));
 vec3 albedo=uSand*(.96+noise(p*.055)*.045+(fine-.5)*.15*grainFade);
 vec3 color=albedo*(ambient+sunlight*ndl*shade);
 vec3 viewDirection=normalize(cameraPosition-vWorld);
 color+=uSand*pow(1.0-clamp(dot(n,viewDirection),0.0,1.0),4.0)*.07*shade;
 vec2 moving=p-uDrift*1.7;
 float veil=smoothstep(.56,.83,noise(vec2(dot(moving,uWindDirection)*.21,dot(moving,across)*1.0)))*uWind/40.0*.018;
 color=mix(color,uFog,veil);
 float fog=1.0-exp(-distanceToCamera*uHaze*.00025);
 color=mix(color,uFog,min(fog,.97));
 if(uBrush.z>0.0){float r=length(p-uBrush.xy);float line=1.0-smoothstep(.025,.09,abs(r-uBrush.z));color=mix(color,vec3(.95,.83,.62),line*.58);}
 gl_FragColor=vec4(color,1);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
export const skyVertex = /* glsl */ `
varying vec3 vDirection;
void main(){vDirection=position;vec4 p=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1);gl_Position=p.xyww;}
`;
export const skyFragment = /* glsl */ `
varying vec3 vDirection;
void main(){vec3 ray=normalize(vDirection);float up=smoothstep(-0.12,0.7,ray.y);vec3 color=mix(vec3(.25,.29,.31),vec3(.47,.52,.55),up);gl_FragColor=vec4(color,1);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;
export const particleVertex = /* glsl */ `
${terrainGLSL}
attribute vec4 aSeed;uniform float uTime;uniform float uWind;uniform float uPixelRatio;uniform vec2 uWindDirection;varying float vAlpha;
void main(){vec2 p=mod(position.xz+uDrift*(1.0+aSeed.x*.9)+vec2(79),vec2(158))-79.0;float hop=.5+.5*sin(uTime*(1.8+aSeed.x*2.0)+aSeed.y*30.0);float altitude=.04+hop*hop*(.1+uWind*.04)*aSeed.z;vec4 mv=viewMatrix*vec4(p.x,terrain(p)+altitude,p.y,1);vAlpha=(1.0-smoothstep(72.0,79.0,max(abs(p.x),abs(p.y))))*smoothstep(3.0,15.0,uWind)*(.16+aSeed.w*.2)*(1.0-smoothstep(60.0,160.0,-mv.z));gl_PointSize=clamp((18.0+aSeed.w*30.0)*uPixelRatio/max(-mv.z,1.0),1.0,4.0);gl_Position=projectionMatrix*mv;}
`;
export const particleFragment = /* glsl */ `
uniform vec3 uFog;varying float vAlpha;
void main(){vec2 q=(gl_PointCoord-.5)*2.0;float alpha=exp(-dot(q,q)*4.0)*(1.0-smoothstep(.6,1.0,length(q)))*vAlpha;gl_FragColor=vec4(uFog*1.2,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;
