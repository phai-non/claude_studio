<!--
PR 작성 가이드 / PR Authoring Guide
- 한국어·영어 모두 환영합니다. / Either Korean or English is welcome.
- 제목은 Conventional Commits 형식: feat(scope): subject / fix(scope): subject
-->

## 요약 / Summary

<!-- 1~3줄로 변경의 동기와 결과를 적어주세요. / Describe motivation and outcome in 1–3 lines. -->

## 변경 사항 / Changes

- <!-- 핵심 변경 1 -->
- <!-- 핵심 변경 2 -->

## 관련 이슈 / Related Issues

<!-- 예: Fixes #123 · Relates to #456 -->

## 스크린샷 / Screenshots

<!--
UI 변경이 있다면 before / after 스크린샷을 첨부해주세요. 다크·라이트 모드 모두 권장.
For UI changes, attach before/after screenshots. Both dark and light themes preferred.
UI 변경이 없으면 "N/A". / Write "N/A" if no UI changes.
-->

## 체크리스트 / Checklist

- [ ] `bun run test` 통과 (vitest)
- [ ] `cd apps/desktop && bunx tsc --noEmit` 통과 (TypeScript strict)
- [ ] `cd apps/desktop/src-tauri && cargo clippy -- -D warnings` 통과 (warning 0)
- [ ] 커밋 메시지가 Conventional Commits 형식 (`feat`, `fix`, `refactor`, `docs`, `chore`, `style`)
- [ ] (UI 변경 시) 다크 / 라이트 테마 + ko / en 양쪽에서 확인
- [ ] (새 Rust 명령 추가 시) `src-tauri/src/lib.rs`의 `invoke_handler!`에 등록 + `src/lib/tauri.ts`에 타입 안전 래퍼 추가
