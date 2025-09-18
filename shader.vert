// p5.js WEBGL vertex shader for full-screen quad (canonical transform)
precision highp float;

attribute vec3 aPosition; // in 0..1 range from p5 rect quad

varying vec2 vUv;

void main() {
  // Use aPosition (0..1) directly as UV
  vUv = aPosition.xy;

  // Convert 0..1 to clip space -1..1
  vec4 pos = vec4(aPosition, 1.0);
  pos.xy = pos.xy * 2.0 - 1.0;
  gl_Position = pos;
}


