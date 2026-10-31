# 원격 브랜치 보존·정리 기록 (2026-10-31)

저장소: `dohyunkimmm/mosigo`

아래 브랜치는 2026-10-31 기준 main과 비교했습니다. 브랜치를 단순 삭제하지 않고 **원래 HEAD 커밋을 같은 이름의 `archive/20261031/...` 태그로 보존한 다음** 브랜치 참조만 삭제하도록 자동화합니다.

| 기존 브랜치 | 삭제 전 고유 커밋 수 | 보존 태그 | HEAD SHA |
| --- | ---: | --- | --- |
| `chore/prune-unreferenced-demo-videos-20261010` | 0 | `archive/20261031/chore/prune-unreferenced-demo-videos-20261010` | `ac57a19f212aa30cf6c018a5b540d19be54b45b0` |
| `fix/share-viewer-action-guard-20261027` | 7 | `archive/20261031/fix/share-viewer-action-guard-20261027` | `4e4020744ed969d624b23ac09afba3322109eee5` |

## 안전 조건

- 정리 직전 HEAD가 위 SHA와 정확히 같지 않으면 삭제하지 않습니다.
- 열린 PR이 있으면 삭제하지 않습니다.
- 보존 태그 생성 뒤 같은 SHA임이 검증되지 않으면 삭제하지 않습니다.
- `main`, 제품 파일, 과거 커밋 자체는 삭제하지 않습니다.
- 복원할 때는 `archive/20261031/<기존 브랜치>` 태그에서 새 브랜치를 만들 수 있습니다.
- 태그로 보존했다고 해서 미병합 코드를 현재 `main`에 적용하는 것은 아닙니다.
- 작업 로그는 GitHub Actions **Retire audited branches (one time)**에서 확인합니다.
