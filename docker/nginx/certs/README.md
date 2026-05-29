# TLS 인증서 배치 위치 (운영 환경)

운영(prod) HTTPS를 켜려면 **사내 CA 인증서 2개**를 이 디렉터리에 넣으세요.
파일 이름을 아래와 똑같이 맞추면 nginx 설정(`../prod.conf`)을 건드릴 필요가 없어요.

> 💡 새로 발급받지 않아도 됩니다. 이 VM에서 이미 HTTPS 운영 중인 다른 프로젝트의
> 인증서가 pholex 도메인을 커버하면(와일드카드/SAN) 그걸 재사용할 수 있어요.
> 탐색·적합성 확인·연결 절차는 `ai-prompts/260529-1522-prod-https-deploy-verify.md` 참고.

| 파일 | 내용 |
|------|------|
| `pholex.crt` | **fullchain** — 서버 인증서 + 중간 CA 인증서를 이어붙인 것 |
| `pholex.key` | 개인키 (private key) |

## 주의

- **이 두 파일은 git에 커밋되지 않아요** (`.gitignore`로 제외됨). 키 유출 방지.
- `pholex.crt`는 반드시 **fullchain**이어야 해요. 서버 인증서만 넣고 중간 CA를 빠뜨리면
  일부 클라이언트에서 체인 검증에 실패할 수 있어요.
- 브라우저 경고 없이 쓰려면 **사내 루트 CA가 사용자 단말에 신뢰 등록**돼 있어야 해요
  (보통 그룹정책으로 배포됨 — 인프라/보안팀 영역).
- 이름이 다르게 발급됐다면 파일명을 바꾸거나, `../prod.conf`의
  `ssl_certificate` / `ssl_certificate_key` 경로를 실제 파일명으로 수정하세요.

## fullchain 만드는 법 (참고)

발급물이 서버 인증서(`server.crt`)와 중간 CA(`intermediate.crt`)로 따로 왔다면:

```sh
cat server.crt intermediate.crt > pholex.crt   # 서버 → 중간 순서
cp server.key pholex.key
```
