# 제안 (MVP에 넣을 최소 사양)

- **드래그 이동 가능 오버레이 패널**

  - 헤더(패널 상단 바)만 드래그 가능
  - **화면 밖으로 못 나가게** 경계 제한
  - **좌/우 가장자리 스냅(도킹)**: 가장자리에 가까우면 착 붙게
  - **z-index 고정**: 캔버스 위에 떠 있으나 캔버스 크기/좌표 **변경 없음**
  - **위치 기억**: 로컬 스토리지에 저장, 재진입 시 복원
  - 단축키로 **표시/숨김 토글** (숨기면 선택 해제는 유지)

> 이렇게 하면 “패널 숨김 시 좌표가 바뀌는 문제”도 해결됩니다. 캔버스는 항상 풀스크린 고정, 패널만 떠다니는 구조니까요.

---

# 구현 포인트 (간단 스펙)

- CSS: `position: fixed;` + `transform: translate(...)` (GPU 가속으로 부드럽게)
- 드래그: `pointerdown/move/up` 또는 `drag` 라이브러리 사용
- 성능: `requestAnimationFrame`으로 위치 업데이트(스로틀)
- 접근성: 단축키 토글(`P`), 포커스 트랩(패널 열렸을 때 키보드 포커스 갇히지 않도록)
- 안전영역: 상단/하단 상태바, 노치(모바일) 고려해 최소 마진 유지

간단 예시(개념):

```js
const panel = document.querySelector("#panel");
let sx,
  sy,
  px = 20,
  py = 20; // saved pos
panel.style.transform = `translate(${px}px, ${py}px)`;

panel.querySelector(".header").addEventListener("pointerdown", (e) => {
  sx = e.clientX - px;
  sy = e.clientY - py;
  const move = (ev) => {
    px = Math.min(
      window.innerWidth - panel.offsetWidth,
      Math.max(0, ev.clientX - sx)
    );
    py = Math.min(
      window.innerHeight - panel.offsetHeight,
      Math.max(0, ev.clientY - sy)
    );
    panel.style.transform = `translate(${px}px, ${py}px)`;
  };
  const up = () => {
    // 스냅
    if (px < 40) px = 0;
    if (window.innerWidth - (px + panel.offsetWidth) < 40)
      px = window.innerWidth - panel.offsetWidth;
    panel.style.transform = `translate(${px}px, ${py}px)`;
    localStorage.setItem("panelPos", JSON.stringify({ px, py }));
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});
```

---

# PRD 업데이트

## (MVP 추가)

| 기능                           | 설명                                                                                  | 난이도 | 우선순위 |
| ------------------------------ | ------------------------------------------------------------------------------------- | ------ | -------- |
| **패널 드래그/도킹(오버레이)** | 패널을 화면 위 오버레이로 드래그 이동, 좌/우 스냅, 화면 밖 이동 방지, 위치 저장(로컬) | 보통   | 상       |
| **패널 토글 시 좌표 불변**     | 패널 표시/숨김과 무관하게 **캔버스 크기/좌표계 고정** (패널은 오버레이로 처리)        | 쉬움   | 상       |

## (확장)

| 기능                        | 설명                                                  | 난이도 | 우선순위 |
| --------------------------- | ----------------------------------------------------- | ------ | -------- |
| **패널 리사이즈**           | 하단/우측 핸들로 크기 조절                            | 보통   | 하       |
| **멀티 패널/도킹 레이아웃** | 속성/리스트/프리셋 패널 분리, 화면 가장자리 도킹 레일 | 어려움 | 하       |
| **세이프 존/가이드라인**    | 패널/라이트가 가리지 말아야 할 안전 영역 정의 및 스냅 | 보통   | 하       |

---
