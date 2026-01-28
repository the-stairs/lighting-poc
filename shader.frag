// Lighting POC fragment shader implementing inverse-square falloff,
// hotspot/penumbra, additive accumulation, exposure tone-mapping, and sRGB out.
precision highp float;

#define U_MAX_LIGHTS 64

const int DEBUG_OPACITY_VIS = 0; // 1: show opacity visualization

// from vertex shader
varying vec2 vUv;

uniform vec2 u_resolution;
uniform vec3 u_bgColorLinear;
uniform float u_exposure;
uniform int u_numLights;
uniform int u_colorSpace; // 0: linear, 1: sRGB input on CPU side (kept for future)

uniform int u_lightType[U_MAX_LIGHTS];
uniform vec2 u_lightPos[U_MAX_LIGHTS];
uniform vec3 u_lightColorLinear[U_MAX_LIGHTS];
uniform float u_lightIntensity[U_MAX_LIGHTS];
uniform float u_lightSize[U_MAX_LIGHTS];
uniform float u_lightFeather[U_MAX_LIGHTS];
uniform vec2 u_lightRectSize[U_MAX_LIGHTS];
uniform float u_lightFalloffK[U_MAX_LIGHTS];
uniform float u_lightRotation[U_MAX_LIGHTS];
uniform float u_lightOpacity[U_MAX_LIGHTS];

// rotate point p by angle r (radians)
vec2 rotate2D(vec2 p, float r) {
  float c = cos(r), s = sin(r);
  return mat2(c, -s, s, c) * p;
}

// signed distance to axis-aligned box of half-size b
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

vec3 toneMapAndToSRGB(vec3 linearColor, float exposure) {
  vec3 mapped = 1.0 - exp(-linearColor * exposure);
  // linear to sRGB approx gamma 2.2
  mapped = clamp(mapped, 0.0, 1.0);
  return pow(mapped, vec3(1.0 / 2.2));
}

void main() {
  // Use fragment coordinate in pixel space (origin bottom-left)
  vec2 frag = gl_FragCoord.xy;

  // accumulate lighting in linear space (lights only)
  vec3 lightAccum = vec3(0.0);

  int count = u_numLights;
  if (count > U_MAX_LIGHTS) {
    count = U_MAX_LIGHTS;
  }

  for (int i = 0; i < U_MAX_LIGHTS; i++) {
    if (i >= count) break;

    int t = u_lightType[i];
    vec2 pos = u_lightPos[i];
    vec3 colorL = u_lightColorLinear[i];
    float intensityHdr = u_lightIntensity[i];
    float sizePx = max(u_lightSize[i], 0.0);
    float featherPx = max(u_lightFeather[i], 0.0);
    vec2 rectSize = max(u_lightRectSize[i], vec2(1.0));
    float k = max(u_lightFalloffK[i], 0.0001);
    float rot = u_lightRotation[i];
    float opacity = clamp(u_lightOpacity[i], 0.0, 1.0);
    float op = pow(opacity, 2.2);

    float R = sizePx;
    float F = max(featherPx, 0.0);

    // edge distance: <=0 inside core, >0 outside
    float edgeDist;
    if (t == 0) {
      // circle core: radius R
      float r = distance(frag, pos);
      edgeDist = r - R;
    } else if (t == 1) {
      // rectangle core: inside box is core (use SDF)
      vec2 p = frag - pos;
      vec2 pl = rotate2D(p, -rot);
      float dBox = sdBox(pl, 0.5 * rectSize);
      edgeDist = dBox; // negative inside, zero at edge, positive outside
    } else {
      // ellipse core: rectSize holds diameter (x,y)
      vec2 rad = 0.5 * rectSize;
      rad = max(rad, vec2(1.0));
      vec2 q = (frag - pos) / rad;
      float d = length(q);
      edgeDist = (d - 1.0) * max(rad.x, rad.y);
    }

    // apply falloff only outside the hotspot core
    float distFromCore = max(0.0, edgeDist);
    // inward feather: keep outer radius fixed, fade only inside
    float Fe = clamp(F, 1e-6, R);
    float profile;
    if (edgeDist >= 0.0) {
      profile = 0.0; // outside is always 0
    } else if (edgeDist <= -Fe) {
      profile = 1.0; // inner flat region
    } else {
      // feather band: (R-Fe) .. R => 1 -> 0
      float t = clamp((edgeDist + Fe) / Fe, 0.0, 1.0); // 0(inner) -> 1(edge)
      profile = 1.0 - smoothstep(0.0, 1.0, t);
      const float EDGE_GAMMA = 1.6; // perceptual edge lock (softer rolloff)
      profile = pow(profile, EDGE_GAMMA);
    }

    // uniform intensity; no falloff in core or outside
    float intensity = intensityHdr / 2000.0;
    vec3 baseContrib = colorL * intensity * profile;
    if (op <= 0.0) continue;
    if (DEBUG_OPACITY_VIS == 1) {
      lightAccum += vec3(op);
    } else {
      lightAccum += baseContrib * op;
    }
  }

  // add background in linear space
  vec3 accumLinear = u_bgColorLinear + lightAccum;

  vec3 srgb = toneMapAndToSRGB(accumLinear, u_exposure);
  gl_FragColor = vec4(srgb, 1.0);
}


