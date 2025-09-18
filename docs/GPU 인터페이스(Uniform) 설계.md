# 📦 GPU 인터페이스(Uniform) 설계

**쉐이더(uniform) 설계안 + 데이터 구조 + 연산 모델**을 포함한, p5.js(WebGL) 기반 **라이트 렌더링 사양서**

## 공통(전역) Uniform

| 이름              | 타입    | 범위/예시          | 설명                                                                  |
| ----------------- | ------- | ------------------ | --------------------------------------------------------------------- |
| `u_resolution`    | `vec2`  | (canvasW, canvasH) | 픽셀 좌표 → 정규화 변환용                                             |
| `u_bgColorLinear` | `vec3`  | 0–1 (linear)       | 배경색(Linear 공간)                                                   |
| `u_exposure`      | `float` | 0.1–5.0            | 톤매핑용 노출(밝기 전역 스케일)                                       |
| `u_blendStrength` | `float` | 0–2.0              | 조명 누적 강도 스케일(MVP의 “블렌딩 강도” 슬라이더)                   |
| `u_numLights`     | `int`   | 0–`U_MAX_LIGHTS`   | 현재 활성 조명 개수                                                   |
| `u_colorSpace`    | `int`   | 0 or 1             | 0: Linear 입력, 1: sRGB 입력(팔레트가 sRGB인 경우 내부에서 선형 변환) |

> 권장 기본값: `u_exposure=1.2`, `u_blendStrength=1.0`, `u_colorSpace=1` (UI 팔레트가 일반적으로 sRGB)

---

## 라이트 배열 Uniform (MVP: 정적 Max, 예: 64개)

> WebGL1 호환을 위해 **구조체 배열 대신, 속성별 배열**을 사용합니다.

| 이름                 | 타입                  | 인덱스 | 범위/예시        | 설명                                       |
| -------------------- | --------------------- | ------ | ---------------- | ------------------------------------------ |
| `u_lightType`        | `int[U_MAX_LIGHTS]`   | i      | 0=Circle, 1=Rect | 모양 구분                                  |
| `u_lightPos`         | `vec2[U_MAX_LIGHTS]`  | i      | 픽셀 좌표        | 조명 중심 좌표                             |
| `u_lightColorLinear` | `vec3[U_MAX_LIGHTS]`  | i      | 0–1              | 조명 색(Linear)                            |
| `u_lightIntensity`   | `float[U_MAX_LIGHTS]` | i      | 0–2000           | **HDR 스케일** 밝기(패널 슬라이더)         |
| `u_lightRadius`      | `float[U_MAX_LIGHTS]` | i      | px               | 원형 반경(또는 사각형 기준 반경)           |
| `u_lightRectSize`    | `vec2[U_MAX_LIGHTS]`  | i      | px               | 사각형 가로/세로 (원형이면 (r,r) 권장)     |
| `u_lightSoftness`    | `float[U_MAX_LIGHTS]` | i      | 0–1              | 페널브라 폭(0=딱딱함, 1=부드러움)          |
| `u_lightHotspot`     | `float[U_MAX_LIGHTS]` | i      | 0–1              | 중심부 핫스폿 비율(핫스폿 반경/전체 반경)  |
| `u_lightFalloffK`    | `float[U_MAX_LIGHTS]` | i      | 0.1–8            | inverse-square 계수(감쇠 강도)             |
| `u_lightRotation`    | `float[U_MAX_LIGHTS]` | i      | 라디안           | 사각형 회전(0으로 시작, MVP 회전 off 가능) |

> 성능을 위해 **불필요 속성은 UI 고정값**으로 두고 미설정 가능(예: `rotation=0.0`)
> `U_MAX_LIGHTS`는 MVP 32\~64 권장. (모바일: 24\~32)

---

# 🔁 CPU(패널/UI) → GPU 업데이트 플로우

1. **선택 조명 변경 시**

   - 패널 슬라이더/팔레트 → 선택 조명 객체 갱신
   - “HDR 밝기” 슬라이더는 `light.intensity`에 그대로 반영 (0–2000 권장)

2. **프레임 렌더 전**

   - 활성 조명 목록을 압축(삭제된 슬롯 스킵) → `u_numLights` 갱신
   - 색상: 팔레트(sRGB)라면 CPU측에서 **Linear 변환** 후 `u_lightColorLinear[i]`에 세팅

     - 변환: `linear = pow(srgb, 2.2)` (근사)

   - 배경색도 동일한 방식으로 Linear 변환 후 `u_bgColorLinear`로 전달
   - `u_exposure`, `u_blendStrength`는 패널 전역 슬라이더 값 반영

3. **패널 토글(숨김) 시**

   - 선택 조명 ID를 **즉시 해제** (패널 비활성화 상태 유지)

4. **더블클릭 삭제 시**

   - 배열에서 해당 조명을 제거 → 다음 프레임에 `u_*` 배열 압축/재업로드

---

# 📐 좌표·단위 규칙

- **프래그 좌표**: `fragCoord`를 픽셀기반으로 사용 (`gl_FragCoord.xy`)
- **위치/사이즈**: 모두 **픽셀 단위** (캔버스 리사이즈 시 UI→값 동일 유지, 내부에서만 스케일)
- **정규화 좌표가 필요하면** 셰이더 내에서 `uv = fragCoord / u_resolution`으로 파생

---

# 🔬 라이트 물리/수학 모델

## 1) Inverse-Square Falloff (핵심)

- 기본 세기:

  - `d = distance(frag, lightPos)`
  - **핫스폿/페널브라 경계 적용 전** 기초 감쇠:

    - `base = 1.0 / (1.0 + u_lightFalloffK[i] * (d*d))`

- HDR 밝기 결합:

  - `intensity = u_lightIntensity[i] * base`

## 2) 핫스폿 + 페널브라(Softness)

- 두 개의 반경 정의:

  - `R = u_lightRadius[i]` (원형 기준) / 사각형은 등가 반경 사용
  - `R_hot = R * u_lightHotspot[i]` (핫스폿 경계)
  - `R_soft = mix(R, R*1.6, u_lightSoftness[i])` (외곽 페널브라 끝, 가중치 예시)

- **형상별 거리 필드**

  - 원형: `r = distance(frag, pos)`
  - 사각형: 회전 적용 후 **Signed Distance to Box**

    - `p = rotate(frag - pos, -rotation)`
    - `q = abs(p) - 0.5 * u_lightRectSize[i]`
    - `r = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)` (sdBox)

- **프로파일(부드러운 가장자리)**

  - 내부(핫스폿): `r <= R_hot` → `profile = 1.0`
  - 전이: `R_hot < r < R_soft` → `profile = smoothstep(R_soft, R_hot, r)`
  - 외부: `r >= R_soft` → `profile = 0.0`

- **최종 라이트 기여**

  - `lightRGB_linear = u_lightColorLinear[i] * intensity * profile`

## 3) Additive Blending + 강도

- 모든 라이트 기여를 선형 공간에서 **합산**:

  - `accum_linear += lightRGB_linear`

- 전역 스케일:

  - `accum_linear *= u_blendStrength`

## 4) 톤매핑 + sRGB 변환

- 노출 적용: `mapped = 1.0 - exp(-accum_linear * u_exposure)` _(Filmic 근사보다 가벼운 Exponential)_
- sRGB 출력: `srgb = pow(clamp(mapped, 0.0, 1.0), 1.0/2.2)`

> 배경 합성: **배경도 선형 공간**에서 시작 → 톤매핑 전 라이트와 합성하거나,
> 간단히: `final_linear = bg_linear + accum_linear` 후 동일 톤매핑(권장).
> (배경을 나중에 sRGB로 더하면 감마 오류 발생)

---

# 🧱 CPU 측 데이터 구조 (권장)

```ts
// 의사-데이터 구조 (설계용, 코드X)
Light = {
  id: string,
  type: "circle" | "rect",
  pos: { x: number, y: number }, // px
  colorSrgb: { r: number, g: number, b: number }, // 0–1
  colorLinear: { r: number, g: number, b: number }, // 내부 캐시 (팔레트 변경 시만 재계산)
  intensity: number, // 0–2000 (HDR)
  radius: number, // circle용
  rectSize: { w: number, h: number }, // rect용
  softness: number, // 0–1
  hotspot: number, // 0–1
  falloffK: number, // 0.1–8
  rotation: number, // 라디안 (0으로 시작)
  selected: boolean,
};
```

- **렌더 타임**: 활성 라이트만 압축 → 순서대로 uniform 배열 채움
- **삭제/추가**: 배열 재정렬(압축) 후 `u_numLights`만 변경하면 OK

---

# 🎛️ 패널 슬라이더 매핑 (권장 초기값/범위)

| 패널 항목      | 대상/Uniform            |  권장 범위 |     초기값 | 비고                          |
| -------------- | ----------------------- | ---------: | ---------: | ----------------------------- |
| 밝기(HDR)      | `u_lightIntensity[i]`   |     0–2000 |        300 | 실내 조명\~강광 촬영 테스트용 |
| 반경           | `u_lightRadius[i]`      | 10–1200 px |        300 | 디스플레이 크기에 맞춰 조정   |
| 사각 가로/세로 | `u_lightRectSize[i]`    | 10–2000 px |    600/300 | 키라이트, 소프트박스 느낌     |
| Softness       | `u_lightSoftness[i]`    |        0–1 |       0.35 | 페널브라 폭                   |
| Hotspot        | `u_lightHotspot[i]`     |        0–1 |       0.25 | 중심 과광/핫스폿              |
| Falloff        | `u_lightFalloffK[i]`    |      0.1–8 |        1.5 | 1/r² 계수(감쇠)               |
| 색상           | `u_lightColorLinear[i]` |        0–1 | 5600K 근사 | sRGB→Linear 변환 후 저장      |
| 블렌딩 강도    | `u_blendStrength`       |        0–2 |        1.0 | 조명 중첩 강도 조절           |
| 노출           | `u_exposure`            |      0.1–5 |        1.2 | 전체 톤 매핑                  |

---

# 🧭 선택/패널 UX 규칙

- **패널 토글로 숨김** → 즉시 **선택 해제** & 패널 입력 비활성화
- **선택 표시**: MVP에서는 캔버스 내 얇은 외곽선(가이드). 확장 단계에서 **패널 리스트**로 전환 가능
- **삭제**: 패널 버튼 or 더블클릭. 삭제 후 패널 값 리셋/비활성화

---

# ⚙️ 성능/정확도 가이드

- **정밀도**: `precision highp float;` (모바일 HDR 느낌 유지)
- **최적화**:

  - 화면 전체 단일 패스(풀스크린 쿼드)에서 **모든 라이트 누적**
  - `u_numLights`만큼 루프 → 모바일은 24\~32개에서 프레임 유지 테스트
  - **조건 분기 최소화**: type별 분기는 상단에서 분기/공통 경로는 인라이닝

- **색 공간**:

  - CPU에서 팔레트 sRGB → Linear 변환(정확)
  - 셰이더 최종 출력만 sRGB 감마 적용

- **안정성**:

  - `u_numLights` 초과 입력 방지(클램프)
  - NaN 회피: 반경 최소값 보장(예: `max(radius, 1.0)`)

---

# 🧪 테스트 시나리오 (렌더링 품질)

1. **핫스폿 확인**: Hotspot 0.0↔0.6 변화 → 중심 과광 영역 크기 차이 명확
2. **Softness 확인**: Softness 0.0(하드) ↔ 1.0(소프트) 경계 품질
3. **Falloff 확인**: K 0.5↔4.0에서 거리 감쇠 체감
4. **HDR 체감**: 밝기 200→2000으로 증가 시 카메라 노출 자동 조정과 유사한 체감(노출 슬라이더로 보정)
5. **Additive 중첩**: 동일 색/서로 다른 색 라이트 겹침 시 색상 합성 자연스러움
6. **사각 라이트**: rectSize 비율 변경으로 **소프트박스 느낌** 재현, 회전 0도/45도 비교

---

# 🧭 확장 대비 훅

- **Bloom(Post Effect)**: `accum_linear`를 밝기 임계치로 분기 → 두 번째 패스에서 Gaussian blur 후 가산 합성
- **색온도 프리셋**: 3200K/5600K → sRGB 변환 테이블 준비(또는 CPU측 blackbody 근사)
- **HDR 디스플레이**: 캔버스→OS 브라우저 HDR 파이프라인 제약이 있으므로, 내부 HDR 유지 + 톤매핑/노출로 근사

---
