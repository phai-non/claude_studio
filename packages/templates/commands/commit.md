---
description: Conventional Commits 형식으로 커밋을 만든다
allowed-tools: [Bash, Read]
---

다음 단계로 커밋을 작성한다:

1. `git status` 와 `git diff --staged` 로 스테이징된 변경을 확인한다.
2. 변경의 성격(feat/fix/refactor/docs/test/chore)을 판단한다.
3. 다음 형식으로 메시지를 작성한다:

   ```
   <type>(<scope>): <subject>

   <body>
   ```

   - subject: 50자 이내, 명령형 어조 ("add", "fix")
   - body: 왜(why) 변경했는지 설명. 각 줄 72자 이내.

4. `$ARGUMENTS`가 있으면 subject 힌트로 사용한다.
5. `git commit -m` 으로 커밋한 뒤 결과를 보고한다.
