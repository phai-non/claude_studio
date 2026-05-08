---
description: 지정된 코드를 사람에게 설명한다
argument-hint: <file-or-symbol>
allowed-tools: [Read, Grep, Glob]
---

`$ARGUMENTS`로 지정된 대상을 설명한다:

1. 대상이 파일 경로면 Read로 읽고, 심볼명이면 Grep으로 찾는다.
2. 다음 4가지 관점에서 설명한다:
   - **무엇을 하는가** (What): 한 문장 요약
   - **왜 존재하는가** (Why): 어떤 문제를 푸는가
   - **어떻게 동작하는가** (How): 핵심 흐름 3-5줄
   - **주의점** (Caveats): 엣지 케이스, 가정, 의존성
3. 코드를 그대로 인용하지 말고 의미 단위로 풀어 쓴다.
